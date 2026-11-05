// UI 资产索引：全工程 EXML 元数据提取与检索（P2-A）
//
// 数据流：
// listExmlFiles()
//     └─> 逐文件 readFileSync
//           └─> parseExmlText()        XML 语法解析
//                 └─> normalizeDocument()  归一化（剔除 wing 元数据）
//                       └─> extractUiAssetMeta()  单趟遍历产出三层元数据
//                             ├─> basic     基础层（文件 class 尺寸 节点数 状态数）
//                             ├─> structure 结构层（组件类型 自定义组件 皮肤引用）
//                             └─> resources 资源层（图片源 位图数字 prefix）
//
// 设计约束：
// - 不含 Scene Builder / HTML Renderer（索引是理解层，不是渲染层）
// - 不做缓存：索引按需构建，缓存策略待基准数据决定（P2-A-1）
// - 解析失败不静默：计入 parseFailures 并给诊断，成功率可统计

import type { NormalizedNode } from "../parser/exml/exml-normalizer.js";
import { normalizeDocument } from "../parser/exml/exml-normalizer.js";
import type { ExmlDiagnostic } from "../parser/exml/exml-types.js";
import { parseExmlText } from "../parser/exml/exml-parser.js";
import fs from "node:fs";
import path from "node:path";
import { componentSemanticOf, identityOf, type ClassIndexEntry } from "./component-registry.js";

/** 基础元数据：文件身份与规模 */
export interface UiAssetBasic {
  /** 资源目录相对路径（/ 分隔） */
  file: string;
  /** 根元素 class 属性（皮肤类名）；缺失为 null（会被诊断） */
  rootClass: string | null;
  /** 声明宽度（根 width 属性）；缺失为 null */
  width: number | null;
  /** 声明高度（根 height 属性）；缺失为 null */
  height: number | null;
  /** 归一化节点总数（不含 wing/tween） */
  nodeCount: number;
  /** 出现过的 state 名数（去重） */
  stateCount: number;
}

/** 结构元数据：用了哪些组件、引用了哪些皮肤 */
export interface UiAssetStructure {
  /** 组件类型 -> 出现次数（eui 组件为 "eui.局部名"，自定义组件为局部类名） */
  componentTypes: Record<string, number>;
  /** 自定义组件局部类名 -> 出现次数（kind=custom 的节点） */
  customComponents: Record<string, number>;
  /** itemRendererSkinName 引用的皮肤类名（去重） */
  itemRendererSkins: string[];
  /** skinName 皮肤指派引用的类名（自定义组件实例的 skinName 属性，去重；P2-B 图谱第三类引用边） */
  skinNameRefs: string[];
}

/** 资源元数据：引用了哪些外部资源 */
export interface UiAssetResources {
  /** 图片 source 引用（直接名或 sheet.subkey，去重排序） */
  imageSources: string[];
  /** 位图数字 prefix 引用（语义=bitmap-number 的组件），去重排序 */
  bitmapPrefixes: string[];
}

/** 单个 EXML 的索引条目：三层元数据 + 类名索引来源 */
export interface UiAssetEntry {
  basic: UiAssetBasic;
  structure: UiAssetStructure;
  resources: UiAssetResources;
  /** 根 class 在类名索引中的来源（thm 优先）；类名不在索引中为 null */
  classIndexSource: ClassIndexEntry["source"] | null;
}

/** 索引构建结果 */
export interface UiAssetIndexResult {
  entries: UiAssetEntry[];
  /** 解析失败明细（不静默：失败必须可统计） */
  parseFailures: { file: string; error: string }[];
  diagnostics: ExmlDiagnostic[];
  /** 构建统计（验收：耗时/文件数/失败数可记录） */
  stats: {
    /** 构建耗时（毫秒） */
    buildMs: number;
    /** 扫描到的 EXML 文件数 */
    fileCount: number;
    /** 成功构建条目数 */
    entryCount: number;
    /** 解析失败数 */
    failureCount: number;
  };
}

