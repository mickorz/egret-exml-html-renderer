// P2-B 验收检查：组件关系图谱（三类引用边 / SCC 环检测 / 悬空引用 / 孤儿皮肤 / 枢纽排行 / 单类邻域）
// 运行：npx tsx tests/component-graph-check.ts（fixture 断言 + 真实工程全量断言）

import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EgretWorkspace } from "../src/scene/workspace.js";
import { buildComponentGraph, classNeighborhood } from "../src/scene/component-graph.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.join(here, "fixtures/egret");

// ---- fixture 工程 ----
{
  const ws = new EgretWorkspace({ rootDir: fixtureRoot });
  const graph = buildComponentGraph(ws.listUiAssets(), ws.getClassIndex());

  // 统计自洽：三类边数之和 = 边总数
  assert.equal(graph.stats.edgeKinds.tag + graph.stats.edgeKinds.itemRenderer + graph.stats.edgeKinds.skinName, graph.stats.edgeCount, "三类边数之和=边总数");
  assert.equal(graph.nodes.length, graph.stats.nodeCount, "节点数自洽");

  const edge = (from: string, to: string, kind: string) =>
    graph.edges.find((e) => e.from === from && e.to === to && e.kind === kind);

  // 三类引用边：ExpandSkin 的 tag / itemRenderer / skinName
  assert.ok(edge("ExpandSkin", "ArtNumberEUI", "tag"), "tag 边");
  assert.ok(edge("ExpandSkin", "ItemBoxSkin", "itemRenderer"), "itemRenderer 边");
  assert.ok(edge("ExpandSkin", "WidgetSkin", "skinName"), "skinName 边");
  // skinName 多实例合并：ExpandSkin 3 个 ArtNumberEUI 都指 ArtNumberSkin，同类同文件去重为 1 边
  assert.equal(graph.edges.filter((e) => e.from === "ExpandSkin" && e.to === "ArtNumberSkin").length, 1, "重复引用去重为单边");

  // 环检测：CycleA 与 CycleB 互引 -> SCC
  const cyc = graph.cycles.find((c) => c.length === 2 && c.includes("CycleA") && c.includes("CycleB"));
  assert.ok(cyc, "CycleA/CycleB 互引应成环");

  // 悬空引用：ArtNumberSkin 被指派但 fixture 无定义文件
  assert.ok(graph.danglingClasses.includes("ArtNumberSkin"), "ArtNumberSkin 应为悬空引用");

  // 孤儿皮肤：LayoutSkin 定义了但无人引用
  assert.ok(graph.orphanClasses.includes("LayoutSkin"), "LayoutSkin 应为孤儿皮肤");

  // 单类邻域
  const nb = classNeighborhood(graph, "ExpandSkin");
  assert.ok(nb.uses.some((e) => e.to === "ItemBoxSkin"));
  assert.ok(nb.uses.every((e) => e.from === "ExpandSkin"));
  assert.ok(nb.usedBy.length === 0, "ExpandSkin 无人引用");
  const nbItem = classNeighborhood(graph, "ItemBoxSkin");
  assert.ok(nbItem.usedBy.some((e) => e.from === "ExpandSkin" && e.kind === "itemRenderer"), "ItemBoxSkin 被 ExpandSkin 引用");

  console.log(
    `[component-graph-check] fixture 通过（${graph.stats.nodeCount} 节点，${graph.stats.edgeCount} 边，环 ${graph.stats.cycleCount}，悬空 ${graph.stats.danglingCount}，孤儿 ${graph.stats.orphanCount}）`,
  );
}

// ---- 真实工程全量 ----
{
  const realRoot = "E:/WorkProjects/GDMahjongMobile/gdmahjong/GDMahjongMobile";
  try {
    fs.statSync(realRoot);
  } catch {
    console.log("[component-graph-check] 真实工程目录不存在，跳过（本地验证专用）");
    process.exit(0);
  }
  const ws = new EgretWorkspace({ rootDir: realRoot });
  const graph = buildComponentGraph(ws.listUiAssets(), ws.getClassIndex());

  // 规模与三类边齐全（skinName 指派在真实工程大量存在：ArtNumberEUI -> ArtNumberSkin 模式）
  assert.ok(graph.stats.nodeCount > 500, `节点数应上几百: ${graph.stats.nodeCount}`);
  assert.ok(graph.stats.edgeKinds.skinName > 50, `skinName 边应大量存在: ${graph.stats.edgeKinds.skinName}`);
  assert.ok(graph.stats.edgeKinds.tag > 100, `tag 边应大量存在: ${graph.stats.edgeKinds.tag}`);

  // 枢纽：ArtNumberSkin 应是被指派最多的枢纽之一（实测被数十个类指派）
  const hub = graph.hubs.find((h) => h.cls === "ArtNumberSkin");
  assert.ok(hub && hub.inDegree > 30, `ArtNumberSkin 应为枢纽: ${hub?.inDegree ?? "缺失"}`);

  // 目标组件邻域：HometownRebateViewSkin itemRenderer 引用 HometownRebateItemRenderSkin
  const nb = classNeighborhood(graph, "HometownRebateViewSkin");
  assert.ok(nb.uses.some((e) => e.to === "HometownRebateItemRenderSkin" && e.kind === "itemRenderer"), "HometownRebateViewSkin 应引用 ItemRender 皮肤");
  assert.equal(nb.inCycle, null, "目标组件不应在环中");

  // 环结构合法性（数量不硬断言，只验结构：每个环至少 2 成员且成员都有边关联）
  for (const c of graph.cycles) {
    assert.ok(c.length >= 2, "图级环至少 2 成员");
    for (const cls of c) assert.ok(graph.nodes.some((n) => n.cls === cls), `环成员 ${cls} 应为图节点`);
  }

  // 悬空引用：每个悬空类确实无定义（类名索引查不到）
  for (const cls of graph.danglingClasses) {
    assert.ok(!ws.getClassIndex().has(cls), `悬空类 ${cls} 不应在类名索引中`);
  }

  console.log(
    `[component-graph-check] 真实工程通过（${graph.stats.nodeCount} 节点，${graph.stats.edgeCount} 边 [tag ${graph.stats.edgeKinds.tag} / itemRenderer ${graph.stats.edgeKinds.itemRenderer} / skinName ${graph.stats.edgeKinds.skinName}]，环 ${graph.stats.cycleCount}，悬空 ${graph.stats.danglingCount}，孤儿 ${graph.stats.orphanCount}，枢纽榜首 ${graph.hubs[0]?.cls}:${graph.hubs[0]?.inDegree}）`,
  );
}
