import type { NodeRenderInput } from "../types.js";
import { baseStyle, colorCss, dataAttrs, esc } from "../utils.js";

// label 节点渲染（e:Label）：字号/字体/颜色/描边/对齐
// Egret TextField 缺省字号 30；无宽度时单行自适应（white-space nowrap），有宽度时按宽换行

export function renderLabelNode(input: NodeRenderInput): string {
  const { node, ctx } = input;
  const a = node.attrs;
  const attrs = dataAttrs(node, ctx.scene.file);
  const style = [baseStyle(node)];

  const fontSize = (a.fontSize as number) ?? 30;
  style.push(`font-size:${fontSize}px`);
  if (a.fontFamily) style.push(`font-family:${esc(String(a.fontFamily))}, "Microsoft YaHei", sans-serif`);
  // 行高近似：字号 x 1.25 + 行距（Egret 排版近似值，P0 不做精确位图排版）
  style.push(`line-height:${Math.round(fontSize * 1.25 + ((a.lineSpacing as number) ?? 0))}px`);
  style.push(`color:${colorCss(a.textColor, "#000000")}`);
  if (a.bold === true) style.push("font-weight:bold");
  if (a.italic === true) style.push("font-style:italic");
  if (a.stroke !== undefined && a.strokeColor !== undefined) {
    // Egret stroke 是向外描边，CSS -webkit-text-stroke 居中口径，2 倍近似向外描边
    style.push(`-webkit-text-stroke:${Number(a.stroke) * 2}px ${colorCss(a.strokeColor, "#000000")}`);
  }
  // 对齐：textAlign 需要宽度生效；verticalAlign 用 flex 列布局
  if (a.textAlign) style.push(`text-align:${String(a.textAlign)}`);
  if (a.verticalAlign) {
    const justify = { top: "flex-start", middle: "center", bottom: "flex-end" }[String(a.verticalAlign)];
    if (justify) style.push("display:flex", "flex-direction:column", `justify-content:${justify}`);
  }
  // 换行策略：无宽度单行自适应；有宽度按宽换行并裁切
  if (node.bounds.width === undefined) style.push("white-space:nowrap");
  else {
    style.push("white-space:pre-wrap", "overflow:hidden");
    if (a.maxWidth !== undefined) style.push(`max-width:${a.maxWidth}px`);
  }

  const text = typeof a.text === "string" ? esc(a.text) : "";
  return `<div ${attrs} class="egret-node egret-label" style="${style.join(";")}">${text}</div>`;
}
