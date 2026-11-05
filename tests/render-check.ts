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
  // 场景树：layout 声明记录在 List 节点；itemRendererSkinName 静态展开 3 item（P1-B）
  const listNode = findInScene(scene.root, "listA");
  assert.ok(listNode.layout && listNode.layout.className === "eui.HorizontalLayout");
  assert.equal(listNode.layout.attrs.gap, "5");
  assert.equal(listNode.children.length, 3, "List 应静态展开 3 个 item");
  assert.ok(listNode.children.every((c: any) => c.simulated && String(c.srcFile).endsWith("SampleSkin.exml")));
}

// ---- P1-B：自定义组件递归展开 / List itemRenderer 静态展开（ExpandSkin） ----
{
  const { scene, ctx } = sceneOf("eui_skins/ExpandSkin.exml");
  const html = renderHtml(scene, ctx);
  const find = (n: any, id: string): any => (n.id === id ? n : (n.children ?? []).map((c: any) => find(c, id)).find(Boolean));

  // 类名索引展开：WidgetSkin -> 容器 + 皮肤子树（皮肤声明尺寸 80x40，实例尺寸优先 w2=40）
  const w1 = find(scene.root, "w1");
  assert.equal(w1.type, "container");
  assert.deepEqual(w1.bounds, { x: 10, y: 10, width: 80, height: 40 });
  assert.equal(w1.component?.identity, "WidgetSkin");
  assert.equal(w1.component?.kind, "exml-skin");
  assert.ok(String(w1.srcFile).endsWith("WidgetSkin.exml"), "展开节点应指向源皮肤 EXML");
  assert.equal(w1.children.length, 2, "皮肤子树应嫁接（Rect+Label）");
  assert.ok(w1.children[1].attrs.text === "widget");
  // 子节点 stableKey 前缀 = 源组件文件（实例/源路径分离）
  assert.ok(w1.children[0].stableKey.startsWith("WidgetSkin#"), "子节点 stableKey 应以源文件名为前缀");
  const w2 = find(scene.root, "w2");
  assert.equal(w2.bounds.width, 40, "实例显式宽度应覆盖皮肤声明尺寸");

  // 嵌套展开：WidgetBigSkin 内的 WidgetSkin 二层展开
  const big = find(scene.root, "big");
  const inner = find(big, "inner");
  assert.equal(inner.type, "container");
  assert.equal(inner.children.length, 2, "嵌套二层展开子树完整");
  assert.ok(inner.children[1].stableKey.startsWith("WidgetSkin#"));

  // skinName 属性（字符串形式）优先展开
  const host = find(scene.root, "host");
  assert.equal(host.component?.identity, "GenericHost");
  assert.equal(host.component?.skinClass, "WidgetSkin");
  assert.ok(String(host.srcFile).endsWith("WidgetSkin.exml"));

  // 未解析类名：占位 + unsupported 明示
  const noskin = find(scene.root, "noskin");
  assert.equal(noskin.type, "custom");
  assert.ok(noskin.unsupported.some((u: string) => u.includes("未在类名索引中找到")));

  // 循环引用：CycleA -> CycleB -> CycleA 停止展开，不死循环
  const cy = find(scene.root, "cy");
  const toB = find(cy, "toB");
  const toA = find(toB, "toA");
  assert.equal(toA.type, "custom", "循环回边的节点应停止展开按占位");
  assert.ok(toA.unsupported.some((u: string) => u.includes("循环引用")));
  assert.ok(scene.diagnostics.some((d) => d.code === "SCENE_CUSTOM_CYCLE"));

  // List itemRenderer 静态展开：3 个 item，垂直堆叠（gap=5：y=0/25/50），模拟标记 + 源文件
  const listV = find(scene.root, "listV");
  assert.equal(listV.children.length, 3);
  assert.deepEqual(listV.children.map((c: any) => c.bounds.y), [0, 25, 50], "垂直堆叠 gap=5");
  for (const [i, item] of listV.children.entries()) {
    assert.equal(item.simulated, true, `item${i} 应带静态模拟标记`);
    assert.ok(String(item.srcFile).endsWith("ItemBoxSkin.exml"));
    assert.equal(item.component?.identity, "ItemBoxSkin");
    assert.equal(item.children.length, 2, "item 子树完整（Rect+Label）");
    assert.ok(item.children[1].stableKey.startsWith("ItemBoxSkin#"), "item 子节点用源文件前缀");
    assert.equal(item.instancePath, "ExpandSkin.listV.item" + i);
  }
  // stableKey 唯一性（实例区分）
  const keys = listV.children.map((c: any) => c.stableKey);
  assert.equal(new Set(keys).size, 3);
  // 水平堆叠（listH：x=0/60/120）
  const listH = find(scene.root, "listH");
  assert.deepEqual(listH.children.map((c: any) => c.bounds.x), [0, 60, 120], "水平堆叠");

  // DOM 溯源：data-egret-simulated（两个 List 6 item + 3 个位图数字示例值模拟）
  assert.equal((html.match(/data-egret-simulated="1"/g) ?? []).length, 9, "6 item + 3 位图数字模拟");
  assert.ok(/data-egret-id="w1"[\s\S]*?data-egret-src="[^"]*WidgetSkin\.exml"/.test(html), "展开节点 DOM 溯源到源皮肤");
  assert.ok(html.includes(">widget<"), "皮肤内 Label 文本应渲染");
  // 运行时数据绑定图（source 缺失）：明示上报 + 可见占位
  const boundImg = find(scene.root, "boundImg");
  assert.ok(boundImg.unsupported.some((u: string) => u.includes("source 属性缺失")));
  const bi = html.match(/data-egret-id="boundImg"[^>]*style="([^"]*)"/);
  assert.ok(bi && bi[1].includes("dashed"), "无 source 图应有可见占位框");
}

