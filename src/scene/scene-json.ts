import path from "node:path";
import type { SceneDocument, SceneNode } from "./scene-builder.js";

// Scene Tree JSON（P0-C）：对 AI / 前端输出的核心数据模型
// 与渲染器共用 buildScene 产出的 instancePath / stableKey，保证「查 JSON = 查画布」。

export interface SceneJsonOptions {
  /** 把绝对文件路径转为对外相对路径（如相对工程根） */
  relativize?: (abs: string) => string;
}

function nodeJson(node: SceneNode, opts: SceneJsonOptions): Record<string, unknown> {
  const base: Record<string, unknown> = {
    type: node.type,
    id: node.id ?? null,
    name: node.name ?? null,
    path: node.instancePath,
    key: node.stableKey,
    bounds: node.bounds ?? null,
    attrs: cleanAttrs(node.attrs),
    native: node.native,
    asset: node.asset
      ? node.asset.kind === "file"
        ? { kind: "file", file: opts.relativize ? opts.relativize(node.asset.file) : node.asset.file }
        : { kind: "frame", file: opts.relativize ? opts.relativize(node.asset.file) : node.asset.file, frame: node.asset.frame }
      : null,
    component: node.component ?? undefined,
    srcFile: node.srcFile && opts.relativize ? opts.relativize(node.srcFile) : node.srcFile,
    simulated: node.simulated ?? undefined,
    layout: node.layout ?? undefined,
    unsupported: node.unsupported.length ? node.unsupported : undefined,
  };
  if (node.children.length) base.children = node.children.map((c) => nodeJson(c, opts));
  return base;
}

/** 剔除构建期临时字段（assetResolved 已提升到 asset 字段） */
function cleanAttrs(attrs: Record<string, unknown>): Record<string, unknown> {
  const { assetResolved, ...rest } = attrs;
  return rest;
}

/** 场景树 -> 结构化 JSON（undefined 字段由 JSON.stringify 自动剔除）；nodes 为根 Skin 的直接子节点（真实 UI 节点） */
export function toSceneJson(scene: SceneDocument, opts: SceneJsonOptions = {}): Record<string, unknown> {
  return {
    file: opts.relativize ? opts.relativize(scene.file) : scene.file,
    className: scene.className,
    stage: scene.stage,
    diagnostics: scene.diagnostics,
    nodes: scene.root.children.map((n) => nodeJson(n, opts)),
  };
}

/** 递归查找节点（stableKey 精确匹配），返回节点与所在父场景 */
export function findNodeByKey(root: SceneNode, key: string): { node: SceneNode; parent: SceneNode | null } | null {
  const walk = (node: SceneNode, parent: SceneNode | null): { node: SceneNode; parent: SceneNode | null } | null => {
    if (node.stableKey === key) return { node, parent };
    for (const c of node.children) {
      const hit = walk(c, node);
      if (hit) return hit;
    }
    return null;
  };
  return walk(root, null);
}

/** 节点详情（MCP get_node_detail 共用） */
export function nodeDetail(node: SceneNode, scene: SceneDocument, opts: SceneJsonOptions = {}): Record<string, unknown> {
  return {
    file: opts.relativize ? opts.relativize(scene.file) : scene.file,
    className: scene.className,
    type: node.type,
    id: node.id ?? null,
    name: node.name ?? null,
    path: node.instancePath,
    key: node.stableKey,
    bounds: node.bounds ?? null,
    attrs: cleanAttrs(node.attrs),
    native: node.native,
    asset: node.asset
      ? node.asset.kind === "file"
        ? { kind: "file", file: opts.relativize ? opts.relativize(node.asset.file) : node.asset.file }
        : { kind: "frame", file: opts.relativize ? opts.relativize(node.asset.file) : node.asset.file, frame: node.asset.frame }
      : null,
    component: node.component ?? undefined,
    srcFile: node.srcFile && opts.relativize ? opts.relativize(node.srcFile) : node.srcFile,
    simulated: node.simulated ?? undefined,
    layout: node.layout ?? undefined,
    unsupported: node.unsupported,
    childCount: node.children.length,
  };
}

/** path 相对工程根的 helper（跨平台分隔符归一） */
export function relTo(root: string, abs: string): string {
  return path.relative(root, abs).split(path.sep).join("/");
}
