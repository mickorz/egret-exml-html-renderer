import path from "node:path";
import { normalizeExmlFile, normalizeExmlText, type NormalizedNode } from "../parser/exml/exml-normalizer.js";
import type { ExmlDiagnostic } from "../parser/exml/exml-types.js";
import { EgretAssetResolver, type ResolvedAsset } from "../assets/egret-asset-resolver.js";
import { componentSemanticOf, identityOf, type ComponentKind } from "./component-registry.js";
import { applyHorizontalLayout, applyVerticalLayout, parseLayoutAttrs } from "./eui-layout.js";

// Egret Scene Builder（P0-C）：EXML 语法树 -> 渲染用场景树
// 职责边界：
//   - 解析器只管 XML 语法；本模块做 EUI 语义归类、基础属性转换、最小静态布局、资源解析挂载
//   - 渲染器只消费场景树，不再理解 EXML
// 布局策略（P0）：绝对定位为主；percentWidth/Height、horizontalCenter/verticalCenter、
//   left/right/top/bottom 在父尺寸已知时做最小静态计算（样本中这些属性缺了页面必乱），
//   完整 EUI Layout 系统（HorizontalLayout 等）不在本阶段。

export interface Bounds {
  x: number;
  y: number;
  width?: number;
  height?: number;
}

export interface SceneNode {
  /** 渲染类型：group/image/label/button/rect/skin/container */
  type: string;
  id?: string;
  name?: string;
  /** 布局求解后的边界（构建期恒产出，尺寸分量可缺省） */
  bounds: Bounds;
  /** 转换后的语义属性（数值化后的 alpha/rotation/text 等） */
  attrs: Record<string, unknown>;
  /** EXML 原始信息（可追溯） */
  native: {
    tag: string;
    className: string;
    attributes: Record<string, string>;
    /** state 后缀属性原样记录（P0 不应用） */
    states: Record<string, Record<string, string>>;
    /** includeIn / excludeIn 原样（P0 不应用） */
    includeIn?: string;
    excludeIn?: string;
  };
  /** 已解析的资源（image 类节点）；解析失败时为 null 并记入 unsupported */
  asset?: ResolvedAsset | null;
  children: SceneNode[];
  instancePath: string;
  stableKey: string;
  /** 自定义组件语义（P1-A）：identity = URI+localName 解析类名；kind = 注册表语义 */
  component?: { identity: string; kind: ComponentKind; skinClass?: string };
  /** 展开来源源 EXML（P1-B）：本子树从哪个组件 EXML 展开（绝对路径）；本文档节点无此字段 */
  srcFile?: string;
  /** 静态模拟标记（P1-B：List 静态 item 等 AI 模拟生成节点） */
  simulated?: boolean;
  /** 布局声明（e:layout 属性元素，P1-A 记录 / P1-C 应用排列） */
  layout?: { className: string; attrs: Record<string, string> };
  /** 未支持特性清单（本次渲染不含的 EXML 特性，必须明确上报） */
  unsupported: string[];
}

export interface SceneDocument {
  /** 源 EXML 绝对路径 */
  file: string;
  /** 皮肤类名（e:Skin class 属性） */
  className: string;
  /** 根节点 */
  root: SceneNode;
  /** 舞台尺寸（Skin width/height，可为空） */
  stage: { width?: number; height?: number };
  /** 文档级诊断（解析 + 场景构建合并） */
  diagnostics: ExmlDiagnostic[];
}

/** 渲染无关属性白名单：静默忽略（交互/缓存标记，静态渲染无意义） */
const IGNORED_ATTRS = new Set([
  "touchEnabled", "touchChildren", "cacheAsBitmap", "cachePolicy",
  "includeIn", "excludeIn", "class", "id", "name",
]);

/** 渲染类型映射：EUI 类名本地部分 -> 场景类型（P0 首批 + P1-A Scroller） */
const EUI_TYPE_MAP: Record<string, string> = {
  Skin: "skin",
  Group: "group",
  Image: "image",
  Label: "label",
  Button: "button",
  Rect: "rect",
  Scroller: "scroller",
};

/** P0 识别但不支持的 EUI 容器/组件（保留节点与子树，渲染为占位容器） */
const EUI_KNOWN_UNSUPPORTED = new Set([
  "List", "DataGroup", "BitmapLabel", "EditableText",
  "TextInput", "CheckBox", "RadioButton", "ProgressBar", "Slider",
  "TabBar", "ItemRenderer", "Panel", "Window", "TitleWindow",
]);

/** 构建选项 */
export interface SceneOptions {
  /** 资源解析器（image source 解析）；不传则全部图片记 unsupported */
  resolver?: EgretAssetResolver;
  /** 组件类名 -> 源 EXML 绝对路径（P1-B 自定义组件展开；workspace.resolveSkinClass 适配） */
  resolveSkinFile?: (className: string) => string | null;
}