// ---- P1-C：EUI Layout 应用 + 位图数字拼合（ExpandSkin） ----
{
  const { scene, ctx } = sceneOf("eui_skins/ExpandSkin.exml");
  const html = renderHtml(scene, ctx);
  const find = (n: any, id: string): any => (n.id === id ? n : (n.children ?? []).map((c: any) => find(c, id)).find(Boolean));

  // Group + HorizontalLayout：gap=3 + paddingLeft=5 + verticalAlign=middle；显式 x/y 被布局覆盖
  const grpLay = find(scene.root, "grpLay");
  assert.deepEqual(grpLay.children.map((c: any) => c.bounds.x), [5, 38, 71], "gap=3+paddingLeft=5 顺次排列");
  assert.ok(grpLay.children.every((c: any) => c.bounds.y === 10), "verticalAlign=middle：(40-20)/2=10");
  assert.ok(grpLay.children.every((c: any) => c.bounds.x < 100), "显式 x=999/888/777 应被布局覆盖");

  // TileLayout：未支持明示，子节点保持原位
  const grpTile = find(scene.root, "grpTile");
  assert.ok(grpTile.unsupported.some((u: string) => u.includes("eui.TileLayout 未支持")));
  assert.equal(grpTile.children[0].bounds.x, 0, "未支持布局子节点保持原位");

  // 位图数字：prefix 逐位拼合（示例值 8888 -> 4 帧背景片，推进宽 sourceW）
  const num1 = find(scene.root, "num1");
  assert.equal(num1.type, "bitmapnumber");
  assert.equal(num1.simulated, true, "示例值模拟标记");
  const num1Html = html.match(/data-egret-id="num1"[^>]*>([\s\S]*?)<\/div>/)![1];
  assert.equal((num1Html.match(/<span/g) ?? []).length, 4, "4 个数字位片");
  assert.ok(/left:0px/.test(num1Html) && /left:8px/.test(num1Html), "位片按 sourceW=8 顺次推进");
  assert.ok(/width:8px;height:8px/.test(num1Html), "位片尺寸 sourceW x sourceH");
  // 旋转：rotation=-10 落 transform
  const rot = html.match(/data-egret-id="numRot"[^>]*style="([^"]*)"/)!;
  assert.ok(rot[1].includes("rotate(-10deg)"), "rotation=-10 应落 transform");
  // 无 prefix：占位 + 上报
  const np = find(scene.root, "numNoPrefix");
  assert.ok(np.unsupported.some((u: string) => u.includes("运行时数值未知")));
  const npHtml = html.match(/data-egret-id="numNoPrefix"[^>]*style="([^"]*)"/)!;
  assert.ok(npHtml[1].includes("dashed"), "无 prefix 位图数字应占位");
}

