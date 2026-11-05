import type { NodeRenderInput } from "../types.js";
import { baseStyle, dataAttrs, esc } from "../utils.js";

// animation 节点渲染（DragonBonesAni 等骨骼动画组件，P1-A）：透明标注占位
// 动画内容静态不可还原（骨骼数据运行时驱动），不虚线噪音化也不静默空白：
// 半透明标注框 + 动画名标签，明确标出动画所在位置与 fileName。
// 无显式尺寸时用名义尺寸 96x96（真实包围盒由运行时骨骼决定，静态不可知）。
export function renderAnimationNode(input: NodeRenderInput): string {
  const { node, ctx } = input;
  const attrs = dataAttrs(node, ctx.scene.file);
  const b = node.bounds;
  const a = node.native.attributes;
  const style = [
    baseStyle(node),
    b?.width === undefined ? "width:96px" : "",
    b?.height === undefined ? "height:96px" : "",
    "border:1px dashed rgba(0,229,255,.5)",
    "background:rgba(0,229,255,.06)",
  ].filter(Boolean).join(";");
  const fileName = a.fileName ?? "";
  const aniName = a.animationName ?? "";
  return `<div ${attrs} class="egret-node egret-anim" style="${style}" title="动画占位: ${esc(fileName)} / ${esc(aniName)}（骨骼动画静态不可还原）"><span style="position:absolute;left:0;top:-14px;font-size:10px;color:#00e5ff;white-space:nowrap;background:rgba(0,0,0,.45);padding:0 2px">[动画] ${esc(fileName || node.native.className)}</span></div>`;
}
