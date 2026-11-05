// P2-A 验收检查：全工程 UI 资产索引（三层元数据 / 检索 / 反查 / 统计与耗时）
// 运行：npx tsx tests/ui-asset-check.ts（fixture 断言 + 真实工程全量断言）

import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EgretWorkspace } from "../src/scene/workspace.js";
import { findComponentUsages, searchUiAssets } from "../src/scene/ui-asset-index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.join(here, "fixtures/egret");

// ---- fixture 工程 ----
{
  const ws = new EgretWorkspace({ rootDir: fixtureRoot });
  const idx = ws.listUiAssets();

  // 验收 1+7：全量扫描无静默漏文件；耗时/文件数/失败数可统计
  const files = ws.listExmlFiles();
  assert.equal(idx.stats.fileCount, files.length, "fileCount 必须等于扫描文件数");
  assert.equal(idx.stats.entryCount + idx.stats.failureCount, files.length, "条目+失败 必须等于文件数（无静默漏文件）");
  assert.equal(idx.parseFailures.length, 0, "fixture 不应有解析失败");
  assert.ok(idx.stats.buildMs > 0 && idx.stats.buildMs < 5000, `构建耗时应记录且秒级: ${idx.stats.buildMs}ms`);

  const byFile = (f: string) => idx.entries.find((e) => e.basic.file === `eui_skins/${f}.exml`)!;

  // 三层元数据：SampleSkin（基础层：class/尺寸/节点数/state 数）
  const sample = byFile("SampleSkin");
  assert.equal(sample.basic.rootClass, "SampleSkin");
  assert.equal(sample.basic.width, 300);
  assert.equal(sample.basic.height, 200);
  assert.ok(sample.basic.nodeCount > 0);
  assert.ok(sample.basic.stateCount >= 2, "states=normal,disabled 应计入 stateCount");
  // 结构层：ExpandSkin 的 itemRenderer 皮肤引用
  const expand = byFile("ExpandSkin");
  assert.ok(expand.structure.itemRendererSkins.includes("ItemBoxSkin"), "itemRendererSkinName 引用应入结构层");
  assert.ok(expand.structure.customComponents.ArtNumberEUI >= 3, "自定义组件计数");
  // 资源层：SampleSkin 的图片引用 + ExpandSkin 的位图数字 prefix
  assert.ok(sample.resources.imageSources.includes("atlas_json.frame_one_png"), "图片 source 应入资源层");
  assert.ok(expand.resources.bitmapPrefixes.includes("atlas_json.num_"), "位图数字 prefix 应入资源层");

  // 验收 3：thm 优先级（fixture thm 登记 SampleSkin -> 同文件，来源应标 thm；未登记类回退 scan）
  assert.equal(sample.classIndexSource, "thm", "thm 登记的类来源应为 thm");
  const widget = byFile("WidgetSkin");
  assert.equal(widget.classIndexSource, "scan", "未入 thm 的类应回退 scan");

  // 验收 4：按 class / 文件名 / 组件类型检索
  assert.equal(searchUiAssets(idx.entries, { className: "SampleSkin" }).length, 1, "按 class 检索");
  assert.ok(searchUiAssets(idx.entries, { fileFuzzy: "expand" }).every((e) => e.basic.file.toLowerCase().includes("expand")), "按文件名模糊检索");
  const withList = searchUiAssets(idx.entries, { componentType: "eui.List" });
  assert.ok(withList.some((e) => e.basic.file.endsWith("ExpandSkin.exml")), "按 eui.List 组件类型检索");
  const withNum = searchUiAssets(idx.entries, { componentType: "ArtNumberEUI" });
  assert.equal(withNum.length, 3, "按自定义组件类名检索（ExpandSkin/CustomCompSkin/UnknownSkin）");

  // 验收 5：反查（itemRenderer 引用 + 标签引用）
  const itemUsages = findComponentUsages(idx.entries, "ItemBoxSkin");
  assert.ok(itemUsages.some((u) => u.file.endsWith("ExpandSkin.exml") && u.kind === "itemRenderer"), "反查 itemRendererSkinName 引用");
  const widgetUsages = findComponentUsages(idx.entries, "CustomComp"); // WidgetSkin 内自定义标签（若存在）
  assert.ok(Array.isArray(widgetUsages), "反查返回数组");
  // 皮肤引用计数：CustomCompSkin 引用 SampleSkin
  const cc = byFile("CustomCompSkin");
  assert.ok(cc.structure.itemRendererSkins.includes("SampleSkin"), "CustomCompSkin 引用 SampleSkin");
  const sampleUsages = findComponentUsages(idx.entries, "SampleSkin");
  assert.ok(sampleUsages.some((u) => u.file.endsWith("CustomCompSkin.exml")), "反查 SampleSkin 被引用");

  console.log(`[ui-asset-check] fixture 通过（${idx.entries.length} 条目，${idx.stats.buildMs.toFixed(1)}ms）`);
}

// ---- 真实工程全量 ----
{
  const realRoot = "E:/WorkProjects/GDMahjongMobile/gdmahjong/GDMahjongMobile";
  try {
    fs.statSync(realRoot);
  } catch {
    console.log("[ui-asset-check] 真实工程目录不存在，跳过（本地验证专用）");
    process.exit(0);
  }
  const ws = new EgretWorkspace({ rootDir: realRoot });
  const idx = ws.listUiAssets();

  // 验收 1：1151 全量无静默漏文件
  const files = ws.listExmlFiles();
  assert.equal(idx.stats.fileCount, files.length);
  assert.equal(idx.stats.entryCount + idx.stats.failureCount, files.length, "真实工程条目+失败=文件数");
  // 验收 2：成功率统计 + 失败诊断
  assert.equal(idx.parseFailures.length, 0, "真实工程解析失败应为 0");
  // 验收 7：耗时记录（基准约 1s，CI 波动上限放宽到 30s）
  assert.ok(idx.stats.buildMs < 30000, `真实工程索引耗时应 <30s: ${idx.stats.buildMs}ms`);

  // 抽样：HometownRebateView 三层元数据与 P1-C 已知事实对齐
  const hb = idx.entries.find((e) => e.basic.file.endsWith("HometownRebateView.exml"))!;
  assert.equal(hb.basic.rootClass, "HometownRebateViewSkin");
  assert.equal(hb.structure.componentTypes["eui.Image"], 9);
  assert.equal(hb.structure.customComponents.ArtNumberEUI, 3);
  assert.deepEqual(hb.structure.itemRendererSkins, ["HometownRebateItemRenderSkin"]);
  assert.equal(hb.resources.bitmapPrefixes.length, 3);
  assert.equal(hb.basic.width, 1280);
  assert.equal(hb.basic.height, 720);

  // 验收 5（真实工程）：反查 HometownRebateItemRenderSkin
  const usages = findComponentUsages(idx.entries, "HometownRebateItemRenderSkin");
  assert.ok(usages.some((u) => u.file.endsWith("HometownRebateView.exml") && u.kind === "itemRenderer"));

  // 验收 4（真实工程）：ArtNumberEUI 检索量级（调研已知 99 个文件 280 处实例）
  const artFiles = searchUiAssets(idx.entries, { componentType: "ArtNumberEUI" });
  assert.ok(artFiles.length > 50 && artFiles.length < 200, `ArtNumberEUI 文件数应近百: ${artFiles.length}`);

  console.log(
    `[ui-asset-check] 真实工程通过（${idx.stats.fileCount} 文件，${idx.stats.entryCount} 条目，${idx.stats.buildMs.toFixed(0)}ms，ArtNumberEUI ${artFiles.length} 文件）`,
  );
}
