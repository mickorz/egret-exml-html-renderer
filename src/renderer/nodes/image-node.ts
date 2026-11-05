import type { NodeRenderInput } from "../types.js";
import { baseStyle, dataAttrs, esc, frameBackgroundStyle, nineSliceFramePieces, nineSliceStyle } from "../utils.js";

// image 节点渲染（e:Image）：普通图 <img>；图集子图 -> 背景裁切；九宫格 -> 直接图 border-image / 图集子图九片背景
// fillMode：scale（缺省，拉伸至尺寸）/ repeat（平铺）/ clip（裁切左上）

export function renderImageNode(input: NodeRenderInput): string {
  const { node, ctx } = input;
  const attrs = dataAttrs(node, ctx.scene.file);
  const asset = node.asset;
  const style = [baseStyle(node)];

  if (!asset) {
    // 资源解析失败或 source 缺失（运行时数据绑定）：虚线空占位（构建期已记 unsupported，不允许伪装成功/隐形）
    if (node.bounds.width !== undefined && node.bounds.height === undefined) style.push(`height:${node.bounds.width}px`);
    style.push("border:1px dashed #e0642c");
    return `<div ${attrs} class="egret-node egret-missing" style="${style.join(";")}" title="${esc(String(node.attrs.source ?? "source 缺失（运行时数据绑定）"))}"></div>`;
  }

  const grid = node.attrs.scale9Grid as string | undefined;
  const fillMode = (node.attrs.fillMode as string) ?? "scale";

  // 九宫格优先：直接图用 border-image；图集子图用九片背景（border-image 无法子矩形切片）
  if (grid) {
    const bw = node.bounds.width ?? (asset.kind === "frame" ? asset.frame.sourceW || asset.frame.w : 0);
    const bh = node.bounds.height ?? (asset.kind === "frame" ? asset.frame.sourceH || asset.frame.h : 0);
    if (asset.kind === "frame" && bw > 0 && bh > 0) {
      const pieces = nineSliceFramePieces(ctx.toAssetUrl(asset.file), asset.frame, grid, bw, bh);
      if (pieces) {
        style.push("overflow:hidden");
        return `<div ${attrs} class="egret-node egret-nineslice" style="${style.join(";")}">${pieces}</div>`;
      }
    } else {
      const nine = nineSliceStyle(node, ctx);
      if (nine) {
        style.push(nine);
        return `<div ${attrs} class="egret-node" style="${style.join(";")}"></div>`;
      }
    }
    // 九宫格渲染失败：回退整图并上报
    ctx.unsupported.push({ nodeId: node.id ?? node.instancePath, reason: `scale9Grid="${grid}" 九宫格渲染失败，按整图拉伸回退` });
  }

  if (asset.kind === "file") {
    const natural = ctx.resolver?.imageSize(asset.file);
    if (node.bounds.width === undefined && natural) style.push(`width:${natural.width}px`);
    if (node.bounds.height === undefined && natural) style.push(`height:${natural.height}px`);
    if (fillMode === "repeat") {
      // 平铺：背景图 repeat
      style.push(`background:url('${ctx.toAssetUrl(asset.file)}') repeat`);
      return `<div ${attrs} class="egret-node" style="${style.join(";")}"></div>`;
    }
    if (fillMode === "clip") {
      // 裁切：不缩放不平铺，超出部分裁掉
      style.push(`background:url('${ctx.toAssetUrl(asset.file)}') no-repeat;overflow:hidden`);
      return `<div ${attrs} class="egret-node" style="${style.join(";")}"></div>`;
    }
    // scale：img 拉伸至 bounds（未指定尺寸时用图原生尺寸）
    return `<img ${attrs} src="${esc(ctx.toAssetUrl(asset.file))}" class="egret-node" style="${style.join(";")}" alt="">`;
  }

  // 图集子图：帧背景裁切；缺尺寸时用帧原始尺寸（sourceW/sourceH 优先于 w/h，对齐 Egret 纹理语义）
  const f = asset.frame;
  if (node.bounds.width === undefined) style.push(`width:${f.sourceW || f.w}px`);
  if (node.bounds.height === undefined) style.push(`height:${f.sourceH || f.h}px`);
  style.push(frameBackgroundStyle(asset.file, ctx, f));
  if (fillMode === "repeat" || fillMode === "clip") {
    // 子图平铺/裁切：P0 按裁切处理并上报（背景区域裁切无法用单 background 表达平铺语义）
    style.push("overflow:hidden");
    if (fillMode === "repeat") {
      ctx.unsupported.push({ nodeId: node.id ?? node.instancePath, reason: "image fillMode=repeat 图集子图暂按 clip 处理" });
    }
  }
  return `<div ${attrs} class="egret-node" style="${style.join(";")}"></div>`;
}
