import type { NodeRenderInput } from "../types.js";
import { baseStyle, dataAttrs, esc, frameBackgroundStyle } from "../utils.js";

// bitmapnumber 节点渲染（ArtNumberEUI 等 prefix 位图数字组件，P1-C）
// 组件语义：prefix + 字符 + "_png" 从图集取帧逐位拼合（调研结论：推进宽=sourceW，
// 数字高=sourceH，trim 偏移 offX/offY 由帧背景修正；底对齐靠统一 sourceH）。
// 运行时数值未知（工程内 280 处实例均无静态 text）——按示例值 "8888" 静态模拟，
// 构建期已标记 simulated 并上报 unsupported；某位帧缺失时跳过该位并上报，不静默。

/** 静态模拟示例值（运行时数值未知） */
const SAMPLE_TEXT = "8888";

export function renderBitmapNumberNode(input: NodeRenderInput): string {
  const { node, ctx } = input;
  const attrs = dataAttrs(node, ctx.scene.file);
  const style = [baseStyle(node)];
  const prefix = String(node.native.attributes.prefix ?? "");
  const sample = String(node.attrs.text ?? SAMPLE_TEXT);

  if (!prefix || !ctx.resolver) {
    // 无 prefix / 无资源解析器：无法拼位图，回退占位并上报
    ctx.unsupported.push({ nodeId: node.id ?? node.instancePath, reason: `位图数字缺少 prefix（prefix="${prefix}"），无法拼合` });
    style.push("border:1px dashed #e0642c");
    return `<div ${attrs} class="egret-node egret-placeholder" style="${style.join(";")}"></div>`;
  }

  const exmlFile = node.srcFile ?? ctx.scene.file;
  const spans: string[] = [];
  let x = 0;
  for (const ch of sample) {
    const src = `${prefix}${ch}_png`;
    const hit = ctx.resolver.resolve(src, { exmlFile });
    if (!hit || hit.kind !== "frame") {
      ctx.unsupported.push({ nodeId: node.id ?? node.instancePath, reason: `位图数字帧 ${src} 解析失败，该位跳过` });
      continue;
    }
    const f = hit.frame;
    // 每位一个帧背景片：尺寸 sourceW x sourceH，内容按 offX/offY 落位；推进宽 = sourceW
    spans.push(
      `<span style="position:absolute;left:${x}px;top:0;width:${f.sourceW}px;height:${f.sourceH}px;${frameBackgroundStyle(hit.file, ctx, f)}"></span>`,
    );
    x += f.sourceW;
  }
  return `<div ${attrs} class="egret-node egret-bitmapnumber" style="${style.join(";")}">${spans.join("")}</div>`;
}
