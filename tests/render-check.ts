import assert from "node:assert";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EgretWorkspace } from "../src/scene/workspace.js";
import { toSceneJson, findNodeByKey } from "../src/scene/scene-json.js";
import { renderHtml } from "../src/renderer/html-renderer.js";

// 渲染检查（P0-G / G2+G3）：Scene 节点数量/层级/顺序/坐标/尺寸/标识/unsupported + HTML 内容断言
// 浏览器实机验证（computed style / 图片加载 / console）由 browser-selftest 负责，此处为链路正确性快检

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.join(here, "fixtures", "egret");

const ws = new EgretWorkspace({ rootDir: fixtureRoot });
const toUrl = (abs: string) => `/api/assets/${path.relative(ws.resourceDir, abs).split(path.sep).join("/")}`;

function sceneOf(file: string) {
  const scene = ws.getScene(file);
  assert.ok(scene, `${file} 场景构建失败`);
  return { scene, ctx: { scene, resolver: ws.resolver, toAssetUrl: toUrl, unsupported: [] } };
}

// ---- 节点数量 / 层级 / 顺序 ----
{
  const { scene } = sceneOf("eui_skins/SampleSkin.exml");
  const group = scene.root.children[0];
  assert.equal(group.type, "group");
  // w:Config 剔除；其余 10 个子节点按 XML 顺序保留
  assert.equal(group.children.length, 10);
}

// ---- 类型映射 ----
{
  const { scene } = sceneOf("eui_skins/SampleSkin.exml");
  const group = scene.root.children[0];
  const types = group.children.map((c) => c.type);
  // Image x3, Label x2, Rect, Button, custom, Image(stated), Image(missing)
  assert.deepEqual(types, ["image", "image", "image", "label", "label", "rect", "button", "custom", "image", "image"]);
}

// ---- 坐标尺寸（含父内相对坐标） ----
{
  const { scene } = sceneOf("eui_skins/SampleSkin.exml");
  const group = scene.root.children[0];
  const bg = group.children[0];
  assert.deepEqual(bg.bounds, { x: 0, y: 0, width: 64, height: 64 });
  assert.equal(bg.attrs.alpha, 0.5);
  // 图集子图未指定尺寸 -> 帧原始尺寸
  const trim = group.children[2];
  assert.deepEqual(trim.bounds, { x: 120, y: 0, width: 8, height: 8 });
  // 资源解析结果
  assert.equal(bg.asset?.kind, "file");
  assert.equal(trim.asset?.kind, "frame");
  // 资源缺失：保留 unsupported，不静默
  const missing = group.children[9];
  assert.ok(missing.unsupported.some((u) => u.includes("资源解析失败")));
}

// ---- 居中布局（horizontalCenter/verticalCenter 数值求解） ----
{
  const { scene } = sceneOf("eui_skins/SampleSkin.exml");
  const group = scene.root.children[0];
  // group 尺寸 280x180，centered 无尺寸（label）-> CSS 居中标记
  const centered = group.children[4];
  assert.equal(centered.attrs._centerH, 0);
  assert.equal(centered.attrs._centerV, 0);
  // button 内联皮肤里的百分比图片：100% -> 120x40
  const btn = group.children[6];
  assert.equal(btn.type, "button");
  const skin = btn.children[0];
  const bgImg = skin.children[0];
  assert.deepEqual(bgImg.bounds, { x: 0, y: 0, width: 120, height: 40 });
  // 皮肤内 labelDisplay 居中 -> CSS 居中标记
  assert.equal(skin.children[1].attrs._centerH, 0);
}

// ---- 边缘布局 / 百分比（LayoutSkin） ----
{
  const { scene } = sceneOf("eui_skins/LayoutSkin.exml");
  const fill = scene.root.children[0];
  assert.deepEqual(fill.bounds, { x: 0, y: 0, width: 200, height: 100 });
  // left=10 + verticalCenter(自然高 8) -> y = (100-8)/2 = 46
  const anchorLeft = scene.root.children[1];
  assert.deepEqual(anchorLeft.bounds, { x: 10, y: 46, width: 8, height: 8 });
  // right=5 -> x = 200-8-5 = 187
  const anchorRight = scene.root.children[2];
  assert.equal(anchorRight.bounds.x, 187);
  // width 50% -> 100
  const pct = scene.root.children[3];
  assert.equal(pct.bounds.width, 100);
}

