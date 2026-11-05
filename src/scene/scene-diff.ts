// 场景结构差异分析（P2-D）：两份 SceneDocument 的结构 diff
//
// 匹配策略（为什么不用 stableKey 做身份主键）：
//   stableKey = EXML文件名#兄弟索引路径（如 "Skin#0.2.1"），对中间插入/删除敏感——
//   中间插一个节点，后续兄弟 stableKey 全部偏移，会把一次插入误报成大量差异。
//   因此身份判定分两层：
//     1. id 主键：EXML 同文件内 id 唯一，跨版本保留率高（Egret 代码靠 id 绑定）；
//        id 相同但父变化 -> moved；id 相同 -> 配对后做属性级 diff
//     2. 顺序配对：无 id 节点在相同父节点下按 (type + native.className) 分桶后按顺序一一配对
//   stableKey / instancePath 降级为报告中的定位信息（可喂给 /view?focus= 深度定位）。
//
// 已知边界（明示，不做近似猜测）：
//   无 id 同签名兄弟的中间插入/删除会从插入点起报成属性变化链（顺序配对的位置敏感性）；
//   有 id 节点不受影响。真实工程重要节点普遍带 id（如 _labTotal），此边界影响有限。
//
// 差异分类：
//   added    B 有 A 无；removed A 有 B 无
//   moved    同 id 但父 instancePath 变化（跨父移动）
//   changed  配对成功但 flatten 路径属性变化（bounds.x / attrs.text / native.attributes.width 全量诚实报告）

import type { SceneDocument } from "./scene-builder.js";

/** 差异节点定位信息（stableKey 供 /view?focus= 深度定位） */
export interface DiffNodeRef {
  stableKey: string;
  instancePath: string;
  type: string;
  name: string | null;
  id: string | null;
  nativeTag: string;
}

/** 属性级变化（flatten 路径，如 "bounds.x"、"attrs.text"、"native.attributes.width"） */
export interface DiffPropChange {
  path: string;
  from: unknown;
  to: unknown;
}

export interface SceneDiff {
  fileA: string;
  fileB: string;
  stats: { matched: number; added: number; removed: number; moved: number; changed: number };
  added: DiffNodeRef[];
  removed: DiffNodeRef[];
  moved: { node: DiffNodeRef; fromParent: string; toParent: string }[];
  changed: { node: DiffNodeRef; changes: DiffPropChange[] }[];
}

interface SceneNodeLike {
  type: string;
  id?: string;
  name?: string | null;
  native: { tag: string; className: string };
  children: SceneNodeLike[];
  instancePath: string;
  stableKey: string;
  [k: string]: unknown;
}

const refOf = (n: SceneNodeLike): DiffNodeRef => ({
  stableKey: n.stableKey,
  instancePath: n.instancePath,
  type: n.type,
  name: n.name ?? null,
  id: n.id ?? null,
  nativeTag: n.native.tag,
});

/** 节点序列化对象 flatten 为 path -> 值（排除 children 与派生定位字段；属性变化全量报告不分主次） */
function flatten(node: object, prefix: string, out: Map<string, unknown>): void {
  for (const [k, v] of Object.entries(node)) {
    // stableKey/instancePath 是派生定位信息：父变化已由 moved 分类报告，不重复进属性差异
    if (k === "children" || k === "stableKey" || k === "instancePath") continue;
    const p = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      flatten(v, p, out);
    } else {
      out.set(p, v);
    }
  }
}

/** 配对节点属性差异（flatten 全量对比；缺失与 undefined 视为相同） */
function propChanges(a: SceneNodeLike, b: SceneNodeLike): DiffPropChange[] {
  const fa = new Map<string, unknown>();
  const fb = new Map<string, unknown>();
  flatten(a, "", fa);
  flatten(b, "", fb);
  const out: DiffPropChange[] = [];
  for (const k of new Set([...fa.keys(), ...fb.keys()])) {
    const va = fa.has(k) ? fa.get(k) : undefined;
    const vb = fb.has(k) ? fb.get(k) : undefined;
    if (JSON.stringify(va) !== JSON.stringify(vb)) out.push({ path: k, from: va, to: vb });
  }
  return out.sort((x, y) => x.path.localeCompare(y.path));
}

/**
 * 结构 diff 主入口。
 * 配对两层：id 主键（全树收集，两遍扫描防嵌套重复报告）+ 无 id 同父同签名顺序配对。
 */
