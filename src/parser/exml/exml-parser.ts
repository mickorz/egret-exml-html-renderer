import { XMLParser, XMLValidator } from "fast-xml-parser";
import path from "node:path";
import { readFileSync } from "node:fs";
import type { ExmlDiagnostic, ExmlDocument, ExmlNode } from "./exml-types.js";

// EXML 解析器（P0-B）：.exml 文本 -> ExmlDocument
// 使用 fast-xml-parser 的 preserveOrder 模式：JSON 对象属性顺序不可靠，
// UI 节点的 z-order 必须依赖子节点数组顺序，绝不能依赖属性键顺序。

/** preserveOrder 模式下的单个元素：唯一非 ":@" 键即标签名（文本节点为 "#text"） */
interface OrderedItem {
  ":@"?: Record<string, string>;
  [k: string]: unknown;
}

/** 取元素标签名；非元素项（纯文本/XML 声明/注释）返回 null */
function tagOf(item: OrderedItem): string | null {
  for (const k of Object.keys(item)) {
    if (k === ":@") continue;
    // "#text" 纯文本；"?xml" 声明；"!" 注释——都不是 UI 元素
    if (k === "#text" || k.startsWith("?") || k.startsWith("!")) return null;
    return k;
  }
  return null;
}

const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: "",
  trimValues: false,
  parseTagValue: false,
  parseAttributeValue: false,
  // EXML 属性值如 "0xFFFFFF"、"100%"、"10,10,20,20" 都必须保持字符串原样
  processEntities: true,
});

/** 把 fast-xml-parser preserveOrder 输出递归转换为 ExmlNode */
function toNode(item: OrderedItem, diagnostics: ExmlDiagnostic[]): ExmlNode {
  const tag = tagOf(item)!;
  const colon = tag.indexOf(":");
  const prefix = colon >= 0 ? tag.slice(0, colon) : "";
  const localName = colon >= 0 ? tag.slice(colon + 1) : tag;

  const attributes: Record<string, string> = {};
  const attrRaw = item[":@"] as Record<string, string> | undefined;
  if (attrRaw) {
    for (const [k, v] of Object.entries(attrRaw)) {
      // 保留原始属性名（含 xmlns 声明与 state 后缀属性）
      attributes[k] = String(v);
    }
  }

  const children: ExmlNode[] = [];
  const childList = item[tag] as OrderedItem[] | undefined;
  if (Array.isArray(childList)) {
    for (const child of childList) {
      if (!child || typeof child !== "object") continue;
      if (tagOf(child) === null) continue; // 纯文本等非元素项跳过
      children.push(toNode(child, diagnostics));
    }
  }

  const node: ExmlNode = { tag, prefix, localName, attributes, children };
  return node;
}

/** 从节点及其后代收集 xmlns 声明（EXML 的 xmlns 通常声明在根节点） */
function collectNamespaces(node: ExmlNode, out: Record<string, string>): void {
  for (const [k, v] of Object.entries(node.attributes)) {
    if (k === "xmlns") {
      out[""] = v;
    } else if (k.startsWith("xmlns:")) {
      out[k.slice("xmlns:".length)] = v;
    }
  }
  for (const c of node.children) collectNamespaces(c, out);
}

/**
 * 解析 EXML 文本为 ExmlDocument。
 * 解析失败抛出明确错误（含文件名），不返回半成品。
 */
export function parseExmlFile(file: string): ExmlDocument {
  const text = readFileSync(file, "utf8");
  return parseExmlText(text, file);
}

/** 解析 EXML 字符串（测试与服务器共用入口） */
export function parseExmlText(text: string, file = "<inline>"): ExmlDocument {
  const diagnostics: ExmlDiagnostic[] = [];
  const wellFormed = XMLValidator.validate(text);
  if (wellFormed !== true) {
    throw new Error(`EXML 解析失败: ${file} ${wellFormed.err.msg} (行 ${wellFormed.err.line}, 列 ${wellFormed.err.col})`);
  }
  const raw = parser.parse(text) as OrderedItem[];
  // 过滤 XML 声明/注释等非元素项，取根元素
  const rootItems = raw.filter((it) => tagOf(it) !== null);
  if (rootItems.length !== 1) {
    throw new Error(`EXML 应有且仅有一个根节点: ${file}（实际 ${rootItems.length} 个顶层元素）`);
  }
  const root = toNode(rootItems[0], diagnostics);
  const namespace: Record<string, string> = {};
  collectNamespaces(root, namespace);
  if (!namespace.e) {
    diagnostics.push({ level: "warning", code: "EXML_NO_EUI_NS", message: `文档未声明 e 前缀的 EUI namespace: ${file}` });
  }
  return { file: path.normalize(file), root, namespace, diagnostics };
}

/** EUI namespace URI 常量转发（场景构建从此处取，避免重复定义） */
export { EUI_NS, WING_NS, TWEEN_NS } from "./exml-types.js";