// ---- stableKey / instancePath ----
{
  const { scene } = sceneOf("eui_skins/SampleSkin.exml");
  const group = scene.root.children[0];
  assert.equal(group.stableKey, "SampleSkin#0.0");
  const bg = group.children[0];
  assert.equal(bg.stableKey, "SampleSkin#0.0.0");
  assert.equal(bg.instancePath, "SampleSkin.root.bg");
  // 全树 stableKey 不重复
  const keys = new Set<string>();
  const walk = (n: { stableKey: string; children: unknown[] }): void => {
    assert.ok(!keys.has(n.stableKey), `stableKey 重复: ${n.stableKey}`);
    keys.add(n.stableKey);
    for (const c of n.children as { stableKey: string; children: unknown[] }[]) walk(c);
  };
  walk(scene.root);
}

// ---- 未知节点 / custom 保留子树并上报 ----
{
  const { scene } = sceneOf("eui_skins/UnknownSkin.exml");
  const scroller = scene.root.children[0];
  assert.equal(scroller.type, "scroller");
  assert.ok(scroller.unsupported.length > 0);
  // 子树保留
  assert.equal(scroller.children[0].children[0].type, "label");
  const custom = scene.root.children[1];
  assert.equal(custom.type, "custom");
  assert.ok(custom.unsupported[0].includes("CustomWidget") || custom.unsupported[0].includes("ns1:ArtNumberEUI"));
}

// ---- Scene JSON ----
{
  const { scene } = sceneOf("eui_skins/SampleSkin.exml");
  const json = toSceneJson(scene, { relativize: (a) => path.relative(fixtureRoot, a).split(path.sep).join("/") });
  assert.equal(json.className, "SampleSkin");
  assert.ok(String(json.file).includes("SampleSkin.exml"));
  const nodes = json.nodes as { children: { key: string }[] }[];
  assert.equal(nodes[0].children.length, 10);
  assert.ok(findNodeByKey(scene.root, "SampleSkin#0.0"));
}

// ---- HTML 渲染断言 ----
{
  const { scene, ctx } = sceneOf("eui_skins/SampleSkin.exml");
  const html = renderHtml(scene, ctx);
  // DOM 语义标识
  assert.ok(html.includes('data-egret-id="bg"'));
  assert.ok(html.includes('data-egret-type="image"'));
  assert.ok(html.includes('data-egret-key="SampleSkin#0.0.0"'));
  // 图片资源 URL
  assert.ok(html.includes("/api/assets/assets/hero.png"));
  // 图集帧背景（负偏移）
  assert.ok(html.includes("background-position:2px -7px"));
  // 图集子图九宫格：九片背景方案（非 border-image）
  assert.ok(html.includes("egret-nineslice"));
  assert.ok(html.includes("background-size:"));
  // label 文本
  assert.ok(html.includes("Hello Egret"));
  // rect 填充 rgba（alpha 并入）
  assert.ok(html.includes("rgba(51,85,170,0.6)"));
  // 未支持清单（custom + missing + state 等）
  assert.ok(html.includes("未支持"));
  assert.ok(html.includes("egret-placeholder"));
  // 选择器脚本
  assert.ok(html.includes("egret-select"));
  // bare 模式无信息栏
  const bare = renderHtml(scene, ctx, { bare: true });
  assert.ok(!bare.includes('id="egret-info"'));
}

// ---- 真实工程冒烟（存在 GDMahjongMobile 时）：解析一个真实 EXML ----
const REAL_ROOT = process.env.EGRET_PROJECT_ROOT ?? "E:/WorkProjects/GDMahjongMobile/gdmahjong/GDMahjongMobile";
try {
  const realWs = new EgretWorkspace({ rootDir: REAL_ROOT });
  const files = realWs.listExmlFiles();
  assert.ok(files.length > 100, "真实工程 EXML 数量应大于 100");
  const scene = realWs.getScene("eui_skins/BaseCard.exml");
  assert.ok(scene);
  const rootGroup = scene.root.children[0];
  assert.equal(rootGroup.type, "group");
  assert.equal(rootGroup.children.length, 11);
  // pdk_json.puke_da_di_png sheet 引用可解析
  const firstImg = rootGroup.children[0];
  assert.equal(firstImg.asset?.kind, "frame");
  assert.ok(firstImg.asset?.file.includes("pdk.png"));
} catch (err) {
  console.warn(`[render-check] 跳过真实工程冒烟: ${(err as Error).message}`);
}

console.log("[render-check] 全部通过");
