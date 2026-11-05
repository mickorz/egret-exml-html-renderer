import type { ExmlNode } from "./exml-types.js";

// EXML 属性工具（P0-B）：属性名归一化、state 后缀拆分、常用值解析
// EXML 属性存在三种形态：
//   1. 普通属性          width="100"
//   2. state 后缀属性    visible.state_back="false"（仅指定状态生效，P0 记录不应用）
//   3. includeIn/excludeIn 节点级状态归属

/** 拆分属性名：返回 [基础名, state 名（无 state 为 null）] */
export function splitStateAttr(name: string): [string, string | null] {
  const dot = name.indexOf(".");
  if (dot < 0) return [name, null];
  return [name.slice(0, dot), name.slice(dot + 1)];
}

/** 节点的普通属性（不含 state 后缀与 xmlns 声明） */
export function plainAttributes(node: ExmlNode): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(node.attributes)) {
    if (k.startsWith("xmlns")) continue;
    const [base, state] = splitStateAttr(k);
    if (state === null) out[base] = v;
  }
  return out;
}

/** 节点的 state 后缀属性：state 名 -> (基础属性 -> 值) */
export function stateAttributes(node: ExmlNode): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const [k, v] of Object.entries(node.attributes)) {
    const [base, state] = splitStateAttr(k);
    if (state === null) continue;
    (out[state] ??= {})[base] = v;
  }
  return out;
}

/** 解析数值属性；非法或缺失返回 undefined */
export function numAttr(attrs: Record<string, string>, key: string): number | undefined {
  const v = attrs[key];
  if (v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** 解析布尔属性（EUI 约定 "true"/"false"）；缺失返回 undefined */
export function boolAttr(attrs: Record<string, string>, key: string): boolean | undefined {
  const v = attrs[key];
  if (v === "true") return true;
  if (v === "false") return false;
  return undefined;
}

/** EUI 颜色 "0xRRGGBB"（或 #RRGGBB）-> CSS 颜色；非法返回 null */
export function egretColorToCss(v: string | undefined): string | null {
  if (!v) return null;
  let s = v.trim();
  if (s.startsWith("0x") || s.startsWith("0X")) s = "#" + s.slice(2);
  if (!s.startsWith("#")) return null;
  if (s.length === 7 && /^[0-9a-fA-F]{6}$/.test(s.slice(1))) return s.toLowerCase();
  if (s.length === 9 && /^[0-9a-fA-F]{8}$/.test(s.slice(1))) {
    // #RRGGBBAA -> rgba
    const r = parseInt(s.slice(1, 3), 16);
    const g = parseInt(s.slice(3, 5), 16);
    const b = parseInt(s.slice(5, 7), 16);
    const a = parseInt(s.slice(7, 9), 16) / 255;
    return `rgba(${r},${g},${b},${a.toFixed(3)})`;
  }
  return null;
}

/** "10,10,20,20" 形式的逗号分隔数值；分量数不符或非数值返回 null */
export function numList(v: string | undefined, count: number): number[] | null {
  if (!v) return null;
  const parts = v.split(",").map((s) => Number(s.trim()));
  if (parts.length !== count || parts.some((n) => !Number.isFinite(n))) return null;
  return parts;
}
