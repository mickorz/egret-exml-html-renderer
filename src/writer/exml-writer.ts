// EXML 写出器（P2-E）：语义 HTML -> EXML 文本
//
// 语义 HTML 约定（与渲染器输出一致，AI 生成 UI 按此约定）：
//   1. XHTML 形态：所有元素显式闭合（img 自闭合 <img ... />），属性双引号
//   2. 舞台根元素 class="egret-stage"，携带 data-egret-tag / data-egret-class / data-egret-attrs
//   3. 语义节点携带 data-egret-tag（原始标签，如 e:Image）与 data-egret-attrs（原始 EXML 属性 JSON 全量）
//   4. 无语义标记的元素（位图数字位片/九宫格片/占位标签）是渲染装饰，写出器自动跳过
//   5. 节点嵌套即 EXML 子节点嵌套；文本内容忽略（文本在 attrs.text 内）
//
// 写出原则：不猜 DOM -> EXML 的映射，一切结构来自语义属性；无语义标记的输入报错（不静默输出空皮肤）。
//
// 只读边界：本模块只产出文本，不写文件系统。

import { XMLParser } from "fast-xml-parser";

interface OrderedItem {
  [k: string]: unknown;
}

/** 语义节点：EXML 标签 + 原始属性 + 布局声明（回写单位） */
export interface SemanticNode {
  tag: string;
  attributes: Record<string, string>;
  /** 布局声明（e:layout 属性子元素重建；className 如 eui.HorizontalLayout） */
  layout?: { className: string; attrs: Record<string, string> };
  /** 内联皮肤包装层（Button 内联 skinName：重建为 e:skinName/e:Skin 结构） */
  skinWrap?: boolean;
  children: SemanticNode[];
}

export interface WriteExmlResult {
  /** 写出的 EXML 文本 */
  exml: string;
  /** 语义节点数（含根） */
  nodeCount: number;
  /** 跳过的装饰元素数（无语义标记的元素） */
  skippedDecorations: number;
  diagnostics: { level: "warning" | "error"; code: string; message: string }[];
}

const htmlParser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: "",
  trimValues: false,
  parseTagValue: false,
  parseAttributeValue: false,
  processEntities: true,
});

/** 预清理 HTML 文档噪声（script/style/doctype/注释），防 JS 文本破坏 XML 解析 */
function preClean(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!doctype[^>]*>/gi, "");
}

/** preserveOrder 元素的属性表（":@" 键） */
function attrsOf(item: OrderedItem): Record<string, string> {
  const a = item[":@"] as Record<string, string> | undefined;
  const out: Record<string, string> = {};
  if (a) for (const [k, v] of Object.entries(a)) out[k] = String(v);
  return out;
}

/** preserveOrder 元素的标签名（唯一非 ":@" 键；文本节点为 "#text" 返回 null） */
function tagOf(item: OrderedItem): string | null {
  for (const k of Object.keys(item)) {
    if (k === ":@") continue;
    if (k === "#text") return null;
    return k;
  }
  return null;
}

