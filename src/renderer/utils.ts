import type { SceneNode } from "../scene/scene-builder.js";
import { egretColorToCss } from "../parser/exml/exml-attributes.js";
import type { RenderContext } from "./types.js";

// 渲染共享工具：HTML 转义 / 通用样式 / data-egret 溯源属性 / 图集背景 / 九宫格

/** HTML 转义（属性值与文本内容共用） */
export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** EUI 颜色值（0xRRGGBB 等）-> CSS 颜色；非法返回 fallback */
export function colorCss(v: unknown, fallback: string): string {
  const c = egretColorToCss(typeof v === "string" ? v : undefined);
  return c ?? fallback;
}

/** 通用几何/视觉样式：绝对定位 + 尺寸 + 透明度 + 旋转/缩放（锚点 transform-origin） */
export function baseStyle(node: SceneNode): string {
  const b = node.bounds;
  const a = node.attrs;
  // 自身尺寸未知时的居中约束（构建期标记 _centerH/_centerV）：CSS 百分比位移实现，偏移量并入 calc
  const parts = [
    a._centerH !== undefined ? "left:50%" : a._right !== undefined ? `right:${a._right}px` : `left:${b?.x ?? 0}px`,
    a._centerV !== undefined ? "top:50%" : `top:${b?.y ?? 0}px`,
  ];
  if (b?.width !== undefined) parts.push(`width:${b.width}px`);
  if (b?.height !== undefined) parts.push(`height:${b.height}px`);
  if (a.anchorOffsetX !== undefined || a.anchorOffsetY !== undefined) {
    parts.push(`transform-origin:${a.anchorOffsetX ?? 0}px ${a.anchorOffsetY ?? 0}px`);
  }
  const t: string[] = [];
  if (a._centerH !== undefined) t.push(`translateX(calc(-50% + ${a._centerH}px))`);
  if (a._centerV !== undefined) t.push(`translateY(calc(-50% + ${a._centerV}px))`);
  if (a.rotation !== undefined && a.rotation !== 0) t.push(`rotate(${a.rotation}deg)`);
  const sx = a.scaleX !== undefined ? Number(a.scaleX) : 1;
  const sy = a.scaleY !== undefined ? Number(a.scaleY) : 1;
  if (sx !== 1 || sy !== 1) t.push(`scale(${sx},${sy})`);
  if (t.length) parts.push(`transform:${t.join(" ")}`);
  if (a.alpha !== undefined && a.alpha !== 1) parts.push(`opacity:${a.alpha}`);
  if (a.visible === false) parts.push("display:none");
  return parts.join(";");
}

/** 节点溯源 data 属性（E4 DOM 语义标识，选择器与 MCP 查询共用；含组件语义/展开源/静态模拟溯源，P1-B） */
export function dataAttrs(node: SceneNode, sceneFile: string): string {
  // 展开子树溯源到源组件 EXML（五元组：源文件/class/实例路径/stableKey/静态模拟标记）
  const src = (node.srcFile ?? sceneFile).split("\\").join("/");
  const parts = [
    `data-egret-id="${esc(node.id ?? "")}"`,
    `data-egret-name="${esc(node.name ?? "")}"`,
    `data-egret-type="${esc(node.type)}"`,
    `data-egret-path="${esc(node.instancePath)}"`,
    `data-egret-key="${esc(node.stableKey)}"`,
    `data-egret-src="${esc(src)}"`,
  ];
  if (node.component) {
    parts.push(`data-egret-component="${esc(node.component.identity)}"`);
    parts.push(`data-egret-component-kind="${esc(node.component.kind)}"`);
  }
  if (node.simulated) parts.push(`data-egret-simulated="1"`);
  return parts.join(" ");
}

/**
 * 图集帧背景样式：帧矩形裁切（background-position 负偏移，offX/offY 修正 Trim 偏移）。
 * 返回 background 相关 CSS 片段（不含尺寸，尺寸由布局层决定）。
 */
export function frameBackgroundStyle(atlasFile: string, ctx: RenderContext, frame: { x: number; y: number; w: number; h: number; offX: number; offY: number }): string {
  const url = ctx.toAssetUrl(atlasFile);
  // 单引号：style 属性由双引号包裹，CSS url 内用单引号避免截断 HTML 属性
  return `background:url('${url}') no-repeat;background-position:${frame.offX - frame.x}px ${frame.offY - frame.y}px`;
}

