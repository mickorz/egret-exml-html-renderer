import assert from "node:assert";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// MCP 测试（P0-G）：stdio JSON-RPC 全流程：initialize / tools/list / tools/call 四工具

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.join(here, "fixtures", "egret");
const mainTs = path.join(here, "..", "src", "mcp", "main.ts");

// 直接用当前 node + tsx CLI 启动（Windows 下 spawn npx 不可靠）
const require = createRequire(import.meta.url);
const tsxCli = require.resolve("tsx/cli");
const child = spawn(process.execPath, [tsxCli, mainTs], {
  env: { ...process.env, EGRET_PROJECT_ROOT: fixtureRoot },
  stdio: ["pipe", "pipe", "pipe"],
});
child.stderr.on("data", (d) => process.stderr.write(`[mcp stderr] ${d}`));

let nextId = 1;
const pending = new Map<number, (v: unknown) => void>();
let buf = "";

child.stdout.on("data", (chunk: Buffer) => {
  buf += chunk.toString("utf8");
  let idx: number;
  while ((idx = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    try {
      const msg = JSON.parse(line) as { id?: number; result?: unknown };
      if (msg.id !== undefined && pending.has(msg.id)) {
        pending.get(msg.id)!(msg.result);
        pending.delete(msg.id);
      }
    } catch {
      // 非法行忽略
    }
  }
});

function rpc(method: string, params?: Record<string, unknown>): Promise<never | Record<string, unknown>> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, (v) => resolve(v as Record<string, unknown>));
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`MCP 响应超时: ${method}`));
      }
    }, 30_000);
  });
}

/** 通知不等待响应 */
function notify(method: string): void {
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method }) + "\n");
}

try {
  // initialize
  const init = await rpc("initialize", { protocolVersion: "2024-11-05" }) as { serverInfo?: { name?: string } };
  assert.equal(init.serverInfo?.name, "egret-exml-html-renderer");
  notify("notifications/initialized");

  // tools/list（P2-A 新增 search_ui_assets / find_component_usages）
  const list = await rpc("tools/list") as { tools?: { name: string }[] };
  const names = (list.tools ?? []).map((t) => t.name).sort();
  assert.deepEqual(names, [
    "find_component_usages",
    "get_component_graph",
    "get_exml_scene",
    "get_node_detail",
    "list_exml_files",
    "preview_exml",
    "search_ui_assets",
  ]);

  // list_exml_files
  const files = await rpc("tools/call", { name: "list_exml_files", arguments: {} }) as {
    structuredContent?: { files?: { file: string }[] };
  };
  const fileNames = (files.structuredContent?.files ?? []).map((f) => f.file);
  assert.ok(fileNames.includes("eui_skins/SampleSkin.exml"));

  // get_exml_scene
  const scene = await rpc("tools/call", { name: "get_exml_scene", arguments: { file: "eui_skins/SampleSkin.exml" } }) as {
    structuredContent?: { className?: string; nodes?: { key?: string }[] };
  };
  assert.equal(scene.structuredContent?.className, "SampleSkin");
  const firstKey = scene.structuredContent?.nodes?.[0]?.key ?? "";
  assert.ok(firstKey.startsWith("SampleSkin#"));

  // get_node_detail
  const detail = await rpc("tools/call", { name: "get_node_detail", arguments: { file: "eui_skins/SampleSkin.exml", key: firstKey } }) as {
    structuredContent?: Record<string, unknown>;
  };
  assert.equal(detail.structuredContent?.type, "group");

  // preview_exml（无截图，产物写入临时目录）
  const preview = await rpc("tools/call", { name: "preview_exml", arguments: { file: "eui_skins/SampleSkin.exml" } }) as {
    structuredContent?: { htmlFile?: string; url?: string };
  };
  assert.ok(preview.structuredContent?.htmlFile);
  assert.ok(preview.structuredContent?.url?.startsWith("file:///"));

  // search_ui_assets（P2-A：按组件类型检索，与 HTTP 同一索引服务）
  const search = await rpc("tools/call", { name: "search_ui_assets", arguments: { component: "ArtNumberEUI" } }) as {
    structuredContent?: { count?: number; entries?: { basic: { file: string } }[]; stats?: { fileCount: number; entryCount: number } };
  };
  assert.equal(search.structuredContent?.stats?.fileCount, 11, "fixture 文件数");
  assert.equal(search.structuredContent?.count, 3, "ArtNumberEUI 命中 3 文件");
  assert.ok(search.structuredContent?.entries?.every((e) => e.basic.file.endsWith(".exml")));

  // find_component_usages（P2-A：反查 itemRenderer 引用）
  const usage = await rpc("tools/call", { name: "find_component_usages", arguments: { class: "ItemBoxSkin" } }) as {
    structuredContent?: { usages?: { file: string; kind: string }[] };
  };
  assert.ok(
    usage.structuredContent?.usages?.some((u) => u.file.endsWith("ExpandSkin.exml") && u.kind === "itemRenderer"),
    "反查 ItemBoxSkin 应命中 ExpandSkin",
  );

  // get_component_graph（P2-B：单类邻域）
  const nb = await rpc("tools/call", { name: "get_component_graph", arguments: { class: "ExpandSkin" } }) as {
    structuredContent?: { uses?: { to: string; kind: string }[]; usedBy?: { from: string }[] };
  };
  assert.ok(nb.structuredContent?.uses?.some((e) => e.to === "ItemBoxSkin" && e.kind === "itemRenderer"), "邻域应含 itemRenderer 引用");
  assert.ok(Array.isArray(nb.structuredContent?.usedBy), "邻域应含被引用列表");

  // 未知工具：明确报错
  const unknown = await rpc("tools/call", { name: "no_such_tool", arguments: {} }) as { isError?: boolean };
  assert.equal(unknown.isError, true);

  console.log("[mcp-check] 全部通过");
} finally {
  child.kill();
}