interface BuildContext {
  parentPath: string;
  keyPrefix: string;
  indexPath: string;
  /** 父节点已解析尺寸（最小静态布局依据）；根节点无父 */
  parentSize?: { width?: number; height?: number };
  diagnostics: ExmlDiagnostic[];
  /** 皮肤默认状态名（states 列表首项，includeIn 归属判断用） */
  defaultState?: string;
  /** 组件类名 -> 源 EXML 绝对路径（P1-B 展开） */
  resolveSkinFile?: (className: string) => string | null;
  /** 展开缓存（本次构建内按文件路径复用归一化树；解析失败缓存 null；每次构建 fresh，不做跨请求缓存） */
  expandCache: Map<string, NormalizedNode | null>;
  /** 当前展开链（祖先皮肤文件；循环引用检测用，每分支独立副本） */
  skinChain: string[];
}

/** List/DataGroup 静态模拟 item 数量（运行时数据驱动，静态展示用） */
const STATIC_ITEM_COUNT = 3;

/** "100%" -> 100；非百分比返回 null */
function parsePercent(v: string): number | null {
  const m = /^(-?[\d.]+)%$/.exec(v.trim());
  return m ? Number(m[1]) : null;
}

/**
 * 场景树构建入口：解析 + 归一化 + 转换。
 * 每次调用重新解析（fresh），服务端刷新即生效，不做文件缓存（工程量级实测足够）。
 */
export function buildSceneFromFile(exmlFile: string, opts: SceneOptions = {}): SceneDocument {
  const { root, diagnostics } = normalizeExmlFile(exmlFile);
  return buildScene(root, diagnostics, path.normalize(exmlFile), opts);
}

/** 从 EXML 文本构建（测试入口） */
export function buildSceneFromText(text: string, file: string, opts: SceneOptions = {}): SceneDocument {
  const { root, diagnostics } = normalizeExmlText(text, file);
  return buildScene(root, diagnostics, path.normalize(file), opts);
}

function buildScene(root: NormalizedNode, diagnostics: ExmlDiagnostic[], file: string, opts: SceneOptions): SceneDocument {
  const skinClass = root.attrs.class ?? path.basename(file, ".exml");
  const skinPref = measurePreferred(root, opts, file);
  const skinW = num(root.attrs.width) ?? skinPref.width;
  const skinH = num(root.attrs.height) ?? skinPref.height;
  const ctx: BuildContext = {
    parentPath: skinClass,
    keyPrefix: path.basename(file, ".exml"),
    indexPath: "",
    diagnostics,
    // EUI 缺省态 = states 列表首项
    defaultState: root.attrs.states?.split(",")[0]?.trim(),
    resolveSkinFile: opts.resolveSkinFile,
    expandCache: new Map(),
    skinChain: [path.normalize(file)],
  };
  const rootNode = convertNode(root, ctx, opts, file, { width: skinW, height: skinH });
  return { file, className: skinClass, root: rootNode, stage: { width: skinW, height: skinH }, diagnostics };
}