/** 从语义 HTML 提取语义节点树；找不到带语义标记的根时报错（不静默输出空皮肤） */
export function parseSemanticHtml(html: string): { root: SemanticNode; skipped: number } {
  const cleaned = preClean(html);
  let items: OrderedItem[];
  try {
    items = htmlParser.parse(cleaned) as OrderedItem[];
  } catch (err) {
    throw new Error(`语义 HTML 解析失败（需 XHTML 形态，元素显式闭合）: ${(err as Error).message}`);
  }

  let skipped = 0;
  // 文档归属判定（P2-E 关键）：stableKey 前缀 = 源 EXML basename（实例与内联子节点 = 根文档前缀；
  // 展开皮肤内容/静态 item/内联 skin 包装 = 皮肤文件前缀）。与其根前缀不同的子树是展开派生
  // （重建时自动再生），剪枝不回写——否则回写后出现内联子节点与展开皮肤并列的假结构。
  // 注：不能用 data-egret-src 判定（实例节点 src 指向皮肤文件，P1-B 溯源语义与文档归属相反）。
  let rootKeyPrefix: string | null = null;
  // 递归提取：带 data-egret-tag + data-egret-attrs 且前缀归属本文档的是语义节点；其余剪枝计为装饰
  const toSemantic = (item: OrderedItem): SemanticNode | null => {
    const tag = tagOf(item);
    if (!tag) return null;
    const attrs = attrsOf(item);
    if (!attrs["data-egret-tag"] || !attrs["data-egret-attrs"]) {
      skipped++;
      return null;
    }
    // 展开派生子树：剪枝（不递归，重建时由皮肤展开自动再生）
    if (rootKeyPrefix !== null && attrs["data-egret-key"] !== undefined) {
      const prefix = attrs["data-egret-key"].split("#")[0];
      if (prefix !== rootKeyPrefix) {
        skipped++;
        return null;
      }
    }
    // 合成元素（List 静态 item 包装：非真实 EXML 标记，重建时由 itemRendererSkinName 自动再生）：剪枝
    if (attrs["data-egret-tag"] === "List:itemRenderer") {
      skipped++;
      return null;
    }
    // 内联皮肤包装层标记（egret-skin-wrap）：回写重建为 e:skinName/e:Skin 结构
    const skinWrap = (attrs.class ?? "").split(/\s+/).includes("egret-skin-wrap");
    let attributes: Record<string, string>;
    try {
      attributes = JSON.parse(attrs["data-egret-attrs"]) as Record<string, string>;
    } catch {
      throw new Error(`data-egret-attrs 不是合法 JSON: tag=${tag}`);
    }
    let layout: SemanticNode["layout"];
    if (attrs["data-egret-layout"]) {
      try {
        layout = JSON.parse(attrs["data-egret-layout"]) as SemanticNode["layout"];
      } catch {
        throw new Error(`data-egret-layout 不是合法 JSON: tag=${tag}`);
      }
    }
    const children: SemanticNode[] = [];
    const childList = item[tag] as OrderedItem[] | undefined;
    if (Array.isArray(childList)) {
      for (const child of childList) {
        if (!child || typeof child !== "object") continue;
        const sem = toSemantic(child);
        if (sem) children.push(sem);
      }
    }
    return { tag: attrs["data-egret-tag"], attributes, layout, skinWrap, children };
  };

  // 找 .egret-stage 根（class 含 egret-stage 的语义元素）；找不到再找最外层语义元素
  const findStage = (list: OrderedItem[]): SemanticNode | null => {
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const tag = tagOf(item);
      if (!tag) continue;
      const attrs = attrsOf(item);
      const isStage = (attrs.class ?? "").split(/\s+/).includes("egret-stage");
      if (isStage && attrs["data-egret-tag"] && attrs["data-egret-attrs"]) {
        // 文档归属基准：根 stableKey 前缀；无 key（AI 手写）则不剪枝
        if (attrs["data-egret-key"] !== undefined) rootKeyPrefix = attrs["data-egret-key"].split("#")[0];
        return toSemantic(item);
      }
      const childList = item[tag] as OrderedItem[] | undefined;
      if (Array.isArray(childList)) {
        const found = findStage(childList);
        if (found) return found;
      }
    }
    return null;
  };

  const root = findStage(items);
  if (!root) {
    throw new Error("未找到语义根元素（class=egret-stage 且携带 data-egret-tag/attrs）；输入需为渲染器 bare 输出或同约定语义 HTML");
  }
  return { root, skipped };
}

/** XML 属性值转义 */
function xmlEsc(v: string): string {
  return v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);
}

/** EXML 属性名合法性（宽松：字母数字下划线冒号点横线；state 后缀属性如 width.disabled） */
const ATTR_NAME = /^[\w.:-]+$/;

/**
 * 语义节点树 -> EXML 文本。
 * 根属性里的 xmlns 声明原样保留；使用了未声明前缀的标签时自动补 xmlns:ns1="*"（Egret 通配命名空间惯例）。
 */
