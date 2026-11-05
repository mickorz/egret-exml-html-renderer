import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { EgretWorkspace } from "../scene/workspace.js";
import { toSceneJson, relTo } from "../scene/scene-json.js";
import { renderHtml } from "../renderer/html-renderer.js";
import { indexHtml } from "./index-html.js";

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
  // 安全前提：只读
  if (req.method !== "GET" && req.method !== "HEAD") {
    return text(res, 405, "只读服务，仅支持 GET", "text/plain; charset=utf-8");
  }

  if (p === "/") return text(res, 200, indexHtml);

  // 工程信息
  if (p === "/api/project") {
    return json(res, 200, ws.getProjectInfo());
  }

  // EXML 文件清单
  if (p === "/api/exml") {
    return json(res, 200, { files: ws.listExmlFiles() });
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

  return text(res, 404, "未找到", "text/plain; charset=utf-8");
}

function json(res: http.ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function text(res: http.ServerResponse, status: number, body: string, type = "text/html; charset=utf-8"): void {
  res.writeHead(status, { "Content-Type": type });
  res.end(body);
}
