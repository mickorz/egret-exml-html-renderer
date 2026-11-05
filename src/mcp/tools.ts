import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EgretWorkspace } from "../scene/workspace.js";
import { toSceneJson, relTo, findNodeByKey, nodeDetail } from "../scene/scene-json.js";
import { renderHtml } from "../renderer/html-renderer.js";
import { findComponentUsages, searchUiAssets, type UiAssetQuery } from "../scene/ui-asset-index.js";
import { classNeighborhood, type ComponentGraph } from "../scene/component-graph.js";
import { diffScenes } from "../scene/scene-diff.js";
import { screenshotUrl } from "./chrome.js";

// MCP 四工具的核心逻辑（P0-F）：纯函数、与传输层（stdio 协议壳）分离，便于直测
// 全部只读：preview/screenshot 产物写入系统临时目录，不触碰 Egret 工程

export interface McpContext {
  rootDir: string;
}

/** 每次构造轻量 workspace（res.json 索引毫秒级）；MCP 单请求低频，无需长驻缓存 */
function workspaceOf(ctx: McpContext): EgretWorkspace {
  return new EgretWorkspace({ rootDir: ctx.rootDir });
}

function outDir(): string {
  const dir = path.join(os.tmpdir(), "egret-exml-mcp");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** file:/// 绝对 URL（Windows 盘符与反斜杠归一） */
function fileUrl(abs: string): string {
  return "file:///" + path.resolve(abs).replace(/\\/g, "/");
}

/** 组件关系图谱（与 HTTP /api/component-graph 同一入口）：不传 class 返回全图（可很大），传 class 返回单类邻域 */
export function toolGetComponentGraph(ctx: McpContext, args: { class?: string }): Record<string, unknown> {
  const ws = workspaceOf(ctx);
  const graph = ws.getComponentGraph();
  if (args.class) return classNeighborhood(graph, args.class);
  return graph as unknown as Record<string, unknown>;
}

/** 列出工程内全部 EXML 文件 */
export function toolListExmlFiles(ctx: McpContext): Record<string, unknown> {
  const ws = workspaceOf(ctx);
  return { project: ws.getProjectInfo(), files: ws.listExmlFiles() };
}

/** 全工程 UI 资产索引检索（与 HTTP /api/ui-assets 同一份索引服务）：?class/?file/?component 三条件 AND */
export function toolSearchUiAssets(
  ctx: McpContext,
  args: { class?: string; file?: string; component?: string },
): Record<string, unknown> {
  const ws = workspaceOf(ctx);
  const idx = ws.listUiAssets();
  const q: UiAssetQuery = {};
  if (args.class) q.className = args.class;
  if (args.file) q.fileFuzzy = args.file;
  if (args.component) q.componentType = args.component;
  const entries = Object.keys(q).length ? searchUiAssets(idx.entries, q) : idx.entries;
  return { stats: idx.stats, count: entries.length, diagnostics: idx.diagnostics, parseFailures: idx.parseFailures, entries };
}

/** 反查：某组件类被哪些 EXML 引用（标签引用 + itemRendererSkinName 引用；P2-B 图谱数据基础） */
export function toolFindComponentUsages(ctx: McpContext, args: { class: string }): Record<string, unknown> {
  const ws = workspaceOf(ctx);
  const idx = ws.listUiAssets();
  return { class: args.class, usages: findComponentUsages(idx.entries, args.class) };
}

/** 结构 diff（与 HTTP /api/scene-diff 同一服务）：两份 EXML 的结构差异（新增/删除/移动/属性变化） */
export function toolDiffExmlScenes(ctx: McpContext, args: { fileA: string; fileB: string }): Record<string, unknown> {
  const ws = workspaceOf(ctx);
  const sa = ws.getScene(args.fileA);
  if (!sa) throw new Error(`fileA 不存在或路径越界: ${args.fileA}`);
  const sb = ws.getScene(args.fileB);
  if (!sb) throw new Error(`fileB 不存在或路径越界: ${args.fileB}`);
  return diffScenes(sa, sb) as unknown as Record<string, unknown>;
}

/** 获取 EXML 的 Scene JSON（与 HTTP /api/scene 同一份数据） */
export function toolGetExmlScene(ctx: McpContext, args: { file: string }): Record<string, unknown> {
  const ws = workspaceOf(ctx);
  const scene = ws.getScene(args.file);
  if (!scene) throw new Error(`EXML 不存在或路径越界: ${args.file}`);
  return toSceneJson(scene, { relativize: (a) => relTo(ctx.rootDir, a) });
}

export interface PreviewResult {
  htmlFile: string;
  url: string;
}

/** 渲染 EXML 为独立 HTML 文件（file:// 资源引用），返回预览地址 */
export function toolPreviewExml(ctx: McpContext, args: { file: string; screenshot?: boolean; width?: number; height?: number }): PreviewResult & { screenshotFile?: string } {
  const ws = workspaceOf(ctx);
  const scene = ws.getScene(args.file);
  if (!scene) throw new Error(`EXML 不存在或路径越界: ${args.file}`);
  const html = renderHtml(scene, {
    scene,
    resolver: ws.resolver,
    toAssetUrl: (abs) => fileUrl(abs),
  }, { bare: true });
  const base = path.basename(args.file, ".exml");
  const htmlFile = path.join(outDir(), `${sanitize(base)}.html`);
  fs.writeFileSync(htmlFile, html, "utf8");
  const result: PreviewResult & { screenshotFile?: string } = { htmlFile, url: fileUrl(htmlFile) };
  if (args.screenshot) {
    const width = Math.min(Math.max(args.width ?? scene.stage.width ?? 1280, 200), 3840);
    const height = Math.min(Math.max(args.height ?? scene.stage.height ?? 800, 200), 2160);
    const pngFile = htmlFile.replace(/\.html$/, ".png");
    screenshotUrl(result.url, pngFile, width, height);
    result.screenshotFile = pngFile;
  }
  return result;
}

/** 按 stableKey 查询节点详情（与 Scene JSON 数据一致） */
export function toolGetNodeDetail(ctx: McpContext, args: { file: string; key: string }): Record<string, unknown> {
  const ws = workspaceOf(ctx);
  const scene = ws.getScene(args.file);
  if (!scene) throw new Error(`EXML 不存在或路径越界: ${args.file}`);
  const hit = findNodeByKey(scene.root, args.key);
  if (!hit) throw new Error(`未找到 stableKey 对应的节点: ${args.key}`);
  return nodeDetail(hit.node, scene, { relativize: (a) => relTo(ctx.rootDir, a) });
}

function sanitize(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
}