export function writeExml(root: SemanticNode): string {
  const rootAttrs = { ...root.attributes };
  // 收集全部标签前缀（含 layout 内层标签），确保 xmlns 声明齐全（e 固定 EUI；ns1 通配；其余沿用根属性声明）
  const prefixes = new Set<string>();
  const layoutTagOf = (className: string): string =>
    className.startsWith("eui.") ? `e:${className.slice("eui.".length)}` : className;
  const walkTags = (n: SemanticNode): void => {
    const colon = n.tag.indexOf(":");
    if (colon > 0) prefixes.add(n.tag.slice(0, colon));
    if (n.layout) {
      const lt = layoutTagOf(n.layout.className);
      const c = lt.indexOf(":");
      if (c > 0) prefixes.add(lt.slice(0, c));
    }
    for (const c of n.children) walkTags(c);
  };
  walkTags(root);
  if (prefixes.has("e") && rootAttrs["xmlns:e"] === undefined) rootAttrs["xmlns:e"] = "http://ns.egret.com/eui";
  if (prefixes.has("ns1") && rootAttrs["xmlns:ns1"] === undefined) rootAttrs["xmlns:ns1"] = "*";

  const lines: string[] = ['<?xml version="1.0" encoding="utf-8"?>'];
  const write = (n: SemanticNode, depth: number): void => {
    const indent = "  ".repeat(depth + 1);
    const attrText = Object.entries(n.attributes)
      .filter(([k]) => ATTR_NAME.test(k))
      .map(([k, v]) => `${k}="${xmlEsc(v)}"`)
      .join(" ");
    const head = attrText ? `${n.tag} ${attrText}` : n.tag;
    const writeInner = (d: number): void => {
      const ind = "  ".repeat(d + 1);
      if (n.layout) {
        const lt = layoutTagOf(n.layout.className);
        const la = Object.entries(n.layout.attrs ?? {})
          .filter(([k]) => ATTR_NAME.test(k))
          .map(([k, v]) => `${k}="${xmlEsc(String(v))}"`)
          .join(" ");
        const lHead = la ? `${lt} ${la}` : lt;
        lines.push(`${ind}  <e:layout>`);
        lines.push(`${ind}    <${lHead}/>`);
        lines.push(`${ind}  </e:layout>`);
      }
      for (const c of n.children) write(c, d);
    };
    if (n.skinWrap) {
      // 内联皮肤包装层：重建 e:skinName/e:Skin 结构（skinName 前缀随皮肤标签前缀）
      const colon = n.tag.indexOf(":");
      const skinNameTag = colon > 0 ? `${n.tag.slice(0, colon)}:skinName` : "e:skinName";
      lines.push(`${indent}<${skinNameTag}>`);
      if (n.children.length === 0 && !n.layout) {
        lines.push(`${indent}  <${head}/>`);
      } else {
        lines.push(`${indent}  <${head}>`);
        writeInner(depth + 1);
        lines.push(`${indent}  </${n.tag}>`);
      }
      lines.push(`${indent}</${skinNameTag}>`);
      return;
    }
    if (n.children.length === 0 && !n.layout) {
      lines.push(`${indent}<${head}/>`);
      return;
    }
    lines.push(`${indent}<${head}>`);
    writeInner(depth);
    lines.push(`${indent}</${n.tag}>`);
  };
  // 根标签用根属性（含 xmlns）；depth=-1 使根无缩进
  const rootAttrText = Object.entries(rootAttrs)
    .filter(([k]) => ATTR_NAME.test(k))
    .map(([k, v]) => `${k}="${xmlEsc(v)}"`)
    .join(" ");
  lines.push(`<${root.tag}${rootAttrText ? " " + rootAttrText : ""}>`);
  for (const c of root.children) write(c, 0);
  lines.push(`</${root.tag}>`);
  return lines.join("\n") + "\n";
}

/** 语义 HTML -> EXML 文本（一步入口；HTTP 与 MCP 共用） */
export function htmlToExml(html: string): WriteExmlResult {
  const diagnostics: WriteExmlResult["diagnostics"] = [];
  const { root, skipped } = parseSemanticHtml(html);
  if (skipped > 0) {
    diagnostics.push({ level: "warning", code: "WRITE_SKIPPED_DECORATIONS", message: `跳过 ${skipped} 个无语义标记的装饰元素（位片/九宫格片/占位标签）` });
  }
  let nodeCount = 0;
  const count = (n: SemanticNode): void => {
    nodeCount++;
    for (const c of n.children) count(c);
  };
  count(root);
  return { exml: writeExml(root), nodeCount, skippedDecorations: skipped, diagnostics };
}
