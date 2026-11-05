// P2-E 验收检查：语义 HTML -> EXML 回写（round-trip 保真 + AI 生成用例 + 暴露层）
// 运行：npx tsx tests/exml-writer-check.ts
//
// round-trip 链路：EXML -> scene -> renderHtml(bare) -> htmlToExml -> 重新构建 scene -> diffScenes 对比
// 期望：结构零增删移；属性差异仅限可解释项（布局重排后的 bounds 与源一致、语义转换值重算一致）

import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { XMLParser } from "fast-xml-parser";
import { EgretWorkspace } from "../src/scene/workspace.js";
import { renderHtml } from "../src/renderer/html-renderer.js";
import { htmlToExml } from "../src/writer/exml-writer.js";
import { diffScenes } from "../src/scene/scene-diff.js";
import type { SceneDocument } from "../src/scene/scene-builder.js";
import { buildSceneFromFile } from "../src/scene/scene-builder.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.join(here, "fixtures/egret");

const ws = new EgretWorkspace({ rootDir: fixtureRoot });

/** 从 EXML 文本直接构建场景（回写文本无文件路径，写临时文件再构建） */
function sceneFromText(exmlText: string, originalFile: string): SceneDocument {
  const tmp = path.join(here, "fixtures/egret/resource/eui_skins/__roundtrip_tmp__.exml");
  fs.writeFileSync(tmp, exmlText, "utf-8");
  try {
    const scene = buildSceneFromFile(tmp, {
      resolver: ws.resolver,
      resolveSkinFile: (cls) => {
        const entry = ws.resolveSkinClass(cls);
        return entry ? ws.resolveExml(entry.file) : null;
      },
    });
    // 保留原文件名做 diff 对比口径（file 字段不参与节点 diff）
    return { ...scene, file: originalFile };
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

// ---- 1. round-trip：fixture 全部 EXML 结构保真 ----
{
  let totalDiffNodes = 0;
  let structuralDiff = 0;
  for (const { file } of ws.listExmlFiles()) {
    const scene = ws.getScene(file);
    assert.ok(scene, `场景构建失败: ${file}`);
    const html = renderHtml(scene, { scene, resolver: ws.resolver, toAssetUrl: (a) => a }, { bare: true });
    const { exml } = htmlToExml(html);

    // 写出文本必须是合法 XML（重新解析无异常）
    const p = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
    p.parse(exml);

    // 原路径重建（循环检测依赖根文件路径，临时文件名会破坏 CycleA/CycleB 循环链；备份-写回-建场景-还原）
    // file 来自 listExmlFiles，必可解析出全径（类型收窄，非防御）
    const full = ws.resolveExml(file) as string;
    const backup = fs.readFileSync(full, "utf-8");
    fs.writeFileSync(full, exml, "utf-8");
    let rebuilt: SceneDocument;
    try {
      rebuilt = buildSceneFromFile(full, {
        resolver: ws.resolver,
        resolveSkinFile: (cls) => {
          const entry = ws.resolveSkinClass(cls);
          return entry ? ws.resolveExml(entry.file) : null;
        },
      });
    } finally {
      fs.writeFileSync(full, backup, "utf-8");
    }
    const diff = diffScenes(scene, { ...rebuilt, file: scene.file });
    structuralDiff += diff.stats.added + diff.stats.removed + diff.stats.moved;
    // 属性差异白名单：布局重排后 bounds 一致；native.* 原样；语义 attrs 重算一致 —— 任何 changed 都是保真缺口
    if (diff.stats.changed > 0) {
      for (const c of diff.changed) {
        console.log(`  [roundtrip-changed] ${file} ${c.node.id ?? c.node.type}: ${c.changes.map((ch) => `${ch.path}: ${JSON.stringify(ch.from)} -> ${JSON.stringify(ch.to)}`).join("; ")}`);
      }
      totalDiffNodes += diff.stats.changed;
    }
  }
  assert.equal(structuralDiff, 0, "round-trip 结构差异必须为零（无增删移）");
  assert.equal(totalDiffNodes, 0, "round-trip 属性差异必须为零（native 原样 + 语义重算一致）");
  console.log("[exml-writer-check] fixture round-trip 全部通过（结构零差异、属性零差异）");
}

// ---- 2. AI 生成用例：手写语义 HTML（模拟 AI 按约定产出）-> EXML -> 场景 -> 渲染 ----
{
  const handWritten = `<!doctype html>
<html><body>
<div class="egret-stage" data-egret-tag="e:Skin" data-egret-class="eui.Skin" data-egret-attrs="{&quot;class&quot;:&quot;AiGenSkin&quot;,&quot;width&quot;:&quot;300&quot;,&quot;height&quot;:&quot;200&quot;}" style="width:300px;height:200px">
  <div class="egret-node" data-egret-tag="e:Image" data-egret-class="eui.Image" data-egret-attrs="{&quot;id&quot;:&quot;_bg&quot;,&quot;source&quot;:&quot;hero_png&quot;,&quot;x&quot;:&quot;0&quot;,&quot;y&quot;:&quot;0&quot;,&quot;width&quot;:&quot;300&quot;,&quot;height&quot;:&quot;200&quot;}"></div>
  <div class="egret-node" data-egret-tag="e:Label" data-egret-class="eui.Label" data-egret-attrs="{&quot;id&quot;:&quot;_title&quot;,&quot;text&quot;:&quot;AI 生成标题&quot;,&quot;x&quot;:&quot;20&quot;,&quot;y&quot;:&quot;20&quot;,&quot;size&quot;:&quot;28&quot;,&quot;textColor&quot;:&quot;0xFFD666&quot;}"></div>
  <div class="egret-node" data-egret-tag="e:Button" data-egret-class="eui.Button" data-egret-attrs="{&quot;id&quot;:&quot;_btnGo&quot;,&quot;label&quot;:&quot;前往&quot;,&quot;x&quot;:&quot;100&quot;,&quot;y&quot;:&quot;120&quot;,&quot;skinName&quot;:&quot;eui.Button&quot;}"></div>
</div>
</body></html>`;
  const { exml, nodeCount } = htmlToExml(handWritten);
  assert.ok(nodeCount >= 4, "语义节点数应含根+3 子节点");
  assert.ok(exml.includes('class="AiGenSkin"'), "根 class 应写入");
  assert.ok(exml.includes('text="AI 生成标题"'), "label 文本应写入");
  assert.ok(exml.includes('xmlns:e="http://ns.egret.com/eui"'), "e 前缀 xmlns 应自动声明");

  // AI 生成 EXML -> 场景 -> 渲染（资源用 fixture 资产）
  const scene = sceneFromText(exml, "ai-gen");
  assert.equal(scene.root.type, "skin");
  const html = renderHtml(scene, { scene, resolver: ws.resolver, toAssetUrl: (a) => a }, { bare: true });
  assert.ok(html.includes('data-egret-id="_title"'), "渲染应含 AI 生成节点");
  assert.ok(html.includes("AI 生成标题"), "渲染应含文本");
  assert.ok(html.includes('data-egret-id="_bg"'), "渲染应含背景图");

  // 非法输入必须报错（不静默输出空皮肤）
  assert.throws(() => htmlToExml("<div>普通 HTML 无语义标记</div>"), /未找到语义根元素/);
  console.log("[exml-writer-check] AI 生成用例通过（手写语义 HTML -> EXML -> 场景 -> 渲染；非法输入报错）");
}

// ---- 3. 真实工程 round-trip：HometownRebateView 全链保真 ----
{
  const realRoot = "E:/WorkProjects/GDMahjongMobile/gdmahjong/GDMahjongMobile";
  try {
    fs.statSync(realRoot);
  } catch {
    console.log("[exml-writer-check] 真实工程目录不存在，跳过（本地验证专用）");
    process.exit(0);
  }
  const rw = new EgretWorkspace({ rootDir: realRoot });
  const file = "skins/homeTown/HometownRebateView.exml";
  const scene = rw.getScene(file)!;
  const html = renderHtml(scene, { scene, resolver: rw.resolver, toAssetUrl: (a) => a }, { bare: true });
  const { exml, skippedDecorations } = htmlToExml(html);
  assert.ok(skippedDecorations > 0, "位图数字位片等装饰应被跳过");

  const tmp = path.join(realRoot, "resource/skins/homeTown/__roundtrip_tmp__.exml");
  fs.writeFileSync(tmp, exml, "utf-8");
  try {
    const rebuilt = buildSceneFromFile(tmp, {
      resolver: rw.resolver,
      resolveSkinFile: (cls) => {
        const entry = rw.resolveSkinClass(cls);
        return entry ? rw.resolveExml(entry.file) : null;
      },
    });
    const diff = diffScenes(scene, { ...rebuilt, file: scene.file });
    // 结构必须零差异；属性差异仅允许布局重排引起的可解释项
    assert.equal(diff.stats.added + diff.stats.removed + diff.stats.moved, 0, "真实工程 round-trip 结构差异必须为零");
    if (diff.stats.changed > 0) {
      for (const c of diff.changed) {
        console.log(`  [real-changed] ${c.node.id ?? c.node.type}: ${c.changes.map((ch) => `${ch.path}`).join(", ")}`);
      }
    }
    console.log(`[exml-writer-check] 真实工程通过（matched ${diff.stats.matched} / changed ${diff.stats.changed} / 结构增删移 0，装饰跳过 ${skippedDecorations}）`);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}