export function diffScenes(a: SceneDocument, b: SceneDocument): SceneDiff {
  const diff: SceneDiff = {
    fileA: a.file,
    fileB: b.file,
    stats: { matched: 0, added: 0, removed: 0, moved: 0, changed: 0 },
    added: [],
    removed: [],
    moved: [],
    changed: [],
  };
  const paired = new Set<object>();
  // A 侧节点 -> 配对侣伴 B 侧节点（moved 判定：A 侧父的侣伴不是 B 侧实际父即真移动）
  const pairPartner = new Map<object, object>();

  // 全树 id 收集（父节点引用用于配对侣伴式 moved 判定，不用 instancePath 字符串——根类名不同会假报）
  const byIdA = new Map<string, { node: SceneNodeLike; parentNode: SceneNodeLike | null }>();
  const byIdB = new Map<string, { node: SceneNodeLike; parentNode: SceneNodeLike | null }>();
  collectById(a.root as unknown as SceneNodeLike, null, byIdA);
  collectById(b.root as unknown as SceneNodeLike, null, byIdB);

  // 第 1 遍：全部 id 配对先入 paired（防第 2 层重复走查），记录配对表
  const idPairs: { a: SceneNodeLike; b: SceneNodeLike; parentA: SceneNodeLike | null; parentB: SceneNodeLike | null }[] = [];
  for (const [id, ea] of byIdA) {
    const eb = byIdB.get(id);
    if (!eb) {
      diff.removed.push(refOf(ea.node));
      diff.stats.removed++;
      paired.add(ea.node);
      continue;
    }
    if (paired.has(ea.node)) continue; // 同 id 重复出现（异常数据）以首次为准
    paired.add(ea.node);
    paired.add(eb.node);
    pairPartner.set(ea.node, eb.node);
    idPairs.push({ a: ea.node, b: eb.node, parentA: ea.parentNode, parentB: eb.parentNode });
  }

  // 根配对（根无 id 时也配对，保证根属性变化可报告）
  const ra = a.root as unknown as SceneNodeLike;
  const rb = b.root as unknown as SceneNodeLike;
  const rootPaired = paired.has(ra) && paired.has(rb);
  if (!rootPaired) {
    paired.add(ra);
    paired.add(rb);
    pairPartner.set(ra, rb);
    diff.stats.matched++;
    const changes = propChanges(ra, rb);
    if (changes.length) {
      diff.changed.push({ node: refOf(rb), changes });
      diff.stats.changed++;
    }
  }

  // 第 2 层先走：从根对齐无 id 分支（填满配对伴侣表，供 id 配对的 moved 判定用；
  // 不进入已配对节点，id 子树由第 3 步各自递归）
  diffChildren(ra, rb, diff, paired, pairPartner);

  // 第 3 步：id 配对逐对报告（moved 判定此时父辈伴侣已齐：树先序保证父先于子处理）+ 递归各自无 id 子孙
  for (const p of idPairs) {
    // moved 判定：A 侧父的配对侣伴不是 B 侧实际父 => 真跨父移动（instancePath 字符串不可靠：根类名不同会假报）
    const partnerOfParentA = p.parentA ? pairPartner.get(p.parentA) : rb;
    if (partnerOfParentA !== p.parentB) {
      diff.moved.push({
        node: refOf(p.b),
        fromParent: p.parentA ? p.parentA.instancePath : "<root>",
        toParent: p.parentB ? p.parentB.instancePath : "<root>",
      });
      diff.stats.moved++;
    } else {
      diff.stats.matched++;
    }
    const changes = propChanges(p.a, p.b);
    if (changes.length) {
      diff.changed.push({ node: refOf(p.b), changes });
      diff.stats.changed++;
    }
    diffChildren(p.a, p.b, diff, paired, pairPartner);
  }
  return diff;
}

/** 全树按 id 收集（含父 instancePath） */
function collectById(
  n: SceneNodeLike,
  parent: SceneNodeLike | null,
  out: Map<string, { node: SceneNodeLike; parentNode: SceneNodeLike | null }>,
): void {
  if (n.id) out.set(n.id, { node: n, parentNode: parent });
  for (const c of n.children) collectById(c, n, out);
}

/** 同父子列表配对：剔除已配对 -> 按 (type+className) 分桶 -> 桶内按顺序一一配对 -> 尾差 added/removed -> 递归 */
function diffChildren(a: SceneNodeLike, b: SceneNodeLike, diff: SceneDiff, paired: Set<object>, pairPartner: Map<object, object>): void {
  const aKids = a.children.filter((c) => !paired.has(c));
  const bKids = b.children.filter((c) => !paired.has(c));

  const sig = (n: SceneNodeLike) => `${n.type}|${n.native.className}`;
  const aBuckets = new Map<string, SceneNodeLike[]>();
  const bBuckets = new Map<string, SceneNodeLike[]>();
  for (const c of aKids) push(aBuckets, sig(c), c);
  for (const c of bKids) push(bBuckets, sig(c), c);

  for (const key of new Set([...aBuckets.keys(), ...bBuckets.keys()])) {
    const la = aBuckets.get(key) ?? [];
    const lb = bBuckets.get(key) ?? [];
    const n = Math.min(la.length, lb.length);
    for (let i = 0; i < n; i++) {
      const na = la[i];
      const nb = lb[i];
      paired.add(na);
      paired.add(nb);
      pairPartner.set(na, nb);
      diff.stats.matched++;
      const changes = propChanges(na, nb);
      if (changes.length) {
        diff.changed.push({ node: refOf(nb), changes });
        diff.stats.changed++;
      }
      diffChildren(na, nb, diff, paired, pairPartner);
    }
    for (let i = n; i < la.length; i++) {
      diff.removed.push(refOf(la[i]));
      diff.stats.removed++;
    }
    for (let i = n; i < lb.length; i++) {
      diff.added.push(refOf(lb[i]));
      diff.stats.added++;
    }
  }
}

function push(m: Map<string, SceneNodeLike[]>, k: string, v: SceneNodeLike): void {
  (m.get(k) ?? m.set(k, []).get(k)!).push(v);
}
