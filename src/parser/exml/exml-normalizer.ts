import type { ExmlDiagnostic, ExmlDocument, ExmlNode } from "./exml-types.js";
import { parseExmlFile, parseExmlText, EUI_NS, WING_NS, TWEEN_NS } from "./exml-parser.js";
import { plainAttributes, stateAttributes } from "./exml-attributes.js";

// EXML 归一化（P0-B / P0.1 加固）：在语法树之上做轻量语义归类
//   - Namespace 作用域感知：递归维护前缀 -> URI 作用域链（节点自身声明覆盖祖先），
//     分类与 skinName 识别全部基于 URI，不依赖前缀字符串
//   - 跳过 Wing 编辑器元数据（w:Config / w:Declarations）
//   - 归类节点 kind：eui | wing | tween | custom | unknown
//   - 展开内联 skinName 子节点（EUI namespace 下 skinName 的唯一子节点是内联 Skin）

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
  /** 本节点的 namespace URI（custom / unknown 节点的身份解析依据，P1-A） */
  nsUri?: string;
  /** e:layout 属性元素内容（布局声明，从 children 剔除；P1-A 记录 / P1-C 应用） */
  layout?: NormalizedNode;
}

/** 节点自身的 namespace 声明（xmlns / xmlns:*） */
function declarationsOf(node: ExmlNode): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(node.attributes)) {
    if (k === "xmlns") out[""] = v;
    else if (k.startsWith("xmlns:")) out[k.slice("xmlns:".length)] = v;
  }
  return out;
}

/** 归类单个语法节点（scope 为当前作用域链：祖先声明 + 本节点声明） */
function classify(node: ExmlNode, scope: Record<string, string>): { kind: NodeKind; className: string } {
  const uri = scope[node.prefix] ?? "";
  if (uri === EUI_NS) {
    return { kind: "eui", className: `eui.${node.localName}` };
  }
  if (uri === WING_NS) return { kind: "wing", className: `wing.${node.localName}` };
  if (uri === TWEEN_NS) return { kind: "tween", className: `tween.${node.localName}` };
  if (uri) {
    // 自定义组件：namespace URI 通常是 "gdmj.*" / "*" / "Poker.*" 这类工程包通配
    return { kind: "custom", className: node.tag };
  }
  return { kind: "unknown", className: node.tag };
}

/** 递归归一化；wing 元数据整体跳过，tween 记录诊断后跳过 */
/**
 * 递归归一化（P0.1 加固）：scope 为当前作用域链（祖先 xmlns 声明逐层合并，本节点声明覆盖同名前缀）。
 * wing 元数据整体跳过，tween 记录诊断后跳过，skinName（按 URI 识别）提升其内联 Skin。
 */
function normalize(node: ExmlNode, scopeIn: Record<string, string>, diagnostics: ExmlDiagnostic[]): NormalizedNode | null {
  const scope = { ...scopeIn, ...declarationsOf(node) };
  const { kind, className } = classify(node, scope);
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
  let layoutNode: NormalizedNode | null = null;
  for (const child of node.children) {
    const childScope = { ...scope, ...declarationsOf(child) };
    const childUri = childScope[child.prefix] ?? "";
    // skinName 是属性的内联写法（按 EUI namespace URI 识别，不依赖前缀）：唯一子节点是内联 Skin，提升为普通子节点
    if (childUri === EUI_NS && child.localName === "skinName") {
      const inlineSkin = child.children[0];
      if (inlineSkin) {
        const n = normalize(inlineSkin, childScope, diagnostics);
        if (n) children.push(n);
      }
      continue;
    }
    // e:layout 属性元素（布局声明）：子节点是布局对象（HorizontalLayout 等），收纳到 layout 字段不参与渲染
    if (childUri === EUI_NS && child.localName === "layout") {
      const layoutObj = child.children[0];
      if (layoutObj) {
        const n = normalize(layoutObj, childScope, diagnostics);
        if (n) layoutNode = n;
      }
      continue;
    }
    const n = normalize(child, childScope, diagnostics);
    if (n) children.push(n);
  }
  const attrs = plainAttributes(node);
  const states = stateAttributes(node);
  const out: NormalizedNode = { raw: node, kind, className, attrs, states, children };
  if (attrs.includeIn !== undefined) out.includeIn = attrs.includeIn;
  if (attrs.excludeIn !== undefined) out.excludeIn = attrs.excludeIn;
  if (kind === "custom" || kind === "unknown") out.nsUri = scope[node.prefix] ?? "";
  if (layoutNode) out.layout = layoutNode;
  return out;
}

/** 文档归一化入口 */
export function normalizeDocument(doc: ExmlDocument): { root: NormalizedNode; diagnostics: ExmlDiagnostic[] } {
  const diagnostics = [...doc.diagnostics];
  const root = normalize(doc.root, {}, diagnostics);
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