function num(v: string | undefined): number | undefined {
  if (v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * 首选尺寸自底向上测量（Egret measuredWidth/Height 语义）：
 * 显式尺寸 > 图片自然尺寸（图集帧/PNG 头） > 容器类按子节点包围盒。
 * 用于无显式尺寸的容器（Group/Button/内联 Skin）参与父级布局求解。
 */
function measurePreferred(n: NormalizedNode, opts: SceneOptions, file: string): { width?: number; height?: number } {
  const w = num(n.attrs.width);
  const h = num(n.attrs.height);
  if (w !== undefined && h !== undefined) return { width: w, height: h };
  // 图片自然尺寸
  if (n.kind === "eui" && n.raw.localName === "Image" && opts.resolver) {
    const source = n.attrs.source;
    if (source) {
      const hit = opts.resolver.resolve(source, { exmlFile: file });
      if (hit?.kind === "frame") return { width: hit.frame.sourceW || hit.frame.w, height: hit.frame.sourceH || hit.frame.h };
      if (hit?.kind === "file") {
        const size = opts.resolver.imageSize(hit.file);
        if (size) return { width: size.width, height: size.height };
      }
    }
    return { width: w, height: h };
  }
  // 容器类：子节点包围盒（子节点 x/y 为组内相对坐标，尺寸用各自首选值）；显式维度优先
  let maxX = 0;
  let maxY = 0;
  let any = false;
  for (const c of n.children) {
    const cw = measurePreferred(c, opts, file);
    const cx = num(c.attrs.x) ?? 0;
    const cy = num(c.attrs.y) ?? 0;
    if (cw.width !== undefined) {
      maxX = Math.max(maxX, cx + cw.width);
      any = true;
    }
    if (cw.height !== undefined) {
      maxY = Math.max(maxY, cy + cw.height);
      any = true;
    }
  }
  return {
    width: w ?? (any ? maxX : undefined),
    height: h ?? (any ? maxY : undefined),
  };
}

/** 单节点转换：类型归类 + 属性转换 + 布局计算 + 子树递归 */
function convertNode(n: NormalizedNode, ctx: BuildContext, opts: SceneOptions, file: string, parentSize?: { width?: number; height?: number }): SceneNode {
  const unsupported: string[] = [];
  let type: string;
  // 自定义组件语义（P1-A：URI+localName 身份 -> 注册表语义分派）
  let component: { identity: string; kind: ComponentKind; skinClass?: string } | undefined;
  // P1-B 展开状态：皮肤源文件 + 归一化树（展开后子树来自源组件 EXML）
  let expandSkinFile: string | null = null;
  let expandSkinRoot: NormalizedNode | null = null;
  let srcFile: string | undefined;
  let simulated: boolean | undefined;
  if (n.kind === "eui") {
    type = EUI_TYPE_MAP[n.raw.localName]
      ?? (EUI_KNOWN_UNSUPPORTED.has(n.raw.localName)
        ? n.raw.localName.toLowerCase()
        : `unknown:${n.raw.localName}`);
    if (!EUI_TYPE_MAP[n.raw.localName] && !EUI_KNOWN_UNSUPPORTED.has(n.raw.localName)) {
      unsupported.push(`EUI 组件 ${n.className} 未支持，按占位容器渲染`);
      ctx.diagnostics.push({ level: "warning", code: "SCENE_EUI_NODE_UNSUPPORTED", message: `EUI 组件未支持: ${n.className}`, nodeId: n.attrs.id });
    } else if (EUI_KNOWN_UNSUPPORTED.has(n.raw.localName)) {
      unsupported.push(`EUI 组件 ${n.className} 暂不支持运行时行为，按占位容器渲染`);
      ctx.diagnostics.push({ level: "warning", code: "SCENE_EUI_NODE_UNSUPPORTED", message: `EUI 组件暂不支持: ${n.className}`, nodeId: n.attrs.id });
    } else if (type === "scroller") {
      // P1-A：Scroller 容器化（裁剪容器）；滚动交互/viewport 自适应静态不支持
      unsupported.push("Scroller 滚动交互未支持，按裁剪容器渲染（scrollPolicy/viewport 静态忽略）");
      ctx.diagnostics.push({ level: "warning", code: "SCENE_EUI_PARTIAL", message: `Scroller 按裁剪容器渲染: ${n.className}`, nodeId: n.attrs.id });
    }
  } else if (n.kind === "custom") {
    const identity = identityOf(n.nsUri ?? "", n.raw.localName);
    const sem = componentSemanticOf(identity, n.raw.localName);
    if (sem && sem.kind !== "exml-skin") {
      // 已登记代码组件：按语义分派（exml-skin 候选走下面的展开分支）
      component = { identity: sem.className, kind: sem.kind };
      if (sem.kind === "container") {
        // 代码组件但视觉=内联子节点：按坐标系容器渲染（同 Group）
        type = "container";
        unsupported.push(`自定义组件 ${sem.className} 按 container 语义渲染（视觉=内联子节点）`);
      } else if (sem.kind === "animation") {
        type = "animation";
        unsupported.push(`动画组件 ${sem.className} 静态不可还原，按标注占位渲染（fileName=${n.attrs.fileName ?? "?"}, animationName=${n.attrs.animationName ?? "?"}）`);
        ctx.diagnostics.push({ level: "warning", code: "SCENE_ANIMATION_PLACEHOLDER", message: `动画组件按占位渲染: ${n.className}（fileName=${n.attrs.fileName ?? "?"}）`, nodeId: n.attrs.id });
      } else {
        // bitmap-number：prefix 位图数字逐位拼合（渲染器实现），运行时数值未知按示例值静态模拟
        type = "bitmapnumber";
        simulated = true;
        unsupported.push(`位图数字组件 ${sem.className} 运行时数值未知，按示例值静态模拟渲染（prefix=${n.attrs.prefix ?? "?"}）`);
        ctx.diagnostics.push({ level: "warning", code: "SCENE_BITMAP_NUMBER_PLACEHOLDER", message: `位图数字按示例值模拟: ${n.className}`, nodeId: n.attrs.id });
      }
    } else {
      // exml-skin 候选（P1-B）：类名索引展开；skinName 属性（字符串形式）优先于标签类名
      const skinClass = typeof n.attrs.skinName === "string" && n.attrs.skinName !== "" ? n.attrs.skinName : identity;
      const skinFile = ctx.resolveSkinFile?.(skinClass) ?? null;
      if (skinFile) {
        if (ctx.skinChain.includes(skinFile)) {
          // 循环引用：停止展开，占位并明示（不静默丢弃子树）
          type = "custom";
          unsupported.push(`自定义组件 ${identity} 循环引用（${path.basename(skinFile)} 已在展开链中），停止展开按占位渲染`);
          ctx.diagnostics.push({ level: "warning", code: "SCENE_CUSTOM_CYCLE", message: `循环引用停止展开: ${identity} -> ${skinFile}`, nodeId: n.attrs.id });
        } else {
          const skinRoot = loadSkinRoot(skinFile, ctx);
          if (!skinRoot) {
            type = "custom";
            unsupported.push(`自定义组件 ${identity} 皮肤解析失败（${path.basename(skinFile)}），按占位容器渲染`);
          } else {
            expandSkinFile = skinFile;
            expandSkinRoot = skinRoot;
            type = "container";
            component = { identity, kind: "exml-skin", skinClass };
            srcFile = skinFile;
            ctx.diagnostics.push({ level: "warning", code: "SCENE_CUSTOM_EXPANDED", message: `自定义组件展开: ${identity} -> ${path.basename(skinFile)}`, nodeId: n.attrs.id });
          }
        }
      } else {
        type = "custom";
        unsupported.push(`自定义组件 ${identity} 皮肤类 ${skinClass} 未在类名索引中找到，按占位容器渲染`);
        ctx.diagnostics.push({ level: "warning", code: "SCENE_CUSTOM_NODE", message: `自定义组件未展开（皮肤类未找到）: ${n.className} (${skinClass})`, nodeId: n.attrs.id });
      }
    }
  } else {
    type = "unknown";
    unsupported.push(`未知节点 ${n.raw.tag}`);
  }
  if (Object.keys(n.states).length) unsupported.push(`state 属性未应用: ${Object.keys(n.states).map((s) => `${s}(×${Object.keys(n.states[s]).length})`).join(", ")}`);

  // ---- 属性转换 ----
  const a = n.attrs;
  const attrs: Record<string, unknown> = {};
  if (num(a.x) !== undefined) attrs.x = num(a.x);
  if (num(a.y) !== undefined) attrs.y = num(a.y);
  if (a.alpha !== undefined) {
    const al = num(a.alpha);
    if (al !== undefined) attrs.alpha = al;
    else unsupported.push(`alpha="${a.alpha}" 非数值`);
  }
  if (num(a.rotation) !== undefined) attrs.rotation = num(a.rotation);
  if (num(a.scaleX) !== undefined) attrs.scaleX = num(a.scaleX);
  if (num(a.scaleY) !== undefined) attrs.scaleY = num(a.scaleY);
  if (a.visible !== undefined) attrs.visible = a.visible === "true";
  if (num(a.anchorOffsetX) !== undefined) attrs.anchorOffsetX = num(a.anchorOffsetX);
  if (num(a.anchorOffsetY) !== undefined) attrs.anchorOffsetY = num(a.anchorOffsetY);
  // 布局约束原样记录（百分比/中心/边缘），布局阶段消费
  for (const key of ["left", "right", "top", "bottom", "horizontalCenter", "verticalCenter"] as const) {
    if (a[key] !== undefined) attrs[key] = num(a[key]) ?? a[key];
  }
  // 忽略清单外的未知属性不再逐个上报（native.attributes 已完整保留，避免诊断噪音）
  // 状态归属判定（EUI 语义：includeIn 与 excludeIn 同时指定时 includeIn 优先）：
  //   includeIn 不含默认状态 -> 隐藏；excludeIn 含默认状态 -> 隐藏；两者均无法精确判定时记录上报
  if (n.includeIn !== undefined) {
    const states = n.includeIn.split(",").map((s) => s.trim());
    if (ctx.defaultState === undefined || !states.includes(ctx.defaultState)) {
      attrs.visible = false;
      unsupported.push(`includeIn="${n.includeIn}" 不含默认状态，已隐藏（状态切换 P0 未支持）`);
    } else {
      unsupported.push(`includeIn="${n.includeIn}" 状态归属未应用（含默认状态，按可见渲染）`);
    }
  } else if (n.excludeIn !== undefined) {
    const excluded = n.excludeIn.split(",").map((s) => s.trim());
    if (ctx.defaultState === undefined) {
      unsupported.push(`excludeIn="${n.excludeIn}" 无法判定默认状态，按可见渲染（状态切换 P0 未支持）`);
    } else if (excluded.includes(ctx.defaultState)) {
      attrs.visible = false;
      unsupported.push(`excludeIn="${n.excludeIn}" 包含默认状态，已隐藏（状态切换 P0 未支持）`);
    } else {
      unsupported.push(`excludeIn="${n.excludeIn}" 状态归属未应用（不含默认状态，按可见渲染）`);
    }
  }

  // ---- 类型专属属性 ----
  if (type === "label") convertLabelAttrs(a, attrs, unsupported);
  if (type === "image") convertImageAttrs(a, attrs, unsupported, opts, file);
  if (type === "rect") convertRectAttrs(a, attrs, unsupported);
  if (type === "button") {
    if (a.label !== undefined) attrs.label = a.label;
    if (n.children.length === 0) unsupported.push("button 无内联 skinName 皮肤，按占位容器渲染");
  }

  // ---- 尺寸与位置（最小静态布局） ----
  // 展开皮肤声明尺寸作为自然尺寸（实例无显式尺寸时回落，Egret measuredSize 语义）
  if (expandSkinRoot && expandSkinFile) {
    const skinPref = measurePreferred(expandSkinRoot, opts, expandSkinFile);
    if (skinPref.width !== undefined) attrs.naturalWidth = skinPref.width;
    if (skinPref.height !== undefined) attrs.naturalHeight = skinPref.height;
  }
  const bounds = layoutBounds(a, attrs, ctx, parentSize, unsupported);
  // 无显式/百分比/边缘/自然尺寸时：容器类按子节点包围盒测量（Egret measuredSize 语义）
  if (bounds.width === undefined || bounds.height === undefined) {
    const pref = measurePreferred(n, opts, file);
    if (bounds.width === undefined && pref.width !== undefined) bounds.width = pref.width;
    if (bounds.height === undefined && pref.height !== undefined) bounds.height = pref.height;
  }

  const indexPath = ctx.indexPath;
  const stableKey = `${ctx.keyPrefix}#${indexPath || "0"}`;
  const name = a.name ?? a.id;
  const childCtx: BuildContext = {
    parentPath: type === "skin" ? ctx.parentPath : `${ctx.parentPath}.${name ?? type}`,
    keyPrefix: ctx.keyPrefix,
    indexPath: indexPath ? `${indexPath}` : "0",
    diagnostics: ctx.diagnostics,
    defaultState: ctx.defaultState,
    resolveSkinFile: ctx.resolveSkinFile,
    expandCache: ctx.expandCache,
    skinChain: ctx.skinChain,
  };

  const children: SceneNode[] = [];
  // Skin 是透明包装层（无自身布局语义）：子节点使用外层容器的尺寸，不使用 Skin 自身的空 bounds
  const childParentSize = type === "skin" ? parentSize : { width: bounds.width, height: bounds.height };
  if (expandSkinRoot && expandSkinFile) {
    // 展开皮肤子树（P1-B）：皮肤根为透明包装层，子节点相对皮肤根坐标、父尺寸 = 本节点 bounds；
    // stableKey 前缀切换为源组件 EXML（实例路径与源组件路径分离）；状态归属按源皮肤默认状态
    const skinCtx: BuildContext = {
      parentPath: childCtx.parentPath,
      keyPrefix: path.basename(expandSkinFile, ".exml"),
      indexPath: "",
      parentSize: childParentSize,
      diagnostics: ctx.diagnostics,
      defaultState: expandSkinRoot.attrs.states?.split(",")[0]?.trim(),
      resolveSkinFile: ctx.resolveSkinFile,
      expandCache: ctx.expandCache,
      skinChain: [...ctx.skinChain, expandSkinFile],
    };
    for (let i = 0; i < expandSkinRoot.children.length; i++) {
      skinCtx.indexPath = `${indexPath || "0"}.s${i}`;
      children.push(convertNode(expandSkinRoot.children[i], skinCtx, opts, expandSkinFile, childParentSize));
    }
    // 实例内联子节点（自定义组件标签下直接写的子节点）：contentGroup 归属语义未精确实现，按并列渲染并明示
    if (n.children.length) {
      unsupported.push(`自定义组件 ${n.className} 同时含内联子节点与展开皮肤子节点（contentGroup 语义未实现，按并列渲染）`);
      for (let i = 0; i < n.children.length; i++) {
        childCtx.indexPath = `${indexPath || "0"}.${i}`;
        children.push(convertNode(n.children[i], childCtx, opts, file, childParentSize));
      }
    }
  } else {
    for (let i = 0; i < n.children.length; i++) {
      childCtx.indexPath = `${indexPath || "0"}.${i}`;
      children.push(convertNode(n.children[i], childCtx, opts, file, childParentSize));
    }
    // List/DataGroup itemRendererSkinName 静态展开（P1-B：运行时数据驱动，静态模拟 N 个 item）
    if ((type === "list" || type === "datagroup") && n.attrs.itemRendererSkinName) {
      children.push(...buildStaticItems(n, ctx, opts, childCtx, indexPath, bounds, unsupported));
    }
    // EUI Layout 应用（P1-C）：容器类声明 Horizontal/VerticalLayout 时重排子节点
    // （EUI 语义：布局管理子节点位置，覆盖显式 x/y；List/DataGroup item 布局在 buildStaticItems 内应用）
    if (n.layout && (type === "group" || type === "container" || type === "scroller")) {
      const la = parseLayoutAttrs(n.layout.attrs);
      if (n.layout.className === "eui.HorizontalLayout") {
        applyHorizontalLayout(children, { width: bounds.width, height: bounds.height }, la);
        ctx.diagnostics.push({ level: "warning", code: "SCENE_LAYOUT_APPLIED", message: `HorizontalLayout 已应用（gap=${la.gap}）`, nodeId: n.attrs.id });
      } else if (n.layout.className === "eui.VerticalLayout") {
        applyVerticalLayout(children, { width: bounds.width, height: bounds.height }, la);
        ctx.diagnostics.push({ level: "warning", code: "SCENE_LAYOUT_APPLIED", message: `VerticalLayout 已应用（gap=${la.gap}）`, nodeId: n.attrs.id });
      }
    }
  }
  // 布局声明未应用时必须明示（不静默丢弃）：未支持的布局类型 / 非容器宿主
  if (n.layout) {
    const applied =
      (type === "list" || type === "datagroup") && !!n.attrs.itemRendererSkinName
        ? n.layout.className === "eui.HorizontalLayout" || n.layout.className === "eui.VerticalLayout"
        : (type === "group" || type === "container" || type === "scroller") &&
          (n.layout.className === "eui.HorizontalLayout" || n.layout.className === "eui.VerticalLayout");
    if (!applied) {
      unsupported.push(`布局 ${n.layout.className} 未支持（仅 Horizontal/Vertical），子节点保持原位`);
    }
  }

  return {
    type,
    id: a.id,
    name: a.name,
    bounds,
    attrs,
    native: {
      tag: n.raw.tag,
      className: n.className,
      attributes: { ...n.raw.attributes },
      states: n.states,
      includeIn: n.includeIn,
      excludeIn: n.excludeIn,
    },
    asset: (attrs.assetResolved as ResolvedAsset | null | undefined) ?? undefined,
    children,
    instancePath: `${ctx.parentPath}.${name ?? type}`,
    stableKey,
    component,
    srcFile,
    simulated,
    layout: n.layout ? { className: n.layout.className, attrs: { ...n.layout.attrs } } : undefined,
    unsupported,
  };
}

/** 加载皮肤归一化树（P1-B 展开缓存：本次构建内按文件复用；解析失败记诊断返回 null，不静默） */
function loadSkinRoot(skinFile: string, ctx: BuildContext): NormalizedNode | null {
  if (ctx.expandCache.has(skinFile)) return ctx.expandCache.get(skinFile) ?? null;
  try {
    const r = normalizeExmlFile(skinFile);
    ctx.diagnostics.push(...r.diagnostics);
    ctx.expandCache.set(skinFile, r.root);
    return r.root;
  } catch (err) {
    ctx.expandCache.set(skinFile, null);
    ctx.diagnostics.push({ level: "error", code: "SCENE_SKIN_PARSE_FAIL", message: `皮肤 EXML 解析失败: ${skinFile} (${(err as Error).message})` });
    return null;
  }
}

/**
 * List/DataGroup 静态 item 展开（P1-B/P1-C）：itemRendererSkinName -> 源皮肤 -> 模拟 N 个 item。
 * 排列（P1-C）：HorizontalLayout/VerticalLayout 精确应用（gap/padding/对齐；未声明默认垂直）；
 * 其他布局类型按垂直堆叠近似并明示。
 * 溯源：item 节点 simulated 标记 + srcFile 指向源皮肤 EXML；子节点 stableKey 用源文件前缀。
 */
function buildStaticItems(
  n: NormalizedNode,
  ctx: BuildContext,
  opts: SceneOptions,
  childCtx: BuildContext,
  indexPath: string,
  box: { width?: number; height?: number },
  unsupported: string[],
): SceneNode[] {
  const cls = n.attrs.itemRendererSkinName!;
  const skinFile = ctx.resolveSkinFile?.(cls) ?? null;
  if (!skinFile) {
    unsupported.push(`List itemRendererSkinName="${cls}" 未在类名索引中找到，item 未展开`);
    ctx.diagnostics.push({ level: "warning", code: "SCENE_LIST_RENDERER_MISSING", message: `itemRenderer 皮肤类未找到: ${cls}`, nodeId: n.attrs.id });
    return [];
  }
  const skinRoot = loadSkinRoot(skinFile, ctx);
  if (!skinRoot) {
    unsupported.push(`List itemRenderer 皮肤解析失败（${path.basename(skinFile)}），item 未展开`);
    return [];
  }
  const pref = measurePreferred(skinRoot, opts, skinFile);
  const layoutCls = n.layout?.className ?? "";
  const la = parseLayoutAttrs(n.layout?.attrs ?? {});
  const horizontal = layoutCls === "eui.HorizontalLayout";
  if (layoutCls !== "" && layoutCls !== "eui.HorizontalLayout" && layoutCls !== "eui.VerticalLayout") {
    unsupported.push(`布局 ${layoutCls} 未支持，item 按垂直堆叠近似`);
  }
  const items: SceneNode[] = [];
  for (let i = 0; i < STATIC_ITEM_COUNT; i++) {
    const itemParentSize = { width: pref.width, height: pref.height };
    const itemCtx: BuildContext = {
      parentPath: `${childCtx.parentPath}.item${i}`,
      keyPrefix: path.basename(skinFile, ".exml"),
      indexPath: "",
      parentSize: itemParentSize,
      diagnostics: ctx.diagnostics,
      defaultState: skinRoot.attrs.states?.split(",")[0]?.trim(),
      resolveSkinFile: ctx.resolveSkinFile,
      expandCache: ctx.expandCache,
      skinChain: [...ctx.skinChain, skinFile],
    };
    const itemChildren: SceneNode[] = [];
    for (let j = 0; j < skinRoot.children.length; j++) {
      itemCtx.indexPath = `${indexPath || "0"}.i${i}.${j}`;
      itemChildren.push(convertNode(skinRoot.children[j], itemCtx, opts, skinFile, itemParentSize));
    }
    items.push({
      type: "container",
      bounds: { x: 0, y: 0, width: pref.width, height: pref.height },
      attrs: {},
      native: {
        tag: "List:itemRenderer",
        className: cls,
        attributes: { itemRendererSkinName: cls, index: String(i) },
        states: {},
      },
      asset: undefined,
      children: itemChildren,
      instancePath: `${childCtx.parentPath}.item${i}`,
      stableKey: `${ctx.keyPrefix}#${indexPath || "0"}.i${i}`,
      component: { identity: cls, kind: "exml-skin", skinClass: cls },
      srcFile: skinFile,
      simulated: true,
      unsupported: [`List 静态模拟 item（运行时数据驱动，示例第 ${i + 1} 项）`],
    });
  }
  // 排列（P1-C）：按布局声明精确应用（gap/padding/对齐；EUI List 未声明布局时默认垂直）
  if (horizontal) applyHorizontalLayout(items, box, la);
  else applyVerticalLayout(items, box, la);
  unsupported.push(`List 运行时数据驱动，静态模拟 ${STATIC_ITEM_COUNT} 个 item（itemRenderer=${cls}，布局 ${layoutCls || "默认垂直"} 已应用）`);
  ctx.diagnostics.push({ level: "warning", code: "SCENE_LIST_STATIC_ITEMS", message: `List 静态模拟 ${STATIC_ITEM_COUNT} 个 item: ${cls}`, nodeId: n.attrs.id });
  return items;
}

/** 文本属性转换（EUI Label -> 语义属性） */
function convertLabelAttrs(a: Record<string, string>, attrs: Record<string, unknown>, unsupported: string[]): void {
  if (a.text !== undefined) attrs.text = a.text;
  // EUI Label 字号属性名是 size（继承 egret.TextField）
  if (a.size !== undefined) {
    const size = num(a.size);
    if (size !== undefined) attrs.fontSize = size;
    else unsupported.push(`size="${a.size}" 非数值`);
  }
  if (a.fontFamily !== undefined) attrs.fontFamily = a.fontFamily;
  if (a.textColor !== undefined) attrs.textColor = a.textColor;
  if (a.bold !== undefined) attrs.bold = a.bold === "true" || a.bold === "1";
  if (a.italic !== undefined) attrs.italic = a.italic === "true" || a.italic === "1";
  if (a.textAlign !== undefined) attrs.textAlign = a.textAlign;
  if (a.verticalAlign !== undefined) attrs.verticalAlign = a.verticalAlign;
  if (a.stroke !== undefined) {
    const stroke = num(a.stroke);
    if (stroke !== undefined) attrs.stroke = stroke;
  }
  if (a.strokeColor !== undefined) attrs.strokeColor = a.strokeColor;
  if (a.lineSpacing !== undefined) attrs.lineSpacing = num(a.lineSpacing);
  if (a.maxWidth !== undefined) attrs.maxWidth = num(a.maxWidth);
}

/** 图片属性转换 + 资源解析挂载 */
function convertImageAttrs(
  a: Record<string, string>,
  attrs: Record<string, unknown>,
  unsupported: string[],
  opts: SceneOptions,
  file: string,
): void {
  if (a.fillMode !== undefined) attrs.fillMode = a.fillMode;
  if (a.scale9Grid !== undefined) attrs.scale9Grid = a.scale9Grid;
  const source = a.source;
  if (source === undefined) {
    // 运行时数据绑定（如 List itemRenderer 里 source 由代码注入）：不可静默隐形，明示上报
    unsupported.push("source 属性缺失（运行时数据绑定），按空占位渲染");
    attrs.assetResolved = null;
    return;
  }
  attrs.source = source;
  if (!opts.resolver) {
    unsupported.push(`source="${source}" 无法解析（未提供资源解析器）`);
    attrs.assetResolved = null;
    return;
  }
  const hit = opts.resolver.resolve(source, { exmlFile: file });
  attrs.assetResolved = hit;
  if (!hit) {
    unsupported.push(`source="${source}" 资源解析失败`);
    return;
  }
  // 自然尺寸兑底（Egret Image 未指定尺寸时按纹理尺寸显示）：直接图用 PNG 头尺寸，图集子图用帧尺寸
  let naturalW: number | undefined;
  let naturalH: number | undefined;
  if (hit.kind === "frame") {
    naturalW = hit.frame.sourceW || hit.frame.w;
    naturalH = hit.frame.sourceH || hit.frame.h;
  } else {
    const size = opts.resolver.imageSize(hit.file);
    naturalW = size?.width;
    naturalH = size?.height;
  }
  if (naturalW !== undefined) attrs.naturalWidth = naturalW;
  if (naturalH !== undefined) attrs.naturalHeight = naturalH;
}

/** 矩形属性转换（EUI Rect -> 语义属性） */
function convertRectAttrs(a: Record<string, string>, attrs: Record<string, unknown>, unsupported: string[]): void {
  if (a.fillColor !== undefined) attrs.fillColor = a.fillColor;
  if (a.fillAlpha !== undefined) {
    const v = num(a.fillAlpha);
    if (v !== undefined) attrs.fillAlpha = v;
    else unsupported.push(`fillAlpha="${a.fillAlpha}" 非数值`);
  }
  if (a.strokeColor !== undefined) attrs.strokeColor = a.strokeColor;
  if (a.strokeWeight !== undefined) attrs.strokeWeight = num(a.strokeWeight);
  if (a.strokeAlpha !== undefined) attrs.strokeAlpha = num(a.strokeAlpha);
  if (a.ellipseWidth !== undefined) attrs.ellipseWidth = num(a.ellipseWidth);
  if (a.ellipseHeight !== undefined) attrs.ellipseHeight = num(a.ellipseHeight);
}

/**
 * 最小静态布局：解析出 x/y/width/height。
 * 规则（按优先级）：
 *   1. 宽高：width/height 直接数值；"N%" 按父尺寸折算；left+right（或 top+bottom）同时存在时按边缘差计算
 *   2. x：left 优先；right 时 = 父宽 - 自宽 - right；horizontalCenter 时 = (父宽-自宽)/2 + hc；否则 attrs.x 或 0
 *   3. y 同理（top/bottom/verticalCenter）
 * 父尺寸未知时约束保留原值并记入 unsupported。
 */
function layoutBounds(
  a: Record<string, string>,
  attrs: Record<string, unknown>,
  ctx: BuildContext,
  parentSize: { width?: number; height?: number } | undefined,
  unsupported: string[],
): Bounds {
  const needParent = (what: string): void => {
    unsupported.push(`${what} 需要父容器尺寸（父尺寸未知，未计算）`);
  };

  // ---- 宽 ----
  let width: number | undefined = num(a.width);
  let widthPercent = false;
  if (width === undefined && typeof a.width === "string" && a.width.includes("%")) {
    const pct = parsePercent(a.width);
    if (pct !== null) {
      widthPercent = true;
      const pw = parentSize?.width;
      if (pw !== undefined) width = Math.round((pw * pct) / 100);
      else needParent(`width="${a.width}"`);
    }
  }
  // left+right -> 宽度推导
  const left = num(a.left);
  const right = num(a.right);
  if (width === undefined && !widthPercent && left !== undefined && right !== undefined) {
    const pw = parentSize?.width;
    if (pw !== undefined) {
      width = pw - left - right;
      attrs.left = left;
      attrs.right = right;
    } else needParent("left+right 边缘布局");
  }
  // ---- 高 ----
  let height: number | undefined = num(a.height);
  let heightPercent = false;
  if (height === undefined && typeof a.height === "string" && a.height.includes("%")) {
    const pct = parsePercent(a.height);
    if (pct !== null) {
      heightPercent = true;
      const ph = parentSize?.height;
      if (ph !== undefined) height = Math.round((ph * pct) / 100);
      else needParent(`height="${a.height}"`);
    }
  }
  const top = num(a.top);
  const bottom = num(a.bottom);
  if (height === undefined && !heightPercent && top !== undefined && bottom !== undefined) {
    const ph = parentSize?.height;
    if (ph !== undefined) {
      height = ph - top - bottom;
      attrs.top = top;
      attrs.bottom = bottom;
    } else needParent("top+bottom 边缘布局");
  }

  // ---- 自然尺寸兑底（image）：无显式尺寸/百分比/边缘推导时按纹理尺寸（Egret measuredSize 语义），
  // 必须在 x/y 计算前落定，hcenter/vcenter 才能用自然尺寸数值求解 ----
  if (width === undefined && attrs.naturalWidth !== undefined) {
    width = attrs.naturalWidth as number;
  }
  if (height === undefined && attrs.naturalHeight !== undefined) {
    height = attrs.naturalHeight as number;
  }
  delete attrs.naturalWidth;
  delete attrs.naturalHeight;

  // ---- x ----
  const hc = num(a.horizontalCenter);
  let x: number | undefined = num(a.x);
  if (left !== undefined && (width !== undefined || widthPercent)) {
    x = left;
    delete attrs.left;
  } else if (right !== undefined) {
    const pw = parentSize?.width;
    if (width !== undefined && pw !== undefined) {
      x = pw - width! - right;
      delete attrs.right;
    } else if (width === undefined) {
      // 自身宽度未知（典型：自适应文本）：CSS 右锚定，不依赖父尺寸数值
      attrs._right = right;
      delete attrs.right;
    } else needParent("right 定位");
  } else if (hc !== undefined) {
    const pw = parentSize?.width;
    if (pw !== undefined && width !== undefined) {
      x = (pw - width) / 2 + hc;
      delete attrs.horizontalCenter;
    } else if (width === undefined) {
      // 自身尺寸未知（典型：文本自适应宽度）：交给 CSS 居中（left:50% + translate），保留偏移量
      attrs._centerH = hc;
      delete attrs.horizontalCenter;
    } else needParent("horizontalCenter 定位");
  } else if (left !== undefined) {
    const pw = parentSize?.width;
    if (pw !== undefined) {
      x = left;
      delete attrs.left;
    } else needParent("left 定位");
  }

  // ---- y ----
  const vc = num(a.verticalCenter);
  let y: number | undefined = num(a.y);
  if (top !== undefined && (height !== undefined || heightPercent)) {
    y = top;
    delete attrs.top;
  } else if (bottom !== undefined && height !== undefined) {
    const ph = parentSize?.height;
    if (ph !== undefined) {
      y = ph - height! - bottom;
      delete attrs.bottom;
    } else needParent("bottom 定位");
  } else if (vc !== undefined) {
    const ph = parentSize?.height;
    if (ph !== undefined && height !== undefined) {
      y = (ph - height) / 2 + vc;
      delete attrs.verticalCenter;
    } else if (height === undefined) {
      attrs._centerV = vc;
      delete attrs.verticalCenter;
    } else needParent("verticalCenter 定位");
  } else if (top !== undefined) {
    const ph = parentSize?.height;
    if (ph !== undefined) {
      y = top;
      delete attrs.top;
    } else needParent("top 定位");
  }

  const bounds: Bounds = { x: x ?? 0, y: y ?? 0 };
  if (width !== undefined) bounds.width = width;
  if (height !== undefined) bounds.height = height;
  return bounds;
}
