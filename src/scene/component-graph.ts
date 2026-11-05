// 组件关系图谱（P2-B）：以 P2-A 资产索引为数据源，构建类级引用关系图
//
// 数据流：
// listUiAssets()（P2-A 索引，含结构层引用数据）
//     └─> buildComponentGraph()
//           ├─> 边收集：tag 标签引用 / itemRenderer 皮肤引用 / skinName 皮肤指派
//           ├─> 节点登记：被引用类 + 索引定义类（根 class）
//           ├─> Tarjan SCC：图级环检测（区分于场景级展开环：跨分支环不是场景环，但图上存在）
//           └─> 统计：出入度 / 枢纽排行（被引用最多的组件）/ 孤儿皮肤（无人引用）
//
// 设计边界：
// - EXML 格式无继承关系（皮肤不是类的 extends），图谱只含引用关系，不发明继承
// - 图节点是“类”，不是“文件”：同类多文件时以类名索引（thm 优先）为定义文件
// - 图级环只报不展开：场景展开环检测（SCENE_CUSTOM_CYCLE）仍在场景构建层按分支处理

import type { ClassIndexEntry } from "./component-registry.js";
import type { UiAssetEntry, UiAssetIndexResult } from "./ui-asset-index.js";

/** 引用边类型 */
export type GraphEdgeKind = "tag" | "itemRenderer" | "skinName";

/** 图的边：fromClass 的皮肤文件引用 toClass */
export interface GraphEdge {
  /** 引用方类名（发起引用的皮肤根 class；无 class 的文件为 "<file:路径>"） */
  from: string;
  /** 被引用类名 */
  to: string;
  kind: GraphEdgeKind;
  /** 引用发生的文件（资源目录相对路径） */
  file: string;
}

/** 图的节点：一个组件类 */
export interface GraphNode {
  /** 类名 */
  cls: string;
  /** 定义文件（资源目录相对路径）；无定义为 null（被引用但索引里找不到定义的悬空引用） */
  file: string | null;
  /** 类名索引来源（thm 优先）；未登记为 null */
  classIndexSource: ClassIndexEntry["source"] | null;
  /** 入度（被多少类引用，含多边） */
  inDegree: number;
  /** 出度（引用多少类，含多边） */
  outDegree: number;
  /** 引用该类的边类明细（kind -> 次数） */
  inKinds: Partial<Record<GraphEdgeKind, number>>;
}

/** 组件关系图谱 */
export interface ComponentGraph {
  /** 全部节点（按类名排序） */
  nodes: GraphNode[];
  /** 全部边（from 排序） */
  edges: GraphEdge[];
  /** 图级环（SCC，成员数 >1 或自环）；每环为类名数组（排序） */
  cycles: string[][];
  /** 悬空引用：被引用但类名索引无定义的类名（排序） */
  danglingClasses: string[];
  /** 孤儿皮肤：定义了但无人引用的类（根 class 存在且入度为 0，排序） */
  orphanClasses: string[];
  /** 被引用最多的类（枢纽，降序前 N） */
  hubs: { cls: string; inDegree: number }[];
  stats: {
    nodeCount: number;
    edgeCount: number;
    /** tag / itemRenderer / skinName 各类边数 */
    edgeKinds: Record<GraphEdgeKind, number>;
    cycleCount: number;
    danglingCount: number;
    orphanCount: number;
  };
}

/**
 * 构建组件关系图谱（纯函数，数据源 = P2-A 索引 + 类名索引）。
 * 同一 (from, to, kind, file) 多次引用合并计次不重复建边（边按四元组去重）。
 */
