import assert from "node:assert";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createApp } from "../src/server/server.js";
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
fs.mkdirSync(linkDir, { recursive: true });
const link = path.join(linkDir, "evildir");
fs.symlinkSync(fixtureRoot, link, process.platform === "win32" ? "junction" : "dir");

async function get(url: string): Promise<{ status: number; body: string; type: string }> {
  const r = await fetch(base + url);
  return { status: r.status, body: await r.text(), type: r.headers.get("content-type") ?? "" };
}

try {
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

  console.log("[server-check] 全部通过");
} finally {
  server.close();
  // 清理符号链接（先删链接本体，再删包装目录；不动软链目标）
  try {
    fs.rmSync(link, { force: true });
    fs.rmSync(linkDir, { recursive: true, force: true });
  } catch {
    // 清理失败不影响测试结果
  }
}
