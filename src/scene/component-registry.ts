import fs from "node:fs";
import path from "node:path";
import type { ExmlDiagnostic } from "../parser/exml/exml-types.js";

// 组件注册表与类名索引（P1-A）：自定义组件的身份 / 语义 / 类名 -> EXML 文件解析
//
// 组件身份 = Namespace URI + localName（不依赖 e:/ns1: 等 XML 前缀）：
//   uri "*"       -> 根包类名，如 "EmptyBtn"
//   uri "gdmj.*"  -> 包名类名，如 "gdmj.ArtNumber"
//
// 类名索引双数据源（收口到本模块）：
//   default.thm.json skins 映射（优先级高）
//   EXML 全量扫描（根元素 class 属性）

/** 组件语义类别（渲染策略分派依据） */
export type ComponentKind = "container" | "exml-skin" | "bitmap-number" | "animation";

/** 组件语义登记项 */
export interface ComponentSemantic {
  className: string;
  kind: ComponentKind;
}

/**
 * 已知代码组件语义注册表（无 EXML 皮肤、视觉由组件代码构建的类）。
 * 未登记的自定义组件默认按 exml-skin 候选（P1-B 经类名索引展开）。
 */
const KNOWN_COMPONENTS: Record<string, ComponentKind> = {
  // 无皮肤按钮：视觉即内联子节点
  EmptyBtn: "container",
  // 空皮肤 + prefix 位图数字图集逐位拼合（P1-C 实现）
  ArtNumberEUI: "bitmap-number",
  // DragonBones 骨骼动画，静态不可还原
  DragonBonesAni: "animation",
};

/** Namespace URI -> 组件身份类名（根包 "*" / 包通配 "xxx.*"） */
export function identityOf(nsUri: string, localName: string): string {
  if (nsUri === "*") return localName;
  const m = /^([\w$]+)\.\*$/.exec(nsUri);
  if (m) return `${m[1]}.${localName}`;
  // 其他 URI（少见）：退化为 localName，诊断层已保留原始 URI 可追溯
  return localName;
}

/** 查组件语义：先按身份精确匹配，再按 localName 兜底（跨包同名类按已知语义处理） */
export function componentSemanticOf(identity: string, localName: string): ComponentSemantic | null {
  const byIdentity = KNOWN_COMPONENTS[identity];
  if (byIdentity !== undefined) return { className: identity, kind: byIdentity };
  for (const [key, kind] of Object.entries(KNOWN_COMPONENTS)) {
    const keyLocal = key.includes(".") ? key.slice(key.lastIndexOf(".") + 1) : key;
    if (keyLocal === localName) return { className: key, kind };
  }
  return null;
}

// ---------------------------------------------------------------------------
// 类名索引（P1-B 消费：itemRendererSkinName / skinName 字符串 -> EXML 文件）

/** 类名索引条目：资源目录相对路径（/ 分隔）+ 来源 */
export interface ClassIndexEntry {
  file: string;
  source: "thm" | "scan";
}

/** 提取 EXML 根元素 class 属性（只做轻量正则，不整树解析；索引是启发式定位，最终以场景构建为准） */
function rootClassOf(text: string): string | null {
  // 第一个元素标签（跳过 <?xml ...?> 声明与注释），EXML 根正常为 e:Skin
  const tag = /<([\w.:-]+)([^>]*)>/.exec(text);
  if (!tag) return null;
  const attr = /\bclass\s*=\s*["']([^"']+)["']/.exec(tag[2]);
  return attr ? attr[1].trim() : null;
}

/** thm.json 的工程相对路径 -> 资源目录相对路径 */
function thmPathToResource(p: string): string {
  return p.replace(/^resource\//, "").split("\\").join("/");
}

/**
 * 构建类名索引：thm.json skins（优先）+ EXML 全量扫描根 class 属性。
 * 重复类名：thm 条目优先保留；scan 内部重复记诊断（首个按文件序生效）。
 */
export function buildExmlClassIndex(
  resourceDir: string,
  files: { file: string }[],
  diagnostics: ExmlDiagnostic[],
): Map<string, ClassIndexEntry> {
  const idx = new Map<string, ClassIndexEntry>();

  // 数据源 1：default.thm.json（主题映射，优先级高；缺失不是错误）
  const thmPath = path.join(resourceDir, "default.thm.json");
  try {
    const thm = JSON.parse(fs.readFileSync(thmPath, "utf-8")) as { skins?: Record<string, string> };
    for (const [cls, file] of Object.entries(thm.skins ?? {})) {
      if (typeof file !== "string" || file === "") continue;
      idx.set(cls, { file: thmPathToResource(file), source: "thm" });
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      diagnostics.push({ level: "warning", code: "THEME_JSON_INVALID", message: `default.thm.json 解析失败: ${(err as Error).message}` });
    }
  }

  // 数据源 2：EXML 全量扫描（根元素 class 属性 -> 资源相对路径）；读取失败直接抛错，不静默跳过
  for (const { file } of files) {
    const abs = path.join(resourceDir, ...file.split("/"));
    const text = fs.readFileSync(abs, "utf-8");
    const cls = rootClassOf(text);
    if (!cls) continue;
    const existing = idx.get(cls);
    if (existing) {
      diagnostics.push(
        existing.source === "thm"
          ? { level: "warning", code: "CLASS_INDEX_DUP", message: `类名 ${cls} 重复：thm 映射优先（scan ${file} 未生效）` }
          : { level: "warning", code: "CLASS_INDEX_DUP", message: `类名 ${cls} 重复: ${existing.file} 与 ${file}，按扫描序取首个` },
      );
      continue;
    }
    idx.set(cls, { file, source: "scan" });
  }
  return idx;
}
