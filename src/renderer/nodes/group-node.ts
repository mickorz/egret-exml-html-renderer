import type { NodeRenderInput } from "../types.js";
import { baseStyle, dataAttrs } from "../utils.js";

// group 节点渲染（e:Group）：坐标系容器（子节点坐标相对组定位），自身无视觉
export function renderGroupNode(input: NodeRenderInput): string {
  const { node, ctx, renderChildren } = input;
  const attrs = dataAttrs(node, ctx.scene.file);
  return `<div ${attrs} class="egret-node egret-group" style="${baseStyle(node)}">${renderChildren(node, ctx)}</div>`;
}
