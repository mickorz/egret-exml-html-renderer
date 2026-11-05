// P2-D 验收检查：场景结构 diff（id 配对 / 顺序配对 / 新增删除移动属性变化 / 统计自洽）
// 运行：npx tsx tests/scene-diff-check.ts（fixture 断言 + 真实工程断言）

import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EgretWorkspace } from "../src/scene/workspace.js";
import { diffScenes } from "../src/scene/scene-diff.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.join(here, "fixtures/egret");

// ---- fixture：DiffSkinA -> DiffSkinB（四类差异全覆盖） ----
{
  const ws = new EgretWorkspace({ rootDir: fixtureRoot });
  const a = ws.getScene("eui_skins/DiffSkinA.exml")!;
  const b = ws.getScene("eui_skins/DiffSkinB.exml")!;
  const diff = diffScenes(a, b);

  // 同文件自 diff：全零（无差异基线）
  const self = diffScenes(a, a);
  assert.equal(self.stats.added + self.stats.removed + self.stats.moved + self.stats.changed, 0, "自 diff 应全零");

  // id 配对 + 属性变化：img1 x 10->30（native.attributes.x）
  const img1 = diff.changed.find((c) => c.node.id === "img1");
  assert.ok(img1, "img1 应配对并出现在 changed");
  assert.ok(img1.changes.some((ch) => ch.path === "native.attributes.x" && ch.from === "10" && ch.to === "30"), "img1 x 应 10->30");

  // 无 id 顺序配对 + 属性变化：label text 旧文案->新文案、size 20->24
  const label = diff.changed.find((c) => c.node.type === "label" && !c.node.id);
  assert.ok(label, "无 id label 应顺序配对");
  assert.ok(label.changes.some((ch) => ch.path === "attrs.text" && ch.from === "旧文案" && ch.to === "新文案"), "label text 应变");
  assert.ok(label.changes.some((ch) => ch.path === "attrs.fontSize" && ch.from === 20 && ch.to === 24), "label size 应变（语义名 fontSize）");

  // id 删除：gone 只在 A
  assert.ok(diff.removed.some((n) => n.id === "gone"), "gone 应被删除");
  // 新增：B 根部多出的无 id Image
  assert.equal(diff.added.filter((n) => n.type === "image" && !n.id).length, 1, "应新增 1 个无 id Image");
  // 跨父移动：mv 从 grp1 移到根
  const mv = diff.moved.find((m) => m.node.id === "mv");
  assert.ok(mv, "mv 应跨父移动");
  assert.ok(mv.fromParent.includes("grp1") && !mv.toParent.includes("grp1"), "mv 应从 grp1 移出到根");
  // moved 节点不重复报属性噪音（stableKey/instancePath 已排除）
  assert.ok(!img1.changes.some((ch) => ch.path === "stableKey" || ch.path === "instancePath"), "配对节点不应报 stableKey 噪音");
  // 未变节点：btnA 配对且无变化
  assert.ok(!diff.changed.some((c) => c.node.id === "btnA"), "btnA 无变化不应进 changed");
  // 根属性变化（width 200->220，class 变化在 native/根 attrs 体现）
  const rootCh = diff.changed.find((c) => c.node.id === null && c.node.instancePath.split(".").length <= 2);
  assert.ok(rootCh, "根节点属性变化应可报告");

  console.log(
    `[scene-diff-check] fixture 通过（matched ${diff.stats.matched} / added ${diff.stats.added} / removed ${diff.stats.removed} / moved ${diff.stats.moved} / changed ${diff.stats.changed}）`,
  );
}

// ---- 真实工程 ----
{
  const realRoot = "E:/WorkProjects/GDMahjongMobile/gdmahjong/GDMahjongMobile";
  try {
    fs.statSync(realRoot);
  } catch {
    console.log("[scene-diff-check] 真实工程目录不存在，跳过（本地验证专用）");
    process.exit(0);
  }
  const ws = new EgretWorkspace({ rootDir: realRoot });

  // 同文件自 diff：全零
  const hb = ws.getScene("skins/homeTown/HometownRebateView.exml")!;
  const self = diffScenes(hb, hb);
  assert.equal(self.stats.added + self.stats.removed + self.stats.moved + self.stats.changed, 0, "真实工程自 diff 应全零");

  // 相近版本对（同族皮肤 FrontOpenHandCardItem41 vs 42）：应产出结构合理的差异
  const a = ws.getScene("skins/newCard/handCard/FrontOpenHandCardItem41.exml");
  const b = ws.getScene("skins/newCard/handCard/FrontOpenHandCardItem42.exml");
  if (a && b) {
    const d = diffScenes(a, b);
    assert.ok(d.stats.matched > 0, "同族皮肤应存在配对节点");
    // 统计自洽：changed 条目都带至少一条属性变化
    assert.ok(d.changed.every((c) => c.changes.length > 0), "changed 条目必须带属性变化");
    // 差异里不含 stableKey/instancePath 噪音
    assert.ok(d.changed.every((c) => !c.changes.some((ch) => ch.path === "stableKey" || ch.path === "instancePath")), "不应报定位字段噪音");
    console.log(
      `[scene-diff-check] 真实工程通过（同族版本对 matched ${d.stats.matched} / added ${d.stats.added} / removed ${d.stats.removed} / moved ${d.stats.moved} / changed ${d.stats.changed}）`,
    );
  } else {
    console.log("[scene-diff-check] 真实工程通过（自 diff 全零；版本对皮肤不存在，跳过配对断言）");
  }
}
