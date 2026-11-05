import type { NodeRenderInput } from "../types.js";
import { baseStyle, dataAttrs } from "../utils.js";

// scroller 节点渲染（e:Scroller，P1-A 容器化）：裁剪容器
// 静态渲染无滚动交互（scrollPolicy/手势忽略），只保留 overflow:hidden 视口裁剪语义；
// 子节点为视口内容，坐标相对 scroller。
export function renderScrollerNode(input: NodeRenderInput): string {
  const { node, ctx, renderChildren } = input;
  const attrs = dataAttrs(node, ctx.scene.file);
  return `<div ${attrs} class="egret-node egret-scroller" style="${baseStyle(node)};overflow:hidden">${renderChildren(node, ctx)}</div>`;
}
