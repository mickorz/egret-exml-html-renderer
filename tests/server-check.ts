import assert from "node:assert";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createApp } from "../src/server/server.js";
import { EgretWorkspace } from "../src/scene/workspace.js";
import { renderHtml } from "../src/renderer/html-renderer.js";
import { safeResolveWithin } from "../src/assets/safe-path.js";

// Server 测试（P0-G）：路由 / Scene JSON / 资源静态服务 / 路径穿越防护

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.join(here, "fixtures", "egret");

const server = createApp({ rootDir: fixtureRoot });
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const addr = server.address();
const base = `http://127.0.0.1:${(addr as { port: number }).port}`;

// ---- 符号链接穿越回归环境（P0.1 补充）：资源目录内软链指向外部目录 ----
// Windows 普通权限只能建 directory junction；Linux 用 dir symlink。两者 realpath 行为一致。
const linkDir = path.join(fixtureRoot, "resource", "leak-test");
fs.rmSync(linkDir, { recursive: true, force: true }); // 幂等清理上一轮残留
fs.mkdirSync(linkDir, { recursive: true });
const link = path.join(linkDir, "evildir");
fs.symlinkSync(fixtureRoot, link, process.platform === "win32" ? "junction" : "dir");

async function get(url: string): Promise<{ status: number; body: string; type: string }> {
  const r = await fetch(base + url);
  return { status: r.status, body: await r.text(), type: r.headers.get("content-type") ?? "" };
}