/**
 * 九宫格样式（scale9Grid -> border-image，含 fill 关键字，中心拉伸）。仅适用于直接图片文件。
 * 资源/尺寸不满足时返回 null（调用方回退整图渲染）。
 */
export function nineSliceStyle(
  node: SceneNode,
  ctx: RenderContext,
): string | null {
  const grid = node.attrs.scale9Grid as string | undefined;
  const asset = node.asset;
  if (!grid || !asset || asset.kind !== "file") return null;
  const parts = grid.split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [gx, gy, gw, gh] = parts;

  // 九宫分量可能超出子图边界（1px 分隔线等），clamp 到 0
  const size = ctx.resolver?.imageSize(asset.file);
  const w = size?.width;
  const h = size?.height;
  if (!w || !h) return null;
  const sliceLeft = gx;
  const sliceTop = gy;
  const sliceRight = Math.max(0, w - gx - gw);
  const sliceBottom = Math.max(0, h - gy - gh);
  // CSS border-image-width 顺序 top right bottom left：右/下必须用对应边缘分量，非对称九宫格才正确
  const widthExpr = `${clampG(sliceTop, h)}px ${clampG(sliceRight, w)}px ${clampG(sliceBottom, h)}px ${clampG(sliceLeft, w)}px`;
  const url = ctx.toAssetUrl(asset.file);
  return [
    `border-image-source:url('${url}')`,
    // fill 关键字：CSS border-image 默认不画中心，EUI scale9Grid 画中心（中心拉伸）
    `border-image-slice:${sliceTop} ${sliceRight} ${sliceBottom} ${sliceLeft} fill`,
    `border-image-width:${widthExpr}`,
    "border-image-repeat:stretch",
  ].join(";");
}

function clampG(v: number, max: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(Math.max(v, 0), max);
}

/**
 * 图集子图九宫格：9 个绝对定位背景片（border-image 无法子矩形切片：整图集坐标做 slice 会把四角区域
 * 挤成邻居精灵，实测出彩色条纹）。每片对源子矩形做独立背景缩放定位。
 * EUI scale9Grid 语义与 Flash 一致：grid 矩形是可拉伸的中心区，四角固定尺寸。
 */
export function nineSliceFramePieces(
  url: string,
  frame: { x: number; y: number; w: number; h: number },
  grid: string,
  boxW: number,
  boxH: number,
): string {
  const g = grid.split(",").map(Number);
  if (g.length !== 4 || g.some((n) => !Number.isFinite(n))) return "";
  const [gx, gy, gw, gh] = g;
  const { x: fx, y: fy, w: fw, h: fh } = frame;
  // 源图九分：左中右列宽 / 上中下行高（grid 矩形为中心区）
  const colW = [gx, gw, fw - gx - gw];
  const rowH = [gy, gh, fh - gy - gh];
  // 目标九分：列/行中段被拉伸（盒尺寸不足时 clamp 到 0）
  const colT = [gx, Math.max(0, boxW - gx - (fw - gx - gw)), fw - gx - gw];
  const rowT = [gy, Math.max(0, boxH - gy - (fh - gy - gh)), fh - gy - gh];
  const pieces: string[] = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const sw = colW[c];
      const sh = rowH[r];
      const tw = colT[c];
      const th = rowT[r];
      if (sw <= 0 || sh <= 0 || tw <= 0 || th <= 0) continue;
      const sx = tw / sw;
      const sy = th / sh;
      const srcX = fx + colW.slice(0, c).reduce((a, b) => a + b, 0);
      const srcY = fy + rowH.slice(0, r).reduce((a, b) => a + b, 0);
      const dstX = colT.slice(0, c).reduce((a, b) => a + b, 0);
      const dstY = rowT.slice(0, r).reduce((a, b) => a + b, 0);
      pieces.push(
        `<span style="position:absolute;left:${dstX}px;top:${dstY}px;width:${tw}px;height:${th}px;` +
          `background:url('${url}') no-repeat;background-size:${atlasScaled(sw, sx)}px ${atlasScaled(sh, sy)}px;` +
          `background-position:${atlasScaled(srcX, sx)}px ${atlasScaled(srcY, sy)}px"></span>`,
      );
    }
  }
  return pieces.join("");
}

/** 背景缩放后的偏移/尺寸（非整数时保留两位，避免 background-size 取整抖动） */
function atlasScaled(v: number, scale: number): string {
  const n = v * scale;
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}
