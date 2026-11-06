import path from "node:path";
import type { SceneDocument, SceneNode } from "../scene/scene-builder.js";
import { selectorScript } from "../selection/component-selector.js";
import { renderGroupNode } from "./nodes/group-node.js";
import { renderImageNode } from "./nodes/image-node.js";
import { renderLabelNode } from "./nodes/label-node.js";
import { renderButtonNode } from "./nodes/button-node.js";
import { renderRectNode } from "./nodes/rect-node.js";
import { renderScrollerNode } from "./nodes/scroller-node.js";
import { renderAnimationNode } from "./nodes/animation-node.js";
import { renderBitmapNumberNode } from "./nodes/bitmapnumber-node.js";
import type { NodeRenderer, RenderContext, UnsupportedItem } from "./types.js";
import { baseStyle, dataAttrs, esc } from "./utils.js";

// 场景树 -> 静态 HTML 渲染器（入口，P0-E）
// 本文件只做：按类型分发到 nodes/<类型>-node.ts -> 未支持占位容器渲染 -> 整页编排（未支持清单 / 选择器）
// 每种节点类型的映射规则一类型一文件，禁止把节点渲染逻辑写进本文件。

export type { RenderContext, UnsupportedItem } from "./types.js";

export interface RenderOptions {
  /** 纯净模式：无信息栏/选择器脚本/内边距，专供截图对比与 MCP 截图 */
  bare?: boolean;
}

/** 节点类型 -> 渲染器注册表（新增类型：在 nodes/ 加文件并在此注册） */
const RENDERERS: Record<string, NodeRenderer> = {
  group: renderGroupNode,
  // 自定义容器组件（EmptyBtn 等，P1-A container 语义）：与 group 同构，复用渲染器
  container: renderGroupNode,
  image: renderImageNode,
  label: renderLabelNode,
  button: renderButtonNode,
  rect: renderRectNode,
  scroller: renderScrollerNode,
  animation: renderAnimationNode,
  bitmapnumber: renderBitmapNumberNode,
};

/** 按占位容器渲染的类型（识别但未支持运行时行为：保留子树可见，样式降级）
 *  无渲染器的类型（custom 等）自动落入占位分支 */
const PLACEHOLDER_TYPES = new Set(["list", "datagroup", "bitmaplabel", "editabletext"]);

/** 递归渲染节点；未知/未支持类型渲染为虚线占位容器（保留子节点，不静默丢失） */
function renderNode(node: SceneNode, ctx: RenderContext): string {
  if (node.type === "skin") {
    // 根节点本身不产生额外 DOM，直接渲染子节点（舞台尺寸在 stage 容器上）
    if (node === ctx.scene.root) {
      return node.children.map((c) => renderNode(c, ctx)).join("\n    ");
    }
    // 非根皮肤包装层（Button 内联 skinName / 展开皮肤根）：发标记层 DOM，
    // 回写器据 class=egret-skin-wrap 重建 e:skinName/e:Skin 结构（否则内联皮肤包装丢失）
    const skinAttrs = dataAttrs(node, ctx.scene.file);
    return `<div class="egret-skin-wrap" ${skinAttrs} style="position:absolute;left:0;top:0;width:100%;height:100%">\n    ${node.children.map((c) => renderNode(c, ctx)).join("\n    ")}\n    </div>`;
  }
  if (node.unsupported.length) {
    for (const r of node.unsupported) ctx.unsupported.push({ nodeId: node.id ?? node.instancePath, reason: r });
  }
  const attrs = dataAttrs(node, ctx.scene.file);
  const style = baseStyle(node);

  const renderer = RENDERERS[node.type];
  if (renderer && !PLACEHOLDER_TYPES.has(node.type)) {
    return renderer({ node, ctx, renderChildren: (n) => n.children.map((c) => renderNode(c, ctx)).join("\n    ") });
  }

  // 占位容器：虚线框 + 子节点照常渲染（不静默丢失层级）
  const label = node.native.className;
  const inner = node.children.map((c) => renderNode(c, ctx)).join("\n    ");
  return `<div ${attrs} class="egret-node egret-placeholder" style="${style};border:1px dashed #faad14;background:rgba(250,173,20,.06)" title="${esc(label)}"><span style="position:absolute;left:0;top:0;font-size:10px;color:#faad14;background:rgba(0,0,0,.5);padding:0 2px;z-index:9999">${esc(label)}</span>${inner}</div>`;
}

/** 渲染场景为完整静态 HTML */
export function renderHtml(scene: SceneDocument, ctx: Omit<RenderContext, "unsupported">, options: RenderOptions = {}): string {
  const unsupported: UnsupportedItem[] = [];
  const fullCtx: RenderContext = { ...ctx, unsupported };
  const inner = renderNode(scene.root, fullCtx);

  const bare = options.bare === true;
  const listHtml = bare
    ? ""
    : unsupported.length
      ? `<div class="unsupported-list">未支持 ${unsupported.length} 项: ${unsupported
          .map((u) => `${esc(u.nodeId)}(${esc(u.reason)})`)
          .join("; ")}</div>`
      : "";

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>${esc(path.basename(scene.file))} - egret-exml-html-renderer</title>
<style>
body { background:#2b2b2b; margin:0; padding:${bare ? 0 : 16}px; font-family:sans-serif; }
.egret-stage { position:relative; background:#5a5a5a; overflow:hidden; }
.egret-node { position:absolute; box-sizing:border-box; }
img.egret-node { padding:0; border:none; }
.egret-selected { outline:2px solid #ffd666 !important; box-shadow:0 0 10px #ffd666 !important; z-index:9998; }
.egret-hover { outline:2px solid #4a9eff !important; z-index:9997; } /* 悬停临时提示（蓝框）：不触发选择，与选中（金框）视觉区分 */
.egret-tooltip { position:fixed; background:rgba(20,30,45,.92); color:#cfe6ff; border:1px solid #4a9eff; border-radius:3px; padding:3px 8px; font-size:12px; pointer-events:none; z-index:10001; max-width:340px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
#egret-info { position:fixed; left:0; top:0; right:0; background:rgba(0,0,0,.78); color:#8ee6ff; padding:6px 12px; font-size:12px; z-index:10000; }
.unsupported-list { position:fixed; left:0; bottom:0; right:0; background:rgba(0,0,0,.78); color:#ffd666; padding:6px 12px; font-size:12px; max-height:140px; overflow:auto; z-index:10000; }
</style>
</head>
<body>
${bare ? "" : '<div id="egret-info">点击画布中的节点查看定位信息</div>'}
${listHtml}
<div class="egret-stage" data-egret-src="${esc(scene.file.split("\\").join("/"))}" data-egret-key="${esc(scene.root.stableKey)}" data-egret-tag="${esc(scene.root.native.tag)}" data-egret-class="${esc(scene.root.native.className)}" data-egret-attrs="${esc(JSON.stringify(scene.root.native.attributes))}"${scene.root.layout ? ` data-egret-layout="${esc(JSON.stringify(scene.root.layout))}"` : ""} style="width:${scene.stage.width ?? 640}px;height:${scene.stage.height ?? 480}px">
    ${inner}
</div>
${bare ? "" : `<script>${selectorScript()}</script>`}
</body>
</html>
`;
}
