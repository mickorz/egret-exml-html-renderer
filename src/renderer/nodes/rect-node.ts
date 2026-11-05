import type { NodeRenderInput } from "../types.js";
import { baseStyle, colorCss, dataAttrs, esc } from "../utils.js";

// rect 节点渲染（e:Rect）：填充色/透明度/描边/圆角
// ellipseWidth/Height 为圆角椭圆直径语义（Egret drawRoundRect），CSS border-radius 取半径（直径的一半）

export function renderRectNode(input: NodeRenderInput): string {
  const { node, ctx } = input;
  const a = node.attrs;
  const attrs = dataAttrs(node, ctx.scene.file);
  const style = [baseStyle(node)];

  if (a.fillColor !== undefined) {
    const base = colorCss(a.fillColor, "#000000");
    const alpha = (a.fillAlpha as number) ?? 1;
    // fillColor + fillAlpha：把 alpha 并入 rgba（fillAlpha=0 即全透明底）
    if (base.startsWith("#")) {
      const r = parseInt(base.slice(1, 3), 16);
      const g = parseInt(base.slice(3, 5), 16);
      const b = parseInt(base.slice(5, 7), 16);
      style.push(`background:rgba(${r},${g},${b},${alpha})`);
    } else {
      style.push(`background:${base}`);
    }
  }
  if (a.strokeColor !== undefined) {
    const weight = (a.strokeWeight as number) ?? 1;
    const strokeAlpha = (a.strokeAlpha as number) ?? 1;
    const base = colorCss(a.strokeColor, "#000000");
    if (base.startsWith("#") && strokeAlpha !== 1) {
      const r = parseInt(base.slice(1, 3), 16);
      const g = parseInt(base.slice(3, 5), 16);
      const b = parseInt(base.slice(5, 7), 16);
      style.push(`border:${weight}px solid rgba(${r},${g},${b},${strokeAlpha})`);
    } else {
      style.push(`border:${weight}px solid ${base}`);
    }
    // border 计入盒子尺寸（EUI stroke 是中心线描边，box-sizing content-box 下近似）
  }
  if (a.ellipseWidth !== undefined || a.ellipseHeight !== undefined) {
    const rx = a.ellipseWidth !== undefined ? Number(a.ellipseWidth) / 2 : 0;
    const ry = a.ellipseHeight !== undefined ? Number(a.ellipseHeight) / 2 : 0;
    style.push(`border-radius:${rx}px/${ry}px`);
  }

  return `<div ${attrs} class="egret-node egret-rect" style="${style.join(";")}"></div>`;
}