try {

  // ---- P3-A 编辑器页面与 rootKey ----
  {
    const page = await get("/");
    assert.equal(page.status, 200, "/ 应返回编辑器页面");
    assert.ok(page.body.includes('id="left"') && page.body.includes('id="canvas-col"') && page.body.includes('id="right"'), "三栏布局标记应存在（left/canvas-col/right）");
    assert.ok(page.body.includes('id="proj-tree"') && page.body.includes('id="scene-tree"') && page.body.includes('id="frame"'), "工程树/场景树/iframe 标记应存在");
    const sc = await get("/api/scene?file=eui_skins/SampleSkin.exml");
    assert.equal(sc.status, 200);
    const scj = JSON.parse(sc.body) as { rootKey?: string; className: string };
    assert.equal(typeof scj.rootKey, "string", "scene JSON 应含 rootKey（P3-A 树根行身份）");
    assert.ok(scj.rootKey && scj.rootKey.startsWith("SampleSkin#"), "rootKey 应为根 Skin 的 stableKey");
  }

  // ---- P1-A 类名索引（fixture：thm.json 登记 SampleSkin -> thm 优先；未登记类回退 scan） ----
  {
    const ws2 = new EgretWorkspace({ rootDir: fixtureRoot });
    const hit = ws2.resolveSkinClass("SampleSkin");
    assert.ok(hit && hit.source === "thm" && hit.file === "eui_skins/SampleSkin.exml", "thm 登记的 SampleSkin 应以 thm 源命中");
    const scanHit = ws2.resolveSkinClass("WidgetSkin");
    assert.ok(scanHit && scanHit.source === "scan" && scanHit.file === "eui_skins/WidgetSkin.exml", "未入 thm 的类应回退 scan");
    assert.equal(ws2.resolveSkinClass("NoSuchSkinClass"), null, "未登记类名应返回 null");
    // 自定义组件语义出现在 Scene JSON（component 溯源字段）
    const res2 = await get("/api/scene?file=eui_skins/CustomCompSkin.exml");
    assert.equal(res2.status, 200);
    assert.ok(JSON.stringify(JSON.parse(res2.body)).includes('"identity":"EmptyBtn","kind":"container"'), "Scene JSON 应包含 EmptyBtn component 溯源");
  }

  // ---- 统一路径守卫单元断言（P0.1-03） ----
  {
    const resourceDir = path.join(fixtureRoot, "resource");
    assert.ok(safeResolveWithin(resourceDir, "default.res.json"), "资源根内合法路径应放行");
    assert.equal(safeResolveWithin(resourceDir, "../package.json"), null, "路径穿越应拒绝");
    assert.equal(safeResolveWithin(resourceDir, "."), null, "根本身不放行");
    assert.equal(safeResolveWithin(resourceDir, "no_such.png"), null, "不存在的文件返回 null");
  }

  // 工程信息
  {
    const { status, body } = await get("/api/project");
    assert.equal(status, 200);
    const data = JSON.parse(body);
    assert.equal(data.root, "egret");
    assert.equal(data.resourceDir, "resource");
    assert.ok(data.exmlCount >= 3);
  }

  // EXML 清单
  {
    const { status, body } = await get("/api/exml");
    assert.equal(status, 200);
    const data = JSON.parse(body);
    const files = data.files.map((f: { file: string }) => f.file);
    assert.ok(files.includes("eui_skins/SampleSkin.exml"));
    assert.ok(files.includes("eui_skins/LayoutSkin.exml"));
    assert.ok(files.includes("eui_skins/UnknownSkin.exml"));
  }

  // Scene JSON
  {
    const { status, body } = await get(`/api/scene?file=${encodeURIComponent("eui_skins/SampleSkin.exml")}`);
    assert.equal(status, 200);
    const data = JSON.parse(body);
    assert.equal(data.className, "SampleSkin");
    assert.equal(data.stage.width, 300);
    assert.equal(data.nodes[0].type, "group");
    assert.ok(data.nodes[0].key.startsWith("SampleSkin#"));
    // 资源相对路径输出
    assert.ok(JSON.stringify(data).includes("resource/assets/hero.png"));
  }

  // Scene JSON：不存在与路径穿越
  {
    const { status } = await get(`/api/scene?file=${encodeURIComponent("../../package.json")}`);
    assert.equal(status, 404);
    const r2 = await get(`/api/scene?file=no_such.exml`);
    assert.equal(r2.status, 404);
  }

  // 渲染视图
  {
    const { status, body } = await get(`/view?file=${encodeURIComponent("eui_skins/SampleSkin.exml")}`);
    assert.equal(status, 200);
    assert.ok(body.includes("egret-stage"));
    assert.ok(body.includes("data-egret-key"));
    // bare 模式
    const bare = await get(`/view?file=${encodeURIComponent("eui_skins/SampleSkin.exml")}&bare=1`);
    assert.ok(!bare.body.includes('id="egret-info"'));
  }

  // 资源静态服务（图片 + 图集 + atlas json）
  {
    const img = await get("/api/assets/assets/hero.png");
    assert.equal(img.status, 200);
    assert.ok(img.type.includes("image/png"));
    const atlas = await get("/api/assets/assets/atlas.json");
    assert.equal(atlas.status, 200);
    assert.ok(atlas.body.includes("frame_one_png"));
    // 路径穿越
    const evil = await get("/api/assets/../../package.json");
    assert.equal(evil.status, 404);
    // 符号链接穿透：资源目录内软链指向外部文件必须拒绝（realpath 复核）
    const leak = await get("/api/assets/leak-test/evildir/package.json");
    assert.equal(leak.status, 404, "符号链接穿透应拒绝");
    const leakDeep = await get("/api/assets/leak-test/evildir/tsconfig.json");
    assert.equal(leakDeep.status, 404, "符号链接穿透（深层文件）应拒绝");
    // 对照：软链落点若真实路径恰好在资源目录内，则应放行（leak-test/evildir/resource/...）
    const okThrough = await get("/api/assets/leak-test/evildir/resource/default.res.json");
    assert.equal(okThrough.status, 200, "真实路径在资源目录内的软链访问应放行");
  }

  // 写方法拒绝
  {
    const r = await fetch(base + "/api/project", { method: "POST" });
    assert.equal(r.status, 405);
  }

  // ---- P2-B 组件关系图谱路由 ----
  {
    const full = await get("/api/component-graph");
    assert.equal(full.status, 200);
    const g = JSON.parse(full.body) as { stats: { edgeCount: number; edgeKinds: { tag: number } }; cycles: string[][] };
    assert.ok(g.stats.edgeCount > 0, "全图边数应大于 0");
    assert.ok(g.stats.edgeKinds.tag > 0, "tag 边应存在");
    assert.ok(g.cycles.some((c) => c.includes("CycleA") && c.includes("CycleB")), "CycleA/CycleB 应成环");
    const nb = await get("/api/component-graph?class=ItemBoxSkin");
    assert.equal(nb.status, 200);
    const n = JSON.parse(nb.body) as { usedBy: { from: string; kind: string }[] };
    assert.ok(n.usedBy.some((e) => e.from === "ExpandSkin" && e.kind === "itemRenderer"), "ItemBoxSkin 邻域应含 ExpandSkin");
    // P2-A 索引路由（同源回归）
    const assets = await get("/api/ui-assets?component=ArtNumberEUI");
    assert.equal(assets.status, 200);
    const a = JSON.parse(assets.body) as { count: number; entries: { basic: { file: string } }[] };
    assert.equal(a.count, 3, "ArtNumberEUI 应命中 3 文件");
    // P2-D 结构 diff 路由
    const df = await get("/api/scene-diff?fileA=eui_skins/DiffSkinA.exml&fileB=eui_skins/DiffSkinB.exml");
    assert.equal(df.status, 200);
    const d = JSON.parse(df.body) as { stats: { moved: number }; moved: { node: { id: string } }[] };
    assert.equal(d.stats.moved, 1, "应报告 1 处跨父移动");
    assert.equal(d.moved[0].node.id, "mv");
    // 缺参数 400
    const bad = await get("/api/scene-diff?fileA=eui_skins/DiffSkinA.exml");
    assert.equal(bad.status, 400, "缺 fileB 应 400");
    // P2-E EXML 回写路由（POST JSON { html }）：有效语义 HTML -> 200 EXML；非法 -> 400
    const wsW = new EgretWorkspace({ rootDir: fixtureRoot });
    const sc = wsW.getScene("eui_skins/SampleSkin.exml");
    assert.ok(sc, "SampleSkin 场景应可构建");
    const bare = renderHtml(sc, { scene: sc, resolver: wsW.resolver, toAssetUrl: (a) => a }, { bare: true });
    const post = (payload: string) =>
      fetch(`${base}/api/exml-write`, { method: "POST", headers: { "content-type": "application/json" }, body: payload }).then(async (r) => ({ status: r.status, body: await r.text() }));
    const ok = await post(JSON.stringify({ html: bare }));
    assert.equal(ok.status, 200, "有效语义 HTML 回写应 200");
    const wr = JSON.parse(ok.body) as { exml: string; nodeCount: number };
    assert.ok(wr.exml.includes('class="SampleSkin"'), "回写应含根 class");
    assert.ok(wr.exml.includes('id="btn"'), "回写应含 btn 节点");
    assert.ok(wr.exml.includes("<e:skinName>"), "内联按钮皮肤应重建 e:skinName 结构");
    const badHtml = await post(JSON.stringify({ html: "<div>普通 HTML 无语义标记</div>" }));
    assert.equal(badHtml.status, 400, "非法 HTML 应 400");
    const badBody = await post("not-json");
    assert.equal(badBody.status, 400, "非 JSON body 应 400");
  }

  console.log("[server-check] 全部通过");
} finally {
  server.close();
  // 清理符号链接（先删链接本体，再删包装目录；不动软链目标）
  try {
    fs.rmSync(link, { force: true });
    fs.rmSync(linkDir, { recursive: true, force: true });
  } catch (err) {
    console.error("[server-check] 符号链接清理失败（不影响测试结果，但会阻塞下轮运行）:", err);
  }
}
