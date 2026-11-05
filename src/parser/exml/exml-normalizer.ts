import type { ExmlDiagnostic, ExmlDocument, ExmlNode } from "./exml-types.js";
import { parseExmlFile, parseExmlText, EUI_NS } from "./exml-parser.js";
import { plainAttributes, stateAttributes } from "./exml-attributes.js";

// EXML 归一化（P0-B）：在语法树之上做轻量语义归类
//   - 识别 namespace 前缀对应的真实 URI（e 前缀必须是 EUI_NS 才算 EUI 组件，不做前缀字符串猜测）
//   - 跳过 Wing 编辑器元数据（w:Config / w:Declarations）
//   - 归类节点 kind：eui | wing | tween | custom | unknown
//   - 展开内联 skinName 子节点（e:skinName 的唯一子节点是内联 Skin）

export type NodeKind = "eui" | "wing" | "tween" | "custom" | "unknown";

/** 归一化节点：语法节点 + 语义归类结果 */
export interface NormalizedNode {
  raw: ExmlNode;
  kind: NodeKind;
  /** 解析出的 EUI 类名，如 "eui.Image"（仅 kind=eui）；custom 节点为自定义类名字符串 */
  className: string;
  /** 普通属性（无 state 后缀、无 xmlns） */
  attrs: Record<string, string>;
  /** state 后缀属性：state -> (属性 -> 值)，P0 只记录不应用 */
  states: Record<string, Record<string, string>>;
  /** 归一化后的有效子节点（已剔除 wing 元数据与 skinName 包装层） */
  children: NormalizedNode[];
  /** includeIn 属性原样（P0 只记录） */
  includeIn?: string;
  /** excludeIn 属性原样（P0 只记录） */
  excludeIn?: string;
}

/** 前缀 -> URI 查找：从节点自身声明的 xmlns 或文档级声明 */
function nsUri(doc: ExmlDocument, node: ExmlNode, prefix: string): string {
  // 节点自身（或祖先链）的 xmlns 声明优先；EXML 通常全声明在根
  let cur: ExmlNode | undefined = node;
  while (cur) {
    const uri = cur.attributes[`xmlns:${prefix}`];
    if (uri) return uri;
    cur = undefined; // P0：只查节点与文档两级（真实 EXML 均声明在根，祖先链展开需要父子回链，暂无必要）
  }
  return doc.namespace[prefix] ?? "";
}

/** 归类单个语法节点 */
function classify(doc: ExmlDocument, node: ExmlNode): { kind: NodeKind; className: string } {
  const uri = nsUri(doc, node, node.prefix);
  if (uri === EUI_NS) {
    return { kind: "eui", className: `eui.${node.localName}` };
  }
  if (uri === "http://ns.egret.com/wing") return { kind: "wing", className: `wing.${node.localName}` };
  if (uri === "http://ns.egret.com/tween") return { kind: "tween", className: `tween.${node.localName}` };
  if (uri) {
    // 自定义组件：namespace URI 通常是 "gdmj.*" / "*" / "Poker.*" 这类工程包通配
    return { kind: "custom", className: node.tag };
  }
  return { kind: "unknown", className: node.tag };
}

/** 递归归一化；wing 元数据整体跳过，tween 记录诊断后跳过 */
function normalize(doc: ExmlDocument, node: ExmlNode, diagnostics: ExmlDiagnostic[]): NormalizedNode | null {
  const { kind, className } = classify(doc, node);
  if (kind === "wing") return null; // Wing IDE 元数据不是 UI
  if (kind === "tween") {
    diagnostics.push({
      level: "warning",
      code: "EXML_TWEEN_UNSUPPORTED",
      message: `动画声明暂不支持: ${node.tag}`,
      nodeId: node.attributes.id,
    });
    return null;
  }
  const children: NormalizedNode[] = [];
  for (const child of node.children) {
    // e:skinName 是属性的内联写法：唯一子节点是内联 Skin，提升为普通子节点
    if (child.prefix === "e" && child.localName === "skinName") {
      const inlineSkin = child.children[0];
      if (inlineSkin) {
        const n = normalize(doc, inlineSkin, diagnostics);
        if (n) children.push(n);
      }
      continue;
    }
    const n = normalize(doc, child, diagnostics);
    if (n) children.push(n);
  }
  const attrs = plainAttributes(node);
  const states = stateAttributes(node);
  const out: NormalizedNode = { raw: node, kind, className, attrs, states, children };
  if (attrs.includeIn !== undefined) out.includeIn = attrs.includeIn;
  if (attrs.excludeIn !== undefined) out.excludeIn = attrs.excludeIn;
  return out;
}

/** 文档归一化入口 */
export function normalizeDocument(doc: ExmlDocument): { root: NormalizedNode; diagnostics: ExmlDiagnostic[] } {
  const diagnostics = [...doc.diagnostics];
  const root = normalize(doc, doc.root, diagnostics);
  if (!root) throw new Error(`EXML 根节点被归一化剔除（根必须是 e:Skin）: ${doc.file}`);
  return { root, diagnostics };
}

// 便于测试直接从文本走完整链路
export function normalizeExmlText(text: string, file?: string) {
  return normalizeDocument(parseExmlText(text, file));
}

export function normalizeExmlFile(file: string) {
  return normalizeDocument(parseExmlFile(file));
}

export { parseExmlFile, parseExmlText } from "./exml-parser.js";
export type { ExmlDocument, ExmlNode, ExmlDiagnostic } from "./exml-types.js";