// ---- 真实工程冒烟（存在 GDMahjongMobile 时）：解析一个真实 EXML ----
const REAL_ROOT = process.env.EGRET_PROJECT_ROOT ?? "E:/WorkProjects/GDMahjongMobile/gdmahjong/GDMahjongMobile";
let realWs: EgretWorkspace | null = null;
try {
  realWs = new EgretWorkspace({ rootDir: REAL_ROOT });
} catch (err) {
  // 仅工程不存在时跳过；断言失败必须暴露，不允许降级为跳过
  console.warn(`[render-check] 跳过真实工程冒烟: ${(err as Error).message}`);
}
if (realWs) {
  const realWsRef = realWs;
  const files = realWsRef.listExmlFiles();
  assert.ok(files.length > 100, "真实工程 EXML 数量应大于 100");
  const scene = realWsRef.getScene("eui_skins/BaseCard.exml");
  assert.ok(scene);
  const rootGroup = scene.root.children[0];
  assert.equal(rootGroup.type, "group");
  assert.equal(rootGroup.children.length, 11);
  // pdk_json.puke_da_di_png sheet 引用可解析
  const firstImg = rootGroup.children[0];
  assert.equal(firstImg.asset?.kind, "frame");
  assert.ok(firstImg.asset?.file.includes("pdk.png"));

  // ---- P1-A 目标组件：HometownRebateView 静态框架 ----
  const hb = realWsRef.getScene("skins/homeTown/HometownRebateView.exml");
  assert.ok(hb, "HometownRebateView 场景构建失败");
  const hbHtml = renderHtml(hb, { scene: hb, resolver: realWsRef.resolver, toAssetUrl: (abs) => abs });
  // EmptyBtn 容器化：视图 3 实例 + item 展开 3×2 实例，全部容器渲染无虚线
  const btns = hbHtml.match(/data-egret-component="EmptyBtn"[^>]*style="[^"]*"/g) ?? [];
  assert.equal(btns.length, 9, "EmptyBtn 9 实例（视图 3 + item 展开 3×2）应登记 container 语义");
  assert.ok(btns.every((s) => !s.includes("dashed")), "EmptyBtn 不应再是虚线占位");
  // DragonBones 动画占位：视图 2 处 + item 展开 3×4 处
  assert.equal((hbHtml.match(/data-egret-component-kind="animation"/g) ?? []).length, 14, "动画标注框：视图 2 + item 3×4");
  // Scroller 裁剪容器
  assert.ok(/data-egret-id="_scrollSign"[^>]*overflow:hidden/.test(hbHtml), "Scroller 应为裁剪容器");
  // ArtNumberEUI 三实例登记 bitmap-number 语义
  assert.equal((hbHtml.match(/data-egret-component-kind="bitmap-number"/g) ?? []).length, 3);
  // e:layout 不再渲染为节点
  assert.ok(!hbHtml.includes("unknown:layout") && !hbHtml.includes("unknown:HorizontalLayout"));

  // ---- P1-B：List itemRenderer 静态展开（三个 item 实例完整显示） ----
  const findIn = (n: any, id: string): any => (n.id === id ? n : (n.children ?? []).map((c: any) => findIn(c, id)).find(Boolean));
  const listAccrue = findIn(hb.root, "_listAccrue");
  assert.ok(listAccrue, "_listAccrue 应存在");
  assert.equal(listAccrue.children.length, 3, "应静态展开 3 个 item");
  for (const [i, item] of listAccrue.children.entries()) {
    assert.equal(item.simulated, true);
    assert.ok(String(item.srcFile).endsWith("HometownRebateItemRender.exml"), `item${i} 溯源到源皮肤`);
    assert.equal(item.component?.identity, "HometownRebateItemRenderSkin");
    assert.equal(item.children.length, 1, "item 子树（_grpNormal）");
    assert.ok(item.children[0].stableKey.startsWith("HometownRebateItemRender#"), "item 子节点用源文件前缀");
    assert.deepEqual([item.bounds.width, item.bounds.height], [229.96, 480]);
  }
  // item 排列：水平堆叠 x=0/229.96/459.92
  assert.deepEqual(listAccrue.children.map((c: any) => c.bounds.x).map((v: number) => Math.round(v * 100) / 100), [0, 229.96, 459.92]);
  // item 内部结构完整：背景图/进度条/图标占位/x1 文本/箭头/目标数 5000
  const itemJson = JSON.stringify(listAccrue.children[0]);
  assert.ok(itemJson.includes("_imgBg") && itemJson.includes("5000") && itemJson.includes("x1"), "item 内部关键节点存在");
  assert.ok(itemJson.includes("_btnGet"), "item 内 EmptyBtn 容器化");
  // DOM：模拟标记 + 源文件溯源
  // DOM：模拟标记（P1-B：3 item；P1-C 又加 3 个位图数字，此处只验 item 部分，总数由 P1-C 段验 6）
  assert.ok((hbHtml.match(/data-egret-simulated="1"/g) ?? []).length >= 3);
  assert.ok(/data-egret-src="[^"]*HometownRebateItemRender\.exml"/.test(hbHtml), "DOM 溯源到源皮肤");
  // 运行时绑定图（_imgIcon1 无 source）：明示上报
  assert.ok(itemJson.includes("source 属性缺失"), "运行时绑定图应上报");

  // ---- P1-C：位图数字拼合（三处 ArtNumberEUI 按示例值渲染，无虚线占位） ----
  for (const id of ["_labTotal", "_labCost", "_labJiazeng"]) {
    const el = hbHtml.match(new RegExp(`data-egret-id="${id}"[\\s\\S]*?<\\/div>`))![0];
    assert.ok(!el.includes("dashed"), `${id} 不应再是虚线占位`);
    assert.equal((el.match(/<span/g) ?? []).length, 4, `${id} 应有 4 个数字位片`);
    assert.ok(/data-egret-simulated="1"/.test(el), `${id} 应带模拟标记`);
  }
  // 旋转：_labJiazeng rotation=-10
  const jz = hbHtml.match(/data-egret-id="_labJiazeng"[^>]*style="([^"]*)"/)![1];
  assert.ok(jz.includes("rotate(-10deg)"), "_labJiazeng 应带 -10 度旋转");
  // simulated 总数：3 个位图数字 + 3 个 List item
  assert.equal((hbHtml.match(/data-egret-simulated="1"/g) ?? []).length, 6);

  // ---- P1-A 类名索引（双数据源） ----
  const itemRender = realWsRef.resolveSkinClass("HometownRebateItemRenderSkin");
  assert.ok(itemRender && itemRender.source === "scan");
  assert.equal(itemRender.file, "skins/homeTown/HometownRebateItemRender.exml");
  const artNumber = realWsRef.resolveSkinClass("gdmj.ArtNumber");
  assert.ok(artNumber && artNumber.source === "thm", "thm 映射应优先");
  assert.equal(artNumber.file, "skins/ArtNumber.exml");
  assert.equal(realWsRef.resolveSkinClass("NoSuchSkinClass"), null);
}

console.log("[render-check] 全部通过");
