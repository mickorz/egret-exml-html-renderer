import type { NodeRenderInput } from "../types.js";
import { baseStyle, colorCss, dataAttrs, esc } from "../utils.js";

// button 节点渲染（e:Button）：基础视觉
// P0 策略：内联 skinName 皮肤（EXML 中 <e:Button><e:skinName><e:Skin>...）的子节点已在
// 构建期提升为 button 子节点，这里直接渲染子节点还原基础视觉；无皮肤时按占位容器渲染。
// label 属性（运行时注入 labelDisplay 的文本）渲染为居中文本叠加。

export function renderButtonNode(input: NodeRenderInput): string {
  const { node, ctx, renderChildren } = input;
  const a = node.attrs;
  const attrs = dataAttrs(node, ctx.scene.file);
  const style = [baseStyle(node)];

  const inner: string[] = [];
  // label 属性 -> 居中文本（无 labelDisplay 时的基础还原）
  if (typeof a.label === "string" && a.label !== "") {
    inner.push(`<span style="position:absolute;left:0;top:0;right:0;bottom:0;display:flex;align-items:center;justify-content:center;font-size:30px;color:${colorCss(undefined, "#000000")}">${esc(a.label)}</span>`);
  }
  const children = renderChildren(node, ctx);
  if (!children && inner.length === 0) {
    // 无皮肤无 label：占位
    style.push("border:1px dashed #faad14;background:rgba(250,173,20,.08)");
  }
  return `<div ${attrs} class="egret-node egret-button" style="${style.join(";")}">${inner.join("")}${children}</div>`;
}
