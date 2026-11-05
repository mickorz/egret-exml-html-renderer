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

/** 按 id 递归查节点（测试辅助） */
function findInScene(root: { id?: string; children: { id?: string; children: unknown[] }[] }, id: string): any {
  const walk = (n: any): any => (n.id === id ? n : (n.children ?? []).map(walk).find(Boolean) ?? null);
  return walk(root);
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
  // ArtNumberEUI 现已登记 bitmap-number 语义（P1-A），按占位渲染但可追溯
  assert.equal(custom.type, "bitmapnumber");
  assert.equal(custom.component?.identity, "ArtNumberEUI");
  assert.ok(custom.unsupported.some((u) => u.includes("ArtNumberEUI")));
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

// ---- P0.1 加固：非对称九宫格 / excludeIn / ui 前缀 skinName（NineSliceSkin） ----
{
  const { scene, ctx } = sceneOf("eui_skins/NineSliceSkin.exml");
  const html = renderHtml(scene, ctx);
  // 非对称九宫格：grid "10,8,14,12" 于 32x32 -> slice 右=8 下=12；border-image-width 右侧必须用 8 而非左侧 10
  assert.ok(html.includes("border-image-slice:8 8 12 10 fill"));
  assert.ok(html.includes("border-image-width:8px 8px 12px 10px"));
  // excludeIn 含默认状态（up）-> 隐藏；不含 -> 可见
  const hidden = html.match(/data-egret-id="excludedDefault"[^>]*style="([^"]*)"/);
  const visible = html.match(/data-egret-id="excludedOther"[^>]*style="([^"]*)"/);
  assert.ok(hidden && hidden[1].includes("display:none"), "excludeIn 含默认状态应隐藏");
  assert.ok(visible && !visible[1].includes("display:none"), "excludeIn 不含默认状态应可见");
  // ui: 前缀（同 EUI namespace）的 skinName 内联皮肤正常提升与渲染
  assert.ok(html.includes('data-egret-id="uiBtn"'));
  assert.ok(html.includes("ui-prefix"));
}

// ---- P1-A：自定义组件语义 / Scroller 容器化 / e:layout 收纳（CustomCompSkin） ----
{
  const { scene, ctx } = sceneOf("eui_skins/CustomCompSkin.exml");
  const html = renderHtml(scene, ctx);
  // EmptyBtn 容器化：容器渲染（非虚线占位），子节点照常渲染，溯源属性携带语义
  const btn = html.match(/data-egret-id="btnA"[^>]*style="([^"]*)"/);
  assert.ok(btn, "btnA 应有 DOM");
  assert.ok(!btn![1].includes("dashed"), "EmptyBtn 应为容器而非虚线占位");
  assert.ok(html.includes('data-egret-component="EmptyBtn"'));
  assert.ok(html.includes('data-egret-component-kind="container"'));
  // 子节点在内：hero_png 资源在 btnA 容器内渲染
  assert.ok(/data-egret-id="btnA"[\s\S]*hero/.test(html), "EmptyBtn 内联子节点应渲染");
  // DragonBonesAni 动画占位：透明标注框 + fileName 标记
  assert.ok(html.includes("[动画] demo_ani"));
  const ani = html.match(/data-egret-id="aniA"[^>]*style="([^"]*)"/);
  assert.ok(ani && ani[1].includes("dashed"), "动画占位应有标注边框");
  assert.ok(html.includes('data-egret-component="DragonBonesAni"'));
  assert.ok(html.includes('data-egret-component-kind="animation"'));
  // ArtNumberEUI 位图数字：P1-C 前按占位渲染，语义登记可追溯（根包与 gdmj 包身份均命中）
  assert.ok(html.includes('data-egret-component="ArtNumberEUI"'));
  assert.ok(html.includes('data-egret-component-kind="bitmap-number"'));
  assert.ok((html.match(/data-egret-component-kind="bitmap-number"/g) ?? []).length >= 2, "两个 ArtNumberEUI 实例均应登记语义");
  // 未登记自定义组件：仍占位（P1-B 展开），不带组件语义属性
  assert.ok(!html.includes('data-egret-component="UnknownComp"'), "未登记组件不应带 component 溯源");
  const unk = html.match(/data-egret-id="unkA"[^>]*style="([^"]*)"/);
  assert.ok(unk && unk[1].includes("dashed"), "未登记组件应保持占位");
  // Scroller 裁剪容器：overflow hidden
  const sc = html.match(/data-egret-id="scrollA"[^>]*style="([^"]*)"/);
  assert.ok(sc && sc[1].includes("overflow:hidden"), "Scroller 应为裁剪容器");
  // e:layout 属性元素不再渲染为未知节点
  assert.ok(!html.includes("unknown:layout") && !html.includes("unknown:HorizontalLayout"), "layout 声明不应渲染为节点");
  assert.ok(!html.includes(">eui.layout<") && !html.includes(">eui.HorizontalLayout<"), "layout 不应出现在占位 label");
  // 场景树：layout 声明记录在 List 节点
  const listNode = findInScene(scene.root, "listA");
  assert.ok(listNode.layout && listNode.layout.className === "eui.HorizontalLayout");
  assert.equal(listNode.layout.attrs.gap, "5");
  assert.ok(listNode.children.length === 0, "List 子节点不含 layout 包装");
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

  // ---- P1-A 目标组件：HometownRebateView 静态框架 ----
  const hb = realWs.getScene("skins/homeTown/HometownRebateView.exml");
  assert.ok(hb, "HometownRebateView 场景构建失败");
  const hbHtml = renderHtml(hb, { scene: hb, resolver: realWs.resolver, toAssetUrl: (abs) => abs });
  // EmptyBtn 容器化：三个实例均无虚线占位
  const btns = hbHtml.match(/data-egret-component="EmptyBtn"[^>]*style="[^"]*"/g) ?? [];
  assert.equal(btns.length, 3, "EmptyBtn 三实例应登记 container 语义");
  assert.ok(btns.every((s) => !s.includes("dashed")), "EmptyBtn 不应再是虚线占位");
  // DragonBones 动画占位：两处标注框
  assert.equal((hbHtml.match(/data-egret-component-kind="animation"/g) ?? []).length, 2);
  assert.ok(hbHtml.includes("[动画] Xiandinglibao_yh") && hbHtml.includes("[动画] Xiandinglibao_01"));
  // Scroller 裁剪容器
  assert.ok(/data-egret-id="_scrollSign"[^>]*overflow:hidden/.test(hbHtml), "Scroller 应为裁剪容器");
  // ArtNumberEUI 三实例登记 bitmap-number 语义
  assert.equal((hbHtml.match(/data-egret-component-kind="bitmap-number"/g) ?? []).length, 3);
  // e:layout 不再渲染为节点
  assert.ok(!hbHtml.includes("unknown:layout") && !hbHtml.includes("unknown:HorizontalLayout"));

  // ---- P1-A 类名索引（双数据源） ----
  const itemRender = realWs.resolveSkinClass("HometownRebateItemRenderSkin");
  assert.ok(itemRender && itemRender.source === "scan");
  assert.equal(itemRender.file, "skins/homeTown/HometownRebateItemRender.exml");
  const artNumber = realWs.resolveSkinClass("gdmj.ArtNumber");
  assert.ok(artNumber && artNumber.source === "thm", "thm 映射应优先");
  assert.equal(artNumber.file, "skins/ArtNumber.exml");
  assert.equal(realWs.resolveSkinClass("NoSuchSkinClass"), null);
} catch (err) {
  console.warn(`[render-check] 跳过真实工程冒烟: ${(err as Error).message}`);
}

console.log("[render-check] 全部通过");