export function buildComponentGraph(idx: UiAssetIndexResult, classIndex: Map<string, ClassIndexEntry>): ComponentGraph {
  // 文件 -> 引用方类名（根 class；缺失用 "<file:路径>" 占位，保证边可归属）
  const fileOwner = new Map<string, string>();
  for (const e of idx.entries) {
    fileOwner.set(e.basic.file, e.basic.rootClass ?? `<file:${e.basic.file}>`);
  }

  const edgeKeys = new Set<string>();
  const edges: GraphEdge[] = [];
  const nodeSet = new Set<string>();

  const addEdge = (from: string, to: string, kind: GraphEdgeKind, file: string): void => {
    nodeSet.add(from);
    nodeSet.add(to);
    const key = `${from}|${to}|${kind}|${file}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push({ from, to, kind, file });
  };

  for (const e of idx.entries) {
    const owner = fileOwner.get(e.basic.file)!;
    for (const cls of Object.keys(e.structure.customComponents)) addEdge(owner, cls, "tag", e.basic.file);
    for (const cls of e.structure.itemRendererSkins) addEdge(owner, cls, "itemRenderer", e.basic.file);
    for (const cls of e.structure.skinNameRefs) addEdge(owner, cls, "skinName", e.basic.file);
  }

  // 定义类也入节点集（含孤儿）
  for (const e of idx.entries) {
    if (e.basic.rootClass) nodeSet.add(e.basic.rootClass);
  }

  // 节点元数据
  const byCls = new Map<string, GraphNode>();
  for (const cls of nodeSet) {
    const entry = classIndex.get(cls);
    byCls.set(cls, {
      cls,
      file: entry?.file ?? null,
      classIndexSource: entry?.source ?? null,
      inDegree: 0,
      outDegree: 0,
      inKinds: {},
    });
  }
  for (const edge of edges) {
    byCls.get(edge.from)!.outDegree++;
    const to = byCls.get(edge.to)!;
    to.inDegree++;
    to.inKinds[edge.kind] = (to.inKinds[edge.kind] ?? 0) + 1;
  }

  // Tarjan SCC（迭代版，防深递归栈溢出；1151 量级其实小，但工程图深度未知）
  const cycles = findSccs([...nodeSet], edges);

  // 悬空引用与孤儿皮肤
  const danglingClasses = [...nodeSet]
    .filter((cls) => !cls.startsWith("<file:") && !classIndex.has(cls))
    .sort();
  const orphanClasses = [...byCls.values()]
    .filter((n) => n.file !== null && n.inDegree === 0)
    .map((n) => n.cls)
    .sort();

  // 枢纽排行（被引用最多前 20）
  const hubs = [...byCls.values()]
    .filter((n) => n.inDegree > 0)
    .sort((a, b) => b.inDegree - a.inDegree || a.cls.localeCompare(b.cls))
    .slice(0, 20)
    .map((n) => ({ cls: n.cls, inDegree: n.inDegree }));

  const edgeKinds: Record<GraphEdgeKind, number> = { tag: 0, itemRenderer: 0, skinName: 0 };
  for (const e of edges) edgeKinds[e.kind]++;

  return {
    nodes: [...byCls.values()].sort((a, b) => a.cls.localeCompare(b.cls)),
    edges: edges.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to)),
    cycles,
    danglingClasses,
    orphanClasses,
    hubs,
    stats: {
      nodeCount: byCls.size,
      edgeCount: edges.length,
      edgeKinds,
      cycleCount: cycles.length,
      danglingCount: danglingClasses.length,
      orphanCount: orphanClasses.length,
    },
  };
}

/** Tarjan 强连通分量（迭代实现）；返回成员数 >1 的 SCC 与自环（图级环） */
function findSccs(classes: string[], edges: GraphEdge[]): string[][] {
  const adj = new Map<string, string[]>();
  for (const c of classes) adj.set(c, []);
  for (const e of edges) adj.get(e.from)!.push(e.to);

  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const sccs: string[][] = [];
  let counter = 0;

  for (const root of classes) {
    if (index.has(root)) continue;
    // 迭代 DFS：帧 = [节点, 访问到的邻接下标]
    const frames: [string, number][] = [[root, 0]];
    index.set(root, counter);
    low.set(root, counter);
    counter++;
    stack.push(root);
    onStack.add(root);

    while (frames.length) {
      const frame = frames[frames.length - 1];
      const [node, i] = frame;
      const neighbors = adj.get(node)!;
      if (i < neighbors.length) {
        frame[1]++;
        const nxt = neighbors[i];
        if (!index.has(nxt)) {
          index.set(nxt, counter);
          low.set(nxt, counter);
          counter++;
          stack.push(nxt);
          onStack.add(nxt);
          frames.push([nxt, 0]);
        } else if (onStack.has(nxt)) {
          low.set(node, Math.min(low.get(node)!, index.get(nxt)!));
        }
      } else {
        frames.pop();
        if (frames.length) {
          const parent = frames[frames.length - 1][0];
          low.set(parent, Math.min(low.get(parent)!, low.get(node)!));
        }
        if (low.get(node) === index.get(node)) {
          const comp: string[] = [];
          let w: string;
          do {
            w = stack.pop()!;
            onStack.delete(w);
            comp.push(w);
          } while (w !== node);
          // 成员 >1 是环；单成员 + 自环也是环
          if (comp.length > 1 || adj.get(node)!.includes(node)) sccs.push(comp.sort());
        }
      }
    }
  }
  return sccs.sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]));
}

/** 单类子图：该类直接引用了谁、被谁直接引用（AI 问答场景的最小信息单元） */
export function classNeighborhood(
  graph: ComponentGraph,
  cls: string,
): {
  cls: string;
  uses: GraphEdge[];
  usedBy: GraphEdge[];
  node: GraphNode | null;
  /** 该类参与的图级环（若有） */
  inCycle: string[] | null;
} {
  const uses = graph.edges.filter((e) => e.from === cls);
  const usedBy = graph.edges.filter((e) => e.to === cls);
  const node = graph.nodes.find((n) => n.cls === cls) ?? null;
  const inCycle = graph.cycles.find((c) => c.includes(cls)) ?? null;
  return { cls, uses, usedBy, node, inCycle };
}
