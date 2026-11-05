import type { SceneDocument, SceneNode } from "../scene/scene-builder.js";
import type { EgretAssetResolver } from "../assets/egret-asset-resolver.js";

// 渲染器共享类型：各节点渲染文件（nodes/*.ts）与入口（html-renderer.ts）共用

export interface RenderContext {
  /** 场景文档（舞台尺寸、源文件） */
  scene: SceneDocument;
  /** 资源解析器（图集尺寸查询等） */
  resolver?: EgretAssetResolver;
  /** 资源绝对路径 -> 产物 HTML 中的 URL */
  toAssetUrl: (absFile: string) => string;
  /** 渲染期未支持上报集合（renderHtml 收集，末尾统一展示） */
  unsupported: UnsupportedItem[];
}

/** 未支持项（渲染期补充的上报，与构建期 unsupported 清单合并展示） */
export interface UnsupportedItem {
  nodeId: string;
  reason: string;
}

/** 单个节点的渲染输入：分发层（html-renderer）组装后传给各节点渲染文件 */
export interface NodeRenderInput {
  node: SceneNode;
  ctx: RenderContext;
  /** 渲染子节点（容器类节点调用；html-renderer 负责递归） */
  renderChildren: (node: SceneNode, ctx: RenderContext) => string;
}

export type NodeRenderer = (input: NodeRenderInput) => string;