/** 单趟遍历提取三层元数据（basic + structure + resources，一次 walk 不做第二遍） */
export function extractUiAssetMeta(file: string, root: NormalizedNode): UiAssetEntry {
  const basic: UiAssetBasic = {
    file,
    rootClass: root.attrs.class ?? null,
    width: numOrNull(root.attrs.width),
    height: numOrNull(root.attrs.height),
    nodeCount: 0,
    stateCount: 0,
  };
  const componentTypes: Record<string, number> = {};
  const customComponents: Record<string, number> = {};
  const itemRendererSkins = new Set<string>();
  const skinNameRefs = new Set<string>();
  const imageSources = new Set<string>();
  const bitmapPrefixes = new Set<string>();
  const stateNames = new Set<string>();

  const walk = (n: NormalizedNode): void => {
    basic.nodeCount++;
    for (const st of Object.keys(n.states)) stateNames.add(st);
    if (n.kind === "eui") {
      componentTypes[`eui.${n.className.split(".").pop() ?? n.className}`] =
        (componentTypes[`eui.${n.className.split(".").pop() ?? n.className}`] ?? 0) + 1;
    } else if (n.kind === "custom") {
      const local = n.raw.localName;
      customComponents[local] = (customComponents[local] ?? 0) + 1;
      componentTypes[local] = (componentTypes[local] ?? 0) + 1;
      // 位图数字语义组件：prefix 即资源引用
      if (componentSemanticOf(identityOf(n.nsUri ?? "", local), local)?.kind === "bitmap-number" && n.attrs.prefix) {
        bitmapPrefixes.add(n.attrs.prefix);
      }
    }
    // 图片资源引用（eui.Image / eui.BitmapLabel 着色位图等带 source 的节点）
    if (n.attrs.source) imageSources.add(n.attrs.source);
    // List / DataGroup 的 itemRenderer 皮肤引用
    if (n.attrs.itemRendererSkinName) itemRendererSkins.add(n.attrs.itemRendererSkinName);
    // 自定义组件实例的皮肤指派引用（host 组件挂哪个皮肤）
    if (n.kind === "custom" && n.attrs.skinName) skinNameRefs.add(n.attrs.skinName);
    for (const c of n.children) walk(c);
  };
  walk(root);
  basic.stateCount = stateNames.size;

  return {
    basic,
    structure: {
      componentTypes,
      customComponents,
      itemRendererSkins: [...itemRendererSkins].sort(),
      skinNameRefs: [...skinNameRefs].sort(),
    },
    resources: {
      imageSources: [...imageSources].sort(),
      bitmapPrefixes: [...bitmapPrefixes].sort(),
    },
    // 由 buildUiAssetIndex 按类名索引补全，提取阶段未知
    classIndexSource: null,
  };
}

/**
 * 构建全工程 UI 资产索引：枚举 -> 读 -> 解析 -> 归一化 -> 提取（单趟）。
 * 解析失败的文件计入 parseFailures（有诊断、可统计），不中断整体构建。
 */
export function buildUiAssetIndex(
  resourceDir: string,
  files: { file: string }[],
  classIndex: Map<string, ClassIndexEntry>,
): UiAssetIndexResult {
  const entries: UiAssetEntry[] = [];
  const parseFailures: { file: string; error: string }[] = [];
  const diagnostics: ExmlDiagnostic[] = [];
  const t0 = process.hrtime.bigint();

  for (const { file } of files) {
    const abs = path.join(resourceDir, ...file.split("/"));
    try {
      const text = fs.readFileSync(abs, "utf-8");
      const doc = parseExmlText(text, file);
      const { root } = normalizeDocument(doc);
      const entry = extractUiAssetMeta(file, root);
      // 类名索引来源补全（thm 优先逻辑已在类名索引构建时完成）
      if (entry.basic.rootClass && classIndex.get(entry.basic.rootClass)?.file === file) {
        entry.classIndexSource = classIndex.get(entry.basic.rootClass)!.source;
      }
      if (!entry.basic.rootClass) {
        diagnostics.push({
          level: "warning",
          code: "ASSET_INDEX_NO_CLASS",
          message: `EXML 根元素缺少 class 属性: ${file}`,
        });
      }
      entries.push(entry);
    } catch (err) {
      parseFailures.push({ file, error: (err as Error).message });
      diagnostics.push({
        level: "error",
        code: "ASSET_INDEX_PARSE_FAILED",
        message: `索引构建解析失败: ${file}: ${(err as Error).message}`,
      });
    }
  }

  return {
    entries,
    parseFailures,
    diagnostics,
    stats: {
      buildMs: Number(process.hrtime.bigint() - t0) / 1e6,
      fileCount: files.length,
      entryCount: entries.length,
      failureCount: parseFailures.length,
    },
  };
}

/** 检索条件（全部可选，AND 组合） */
export interface UiAssetQuery {
  /** 类名精确匹配（大小写敏感） */
  className?: string;
  /** 文件名模糊（子串，忽略大小写，匹配文件路径任意段） */
  fileFuzzy?: string;
  /** 组件类型过滤：eui 组件（如 "eui.List"）或自定义类名（如 "ArtNumberEUI"） */
  componentType?: string;
}

/** 按条件检索 UI 资产（线性过滤，1151 量级毫秒级，无需索引结构） */
export function searchUiAssets(entries: UiAssetEntry[], q: UiAssetQuery): UiAssetEntry[] {
  return entries.filter((e) => {
    if (q.className && e.basic.rootClass !== q.className) return false;
    if (q.fileFuzzy && !e.basic.file.toLowerCase().includes(q.fileFuzzy.toLowerCase())) return false;
    if (q.componentType && !(q.componentType in e.structure.componentTypes)) return false;
    return true;
  });
}

/** 反查：某个组件类被哪些 EXML 引用（标签引用 + itemRendererSkinName 引用） */
export function findComponentUsages(
  entries: UiAssetEntry[],
  className: string,
): { file: string; kind: "tag" | "itemRenderer" | "skinName" }[] {
  const out: { file: string; kind: "tag" | "itemRenderer" | "skinName" }[] = [];
  for (const e of entries) {
    if (e.structure.customComponents[className]) out.push({ file: e.basic.file, kind: "tag" });
    else if (e.structure.itemRendererSkins.includes(className)) out.push({ file: e.basic.file, kind: "itemRenderer" });
    else if (e.structure.skinNameRefs.includes(className)) out.push({ file: e.basic.file, kind: "skinName" });
  }
  return out;
}

function numOrNull(v: string | undefined): number | null {
  if (v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
