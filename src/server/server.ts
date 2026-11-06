import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { EgretWorkspace } from "../scene/workspace.js";
import { toSceneJson, relTo } from "../scene/scene-json.js";
import { renderHtml } from "../renderer/html-renderer.js";
import { editorPageHtml } from "../editor/editor-page.js";
import { findComponentUsages, searchUiAssets, type UiAssetQuery } from "../scene/ui-asset-index.js";
import { classNeighborhood } from "../scene/component-graph.js";
import { diffScenes } from "../scene/scene-diff.js";
import { htmlToExml } from "../writer/exml-writer.js";

// 只读工作区服务（P0-F）：EXML 导航 + Scene JSON + 资源静态服务 + 渲染视图
// 安全边界：所有路径参数经统一守卫 resolveExml/resolveAsset，解析结果必须仍落在资源目录内；全程只读。

export interface AppOptions {
  /** Egret 工程根目录（其下应有 resource/） */
  rootDir: string;
  /** 资源目录名（默认 resource） */
  resourceDirName?: string;
}

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".json": "application/json; charset=utf-8",
  ".xml": "text/xml; charset=utf-8",
  ".exml": "text/xml; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".ttf": "font/ttf",
};

export function createApp(opts: AppOptions): http.Server {
  const ws = new EgretWorkspace({ rootDir: opts.rootDir, resourceDirName: opts.resourceDirName });

  return http.createServer((req, res) => {
    route(req, res, ws).catch((err) => {
      text(res, 500, `服务内部错误: ${String((err as Error)?.message ?? err)}`, "text/plain; charset=utf-8");
    });
  });
}

async function route(req: http.IncomingMessage, res: http.ServerResponse, ws: EgretWorkspace): Promise<void> {
  const u = new URL(req.url ?? "/", "http://localhost");
  const p = u.pathname;
  // 安全前提：只读（文件系统）；POST 仅限 /api/exml-write（接收 HTML 返回 EXML 文本，不落盘）
  if (req.method !== "GET" && req.method !== "HEAD" && !(req.method === "POST" && p === "/api/exml-write")) {
    return text(res, 405, "只读服务，仅支持 GET（POST 仅 /api/exml-write，不写文件）", "text/plain; charset=utf-8");
  }

  if (p === "/") return text(res, 200, editorPageHtml());

  // 工程信息
  if (p === "/api/project") {
    return json(res, 200, ws.getProjectInfo());
  }

  // EXML 文件清单
  if (p === "/api/exml") {
    return json(res, 200, { files: ws.listExmlFiles() });
  }

  // 全工程 UI 资产索引（P2-A）：?class=&file=&component= 三条件 AND 检索；不传条件返回全量
  if (p === "/api/ui-assets") {
    const idx = ws.listUiAssets();
    const q: UiAssetQuery = {};
    const cls = u.searchParams.get("class");
    const file = u.searchParams.get("file");
    const component = u.searchParams.get("component");
    if (cls) q.className = cls;
    if (file) q.fileFuzzy = file;
    if (component) q.componentType = component;
    const entries = Object.keys(q).length ? searchUiAssets(idx.entries, q) : idx.entries;
    return json(res, 200, { stats: idx.stats, diagnostics: idx.diagnostics, parseFailures: idx.parseFailures, count: entries.length, entries });
  }

  // 结构 diff（P2-D）：两份 EXML 的 Scene 结构差异（新增/删除/移动/属性变化，stableKey 定位）
  if (p === "/api/scene-diff") {
    const fileA = u.searchParams.get("fileA") ?? "";
    const fileB = u.searchParams.get("fileB") ?? "";
    if (!fileA || !fileB) return json(res, 400, { error: "需要 fileA 与 fileB 查询参数" });
    const sa = ws.getScene(fileA);
    const sb = ws.getScene(fileB);
    if (!sa) return json(res, 404, { error: `fileA 不存在或路径越界: ${fileA}` });
    if (!sb) return json(res, 404, { error: `fileB 不存在或路径越界: ${fileB}` });
    return json(res, 200, diffScenes(sa, sb));
  }

  // 组件关系图谱（P2-B）：全图（节点/边/环/枢纽/统计）；?class=X 返回单类邻域（直接引用与被引用）
  if (p === "/api/component-graph") {
    const graph = ws.getComponentGraph();
    const cls = u.searchParams.get("class");
    if (cls) return json(res, 200, classNeighborhood(graph, cls));
    return json(res, 200, graph);
  }

  // 反查：某组件类被哪些 EXML 引用（标签引用 + itemRendererSkinName 引用，P2-B 图谱数据基础）
  if (p === "/api/ui-assets/usage") {
    const cls = u.searchParams.get("class") ?? "";
    if (!cls) return json(res, 400, { error: "缺少 class 查询参数" });
    const idx = ws.listUiAssets();
    return json(res, 200, { class: cls, usages: findComponentUsages(idx.entries, cls) });
  }

  // Scene Tree JSON（AI 与前端共用的核心数据模型）
  if (p === "/api/scene") {
    const file = u.searchParams.get("file") ?? "";
    const scene = ws.getScene(file);
    if (!scene) return json(res, 404, { error: `EXML 不存在或路径越界: ${file}` });
    return json(res, 200, toSceneJson(scene, { relativize: (a) => relTo(ws.rootDir, a) }));
  }

  // 渲染视图（完整 HTML，含选择器脚本，供 iframe 消费）
  if (p === "/view") {
    const file = u.searchParams.get("file") ?? "";
    const scene = ws.getScene(file);
    if (!scene) return text(res, 404, `EXML 不存在或路径越界: ${file}`, "text/plain; charset=utf-8");
    const html = renderHtml(
      scene,
      {
        scene,
        resolver: ws.resolver,
        toAssetUrl: (abs) => `/api/assets/${path.relative(ws.resourceDir, abs).split(path.sep).join("/")}`,
      },
      { bare: u.searchParams.get("bare") === "1" },
    );
    return text(res, 200, html);
  }

  // 资源静态服务（图片/图集/atlas json，路径守卫限制在资源目录内）
  if (p.startsWith("/api/assets/")) {
    const rel = decodeURIComponent(p.slice("/api/assets/".length));
    const abs = ws.resolveAsset(rel);
    if (!abs) return text(res, 404, "资源不存在或路径越界", "text/plain; charset=utf-8");
    const ext = path.extname(abs).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
    fs.createReadStream(abs).pipe(res);
    return;
  }

  // EXML 写出（P2-E）：POST body=JSON { html: 语义 HTML }（渲染器 bare 输出或同约定）-> 返回 EXML 文本；不写文件系统
  if (p === "/api/exml-write" && req.method === "POST") {
    const body = await readBody(req, 2 * 1024 * 1024);
    try {
      const { html } = JSON.parse(body) as { html?: string };
      if (typeof html !== "string" || html === "") {
        return json(res, 400, { error: "POST body 需为 JSON 且含非空 html 字段" });
      }
      const result = htmlToExml(html);
      return json(res, 200, result);
    } catch (err) {
      return json(res, 400, { error: (err as Error).message });
    }
  }

  return text(res, 404, "未找到", "text/plain; charset=utf-8");
}

/** 读请求 body（限长，超限报错不静默截断） */
function readBody(req: http.IncomingMessage, limit: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        reject(new Error(`请求体超过限制 ${limit} 字节`));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

function json(res: http.ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function text(res: http.ServerResponse, status: number, body: string, type = "text/html; charset=utf-8"): void {
  res.writeHead(status, { "Content-Type": type });
  res.end(body);
}
