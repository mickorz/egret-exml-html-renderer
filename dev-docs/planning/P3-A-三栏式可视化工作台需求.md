# Egret EXML Visual Editor V1：三栏式可视化工作台需求文档

- 项目：egret-exml-html-renderer
- 需求版本：V1.0
- 阶段：P3-A（可视化工作台基础改造）
- 当前代码基线：P2 全部完成后的 main
- 核心目标：将现有 EXML 文件浏览与预览页面，改造成三栏式可视化节点检查器。
- 本阶段原则：复用现有 Parser、Scene Builder、HTML Renderer、Scene JSON 和 EXML Writer，不重构底层解析及渲染架构。

---

# 一、项目背景

## 1.1 当前状态

项目已经完成 P0、P0.1、P1、P2 阶段，具备以下能力：

1. Egret EUI EXML 文件解析。
2. EXML → Scene Tree。
3. Scene Tree → HTML 渲染。
4. 自定义组件递归展开。
5. 工程级 UI 资产索引。
6. 组件引用关系图谱。
7. UI 结构 Diff。
8. 语义 HTML → EXML 回写。
9. EXML → HTML → EXML Round-trip 验证。
10. HTTP API 与 MCP 工具。

当前项目已经能够正确解析和渲染目标 EXML，但现有工作台的交互形式仍然偏向文件浏览器。

当前页面主要由以下区域构成：

- 左侧：EXML 文件搜索、文件列表。
- 中间：iframe 渲染预览。
- 中间辅助区域：组件关系信息。

这种布局能够完成资产搜索和预览，但不适合进行节点级别的 UI 检查与编辑。

## 1.2 本次改造目标

将当前页面改造成类似 Unity Inspector、Figma 图层面板的三栏式 UI 工作台。

核心布局：

```text
┌──────────────────────────────────────────────────────────────┐
│                     Egret UI Visual Editor                    │
├───────────────┬──────────────────────────┬───────────────────┤
│               │                          │                   │
│  工程组件树    │                          │                   │
│               │                          │                   │
│───────────────│       Canvas             │    Inspector      │
│               │                          │                   │
│  当前组件     │      HTML 渲染画布        │    节点属性栏      │
│  Scene Tree   │                          │                   │
│               │                          │                   │
│               │                          │                   │
└───────────────┴──────────────────────────┴───────────────────┘
```

三个区域必须共享统一的节点选择状态。

最终实现：

- 左侧选择 EXML 文件。
- 左侧浏览当前 EXML 的节点结构。
- 中间展示实际 HTML 渲染结果。
- 点击结构树节点，中间画布同步高亮。
- 点击画布节点，左侧结构树同步定位。
- 右侧 Inspector 显示当前节点的真实属性。

## 1.3 本阶段定位

本阶段是：

**可视化节点检查器，而不是完整的 UI 编辑器。**

V1 先解决节点结构展示、节点定位、属性读取和交互同步。

暂不实现属性修改、拖拽布局、节点增删等编辑功能。

---

# 二、总体设计原则

## 2.1 最大化复用现有能力

本次不重新开发以下模块：

| 模块 | 处理方式 |
|---|---|
| EXML Parser | 直接复用 |
| Scene Builder | 直接复用 |
| Component Resolver | 直接复用 |
| Scene JSON | 直接复用 |
| HTML Renderer | 直接复用 |
| EgretAssetResolver | 直接复用 |
| EXML Writer | 保留，不改造 |
| Scene Diff | 保留，不改造 |
| MCP Server | 保留，不改造 |

主要改造范围：

- 工作台页面。
- 前端交互状态管理。
- Canvas 节点选择通信。
- Inspector 属性展示。
- 必要的节点查询接口。

## 2.2 技术约束

1. 继续使用当前 Vanilla JavaScript / TypeScript 技术体系。
2. 不引入 React、Vue 等新的前端框架。
3. 不引入额外的前端构建系统。
4. 保留现有 iframe 渲染隔离结构。
5. 继续使用 stableKey 作为节点身份标识。
6. 不修改现有 EXML 渲染结果。
7. 不改变现有 EXML 回写逻辑。
8. 不改变现有 MCP 工具协议。
9. 不引入 OPFS、IndexedDB 等浏览器工程存储方案。
10. 所有 EXML 和资源仍然来自本地 Egret 工程。

---

# 三、页面布局设计

## 3.1 整体布局

页面分为三个主区域：

| 区域 | 建议宽度 | 职责 |
|---|---:|---|
| 左侧 Sidebar | 260～320px | 工程组件树、Scene Tree |
| 中间 Canvas | 自适应 | HTML 渲染及节点选择 |
| 右侧 Inspector | 280～340px | 节点属性展示 |

建议初始布局：

```text
左侧：290px
中间：剩余空间
右侧：320px
```

要求：

- 左右两侧宽度可拖动调整。
- 左侧整体高度占满视口。
- 右侧整体高度占满视口。
- 中间画布占据所有剩余空间。
- 左右侧内容超出时独立滚动。
- Canvas 区域不能被左右侧滚动影响。

## 3.2 顶部工具栏

增加统一顶部工具栏。

展示内容：

- 当前项目名称。
- 当前 EXML 文件路径。
- 当前舞台尺寸。
- 画布缩放比例。
- 适配画布按钮。
- 缩放放大按钮。
- 缩放缩小按钮。
- 100% 重置按钮。

第一阶段不实现复杂菜单、撤销重做和保存功能。

---

# 四、左侧区域：工程组件树 + Scene Tree

左侧分为上下两个独立面板。

建议比例：

```text
┌─────────────────────────┐
│                         │
│     工程组件树           │
│                         │
│                         │
├─────────────────────────┤
│                         │
│     当前组件 Scene Tree  │
│                         │
│                         │
└─────────────────────────┘
```

两个面板的高度允许拖动调整。

## 4.1 上半部分：工程组件树 Project Tree

### 4.1.1 功能目标

展示当前 Egret 工程中的 EXML 文件及其目录结构。

数据来源：

- 现有 `/api/exml`。
- 现有 `/api/ui-assets`。

不重新实现工程扫描功能。

### 4.1.2 展示结构

示例：

```text
resource/
├── common/
│   ├── ButtonSkin.exml
│   └── DialogSkin.exml
├── home/
│   ├── HomeView.exml
│   └── HomeItem.exml
└── role/
    ├── RoleView.exml
    └── RoleItem.exml
```

如果 API 返回的是扁平文件列表，前端根据文件路径构建目录树。

### 4.1.3 节点展示信息

文件节点至少展示：

- EXML 文件名。
- 相对工程路径。
- 根组件 class（如果存在）。
- 文件类型图标。

目录节点展示：

- 目录名称。
- 子节点数量（可选）。

### 4.1.4 交互要求

1. 点击目录：展开或折叠。
2. 点击 EXML：打开对应组件。
3. 当前文件：显示选中状态。
4. 支持文件名搜索。
5. 支持目录折叠。
6. 支持快速定位当前打开文件。
7. 文件切换后自动刷新下方 Scene Tree 和中间 Canvas。

### 4.1.5 搜索

搜索框支持：

- 文件名模糊搜索。
- 路径搜索。
- 根 class 搜索。

第一阶段不需要在树中同时实现所有复杂筛选模式。

可以直接复用现有 `/api/ui-assets` 查询能力。

## 4.2 下半部分：Scene Tree

### 4.2.1 功能目标

展示当前打开 EXML 对应的完整场景节点树。

数据来源：

```http
GET /api/scene?file=xxx.exml
```

直接复用现有 Scene JSON。

### 4.2.2 树结构

示例：

```text
HomeView
└── Group
    ├── Image (background)
    ├── Group (header)
    │   ├── Image (logo)
    │   └── Label (title)
    ├── Group (content)
    │   ├── Image (avatar)
    │   └── Label (username)
    └── Button (start)
        └── Label (text)
```

### 4.2.3 节点展示规则

节点显示：

- 节点类型。
- 节点 name。
- 节点 id（可选）。
- 是否为展开组件节点。
- 是否为静态模拟节点。

展示格式：

```text
[类型图标] Label (title)
[类型图标] Image (background)
[类型图标] Button (start)
```

建议图标：

| 类型 | 图标 |
|---|---|
| Group | 容器图标 |
| Image | 图片图标 |
| Label | 文本图标 |
| Button | 按钮图标 |
| Scroller | 滚动容器图标 |
| BitmapNumber | 数字组件图标 |
| Animation | 动画图标 |
| 其他 | 通用节点图标 |

### 4.2.4 节点展开和折叠

要求：

1. 支持任意层级展开。
2. 支持任意层级折叠。
3. 有子节点的节点显示展开图标。
4. 无子节点的节点不显示展开图标。
5. 默认展开根节点第一层。
6. 重新选择 EXML 后重新生成树结构。

### 4.2.5 节点选择

点击任意节点：

1. 更新统一 Selection Store。
2. 更新 Scene Tree 选中样式。
3. 通知 Canvas 定位并高亮对应节点。
4. 更新 Inspector。
5. 必要时自动展开该节点的所有父级。

选中状态不能仅通过 DOM 行索引维护。

必须使用 stableKey。

### 4.2.6 特殊节点处理

当前 Scene Tree 包含不同来源的节点：

#### A. source-node

真正来源于当前 EXML 的节点。

正常显示，可以选中，可以查询属性。

#### B. expanded-node

自定义组件展开后的内部节点。

正常展示，但必须标记来源文件和组件实例路径。

选中后 Inspector 应明确显示：

- 当前实例路径。
- 原始来源 EXML。
- 原始 class。
- stableKey。

#### C. synthetic-node

渲染器生成的辅助节点。

不作为普通 EXML 节点展示。

如果必须在结构树中展示，应使用特殊标记，并且不能伪装成真实 EXML 节点。

静态模拟节点也必须有明确标识。

### 4.2.7 结构树定位

当 Canvas 选中节点时：

1. 根据 stableKey 查找对应树节点。
2. 展开所有父级。
3. 滚动到对应节点。
4. 更新选中样式。

如果找不到对应节点：

- 不允许错误选中其他节点。
- 保留当前树状态。
- 显示节点无法映射的提示。

---

# 五、中间区域：Canvas 画布

## 5.1 功能目标

继续使用当前 HTML Renderer 的输出结果。

Canvas 负责：

- 渲染 EXML。
- 展示 UI。
- 节点选中。
- 节点高亮。
- 节点定位。
- 缩放。
- 平移。

不在本阶段重新实现 Egret 渲染引擎。

## 5.2 Canvas 布局

建议结构：

```text
┌──────────────────────────────────────────────┐
│ Toolbar                                      │
│ Zoom -  100%  +  Fit                         │
├──────────────────────────────────────────────┤
│                                              │
│                                              │
│              Canvas Workspace                │
│                                              │
│                ┌──────────┐                  │
│                │          │                  │
│                │  Egret   │                  │
│                │   UI     │                  │
│                │          │                  │
│                └──────────┘                  │
│                                              │
└──────────────────────────────────────────────┘
```

Canvas 应有独立背景，建议使用深灰色或棋盘格背景。

实际 EXML 舞台按照原始 width、height 渲染。

## 5.3 节点点击选择

当前渲染器已经给节点添加了以下信息：

- `data-egret-id`
- `data-egret-name`
- `data-egret-type`
- `data-egret-path`
- `data-egret-key`
- `data-egret-src`

直接复用其中的 `data-egret-key`。

点击 `.egret-node`：

1. 获取 stableKey。
2. 高亮当前 DOM。
3. 向父页面发送节点选择事件。
4. 父页面更新 Selection Store。
5. 左侧 Scene Tree 同步定位。
6. 右侧 Inspector 更新。

### 5.3.1 选中样式

选中节点显示：

- 蓝色边框。
- 清晰的选中状态。
- 不改变原始节点尺寸。
- 不影响原始布局。
- 不改变正常渲染结果。

注意：

不能通过修改原始节点 width、height、position 等属性实现高亮。

建议使用 outline 或独立覆盖层。

### 5.3.2 鼠标悬停

鼠标移动到节点上时：

- 显示临时边框。
- 显示节点名称。
- 显示节点类型。
- 显示宽高信息。

鼠标离开后恢复。

悬停状态与选中状态必须区分。

### 5.3.3 点击空白区域

点击非节点区域：

- 清除当前选中状态。
- 通知父页面取消选择。
- Inspector 显示空状态。
- Scene Tree 取消选中。

点击工具栏或其他 UI 控件不能误触发节点取消选择。

## 5.4 画布缩放和平移

第一阶段实现基础能力：

- 放大。
- 缩小。
- 100% 重置。
- 适配画布。
- 显示当前缩放比例。

缩放应以舞台中心或鼠标位置为锚点，避免舞台突然跳动。

平移可以使用空格 + 鼠标拖动，或鼠标中键拖动。

Canvas 内部滚动和整个页面滚动必须隔离。

## 5.5 iframe 通信

继续保留 iframe 架构。

当前 `selection/component-selector.ts` 只负责 iframe 内部选择及 console 输出，需要增加父子窗口通信。

推荐使用：

```typescript
type CanvasMessage =
  | {
      type: "NODE_SELECTED";
      stableKey: string;
    }
  | {
      type: "NODE_DESELECTED";
    }
  | {
      type: "CANVAS_READY";
    }
  | {
      type: "NODE_NOT_FOUND";
      stableKey: string;
    };
```

父页面发往 iframe：

```typescript
type EditorMessage =
  | {
      type: "SELECT_NODE";
      stableKey: string;
    }
  | {
      type: "DESELECT_NODE";
    };
```

要求：

1. 使用 `window.postMessage`。
2. 校验消息来源和 iframe.contentWindow。
3. 校验消息 origin。
4. 对消息类型和字段做运行时验证。
5. 不传递完整 Scene JSON。
6. 节点身份统一使用 stableKey。
7. iframe 加载完成后发送 CANVAS_READY。
8. iframe 尚未就绪时，父页面可以记录待执行定位请求。
9. 文件切换后清理旧 iframe 的选中状态。

---

# 六、右侧区域：Inspector 属性栏

## 6.1 功能目标

展示当前选中渲染节点对应的真实 EXML 属性。

V1 只读，不允许直接修改属性。

属性数据优先来自：

- Scene JSON。
- Scene Tree 中对应节点的 attrs。
- bounds。
- asset。
- component。
- layout。
- srcFile。
- simulated。
- unsupported。

不通过解析 HTML DOM 样式来反推 EXML 属性。

这是为了保证 Inspector 展示的是 EXML 真实语义，而不是浏览器计算后的 CSS。

## 6.2 未选中状态

未选中节点时展示：

```text
请选择一个节点

在左侧 Scene Tree 或中间 Canvas
点击一个节点查看它的属性。
```

## 6.3 属性分组

Inspector 采用可折叠分组。

### A. 基本信息 Basic

所有节点通用：

| 属性 | 数据来源 |
|---|---|
| name | node.name |
| type | node.type |
| id | node.id |
| stableKey | node.key |
| instancePath | node.path |
| sourceFile | node.srcFile |
| component | node.component |

### B. Transform

展示布局边界：

| 属性 | 数据来源 |
|---|---|
| X | bounds.x / attrs.x |
| Y | bounds.y / attrs.y |
| Width | bounds.width / attrs.width |
| Height | bounds.height / attrs.height |

要求：

- 区分原始 EXML 属性和计算后的 bounds。
- 不允许将计算值伪装成原始 EXML 属性。
- 对不存在的值显示 `—`。

### C. Layout

按实际节点显示：

- left
- right
- top
- bottom
- horizontalCenter
- verticalCenter
- percentWidth
- percentHeight
- layout 类型。
- 其他布局参数。

只展示节点真实存在的属性。

### D. Image

Image 节点展示：

- source。
- 图片资源路径。
- 图集名称。
- 图集子图名称。
- scale9Grid。
- fillMode。
- 资源解析状态。

如果图片资源无法解析，应显示诊断，而不是静默隐藏。

### E. Text

Label 节点展示：

- text。
- fontSize。
- textColor。
- bold。
- italic。
- textAlign。
- verticalAlign。
- strokeColor。
- stroke。
- lineSpacing。

只展示当前节点实际存在的字段。

### F. Component

自定义组件展示：

- 原始 class。
- 来源 EXML 文件。
- 当前实例路径。
- 是否展开。
- 是否静态模拟生成。

### G. Advanced

展示完整原始 attrs。

建议采用 JSON 树或格式化 JSON 方式。

用于开发者检查特殊 EUI 属性。

### H. Diagnostics

展示：

- unsupported。
- 资源加载异常。
- 组件解析诊断。
- 静态模拟标记。

## 6.4 属性展示规则

1. 空值显示 `—`。
2. 布尔值显示 true / false。
3. 颜色值显示颜色预览块和原始值。
4. 数值保持原始精度。
5. 长文本支持换行。
6. 资源路径支持复制。
7. stableKey 支持复制。
8. 复杂对象支持折叠。
9. 属性分组支持展开和折叠。

## 6.5 不同节点类型显示不同 Inspector

| 节点类型 | 展示内容 |
|---|---|
| Group | Basic、Transform、Layout、Advanced |
| Image | Basic、Transform、Image、Advanced |
| Label | Basic、Transform、Text、Advanced |
| Button | Basic、Transform、Component、Advanced |
| Scroller | Basic、Transform、Layout、Component、Advanced |
| BitmapNumber | Basic、Transform、Component、Advanced |
| Animation | Basic、Transform、Component、Diagnostics |

不能因为某节点没有 Image 或 Text 属性，就显示一大堆空分组。

---

# 七、统一节点选择状态

这是本次改造最重要的技术要求。

## 7.1 Selection Store

所有区域共享统一的选择状态。

建议定义：

```typescript
interface EditorSelection {
  file: string;
  stableKey: string | null;
  source:
    | "component-tree"
    | "scene-tree"
    | "canvas"
    | null;
}
```

状态示例：

```typescript
const selection = {
  file: "home/HomeView.exml",
  stableKey: "HomeView/Group/header/Label_title",
  source: "canvas"
};
```

## 7.2 统一状态流

```text
             Selection Store
                    │
             stableKey / file
                    │
          ┌─────────┼─────────┐
          │         │         │
          ▼         ▼         ▼
       Scene Tree  Canvas   Inspector
          │         │         │
          └──── 双向同步 ─────┘
```

## 7.3 三种选择入口

### 入口一：工程组件树

用户点击另一个 EXML：

```text
Project Tree
    ↓
切换当前 file
    ↓
GET /api/scene
    ↓
GET /view
    ↓
重建 Scene Tree
    ↓
清空旧 Selection
    ↓
加载新 Canvas
```

### 入口二：Scene Tree

用户点击节点：

```text
Scene Tree
    ↓
获取 stableKey
    ↓
Selection Store 更新
    ↓
Canvas 高亮节点
    ↓
Inspector 显示节点属性
```

### 入口三：Canvas

用户点击渲染节点：

```text
Canvas
    ↓
获取 data-egret-key
    ↓
postMessage
    ↓
父页面 Selection Store 更新
    ↓
Scene Tree 自动定位
    ↓
Inspector 显示节点属性
```

## 7.4 防止循环事件

必须避免：

```text
Tree 选中
  ↓
Canvas 高亮
  ↓
Canvas 又发送 NODE_SELECTED
  ↓
重复更新 Tree
  ↓
无限循环
```

建议通过 source 字段区分事件来源。

程序主动调用 Canvas 高亮时，不应再次触发用户点击选择事件。

---

# 八、数据模型与接口设计

## 8.1 现有接口优先复用

| 接口 | 用途 | 处理方式 |
|---|---|---|
| GET /api/project | 工程信息 | 复用 |
| GET /api/exml | 文件列表 | 复用 |
| GET /api/scene | Scene Tree | 复用 |
| GET /view | Canvas 渲染 | 复用 |
| GET /api/ui-assets | 资产搜索 | 复用 |
| GET /api/component-graph | 组件关系 | 暂不需要 |
| POST /api/exml-write | EXML 回写 | 暂不调用 |

## 8.2 是否需要新增节点详情 API

V1 优先直接使用 `/api/scene` 返回的完整 Scene JSON。

通过 stableKey 在前端建立节点索引：

```typescript
Map<string, SceneNode>
```

这样：

- Tree 渲染可以快速读取节点。
- Inspector 不需要重复请求服务器。
- Canvas 选中后可以直接查询节点。
- 不增加不必要的 HTTP 请求。

如果真实工程出现 Scene JSON 过大问题，再考虑增加节点详情 API。

## 8.3 前端数据结构

建议：

```typescript
interface EditorDocument {
  file: string;
  className: string;
  stage: {
    width: number;
    height: number;
  };
  scene: SceneJson;
}

interface EditorState {
  currentFile: string | null;
  document: EditorDocument | null;

  selectedStableKey: string | null;

  expandedProjectPaths: Set<string>;
  expandedSceneKeys: Set<string>;

  inspectorExpandedGroups: Set<string>;

  zoom: number;
}
```

注意：

Scene JSON 是唯一权威节点数据源。

不要为 Scene Tree 和 Inspector 分别维护两套独立节点数据。

---

# 九、前端模块结构建议

当前工作台页面主要集中在：

```text
src/server/index-html.ts
src/selection/component-selector.ts
```

建议在不引入构建系统的前提下，逐步拆分前端模块。

推荐结构：

```text
src/
├── server/
│   ├── index-html.ts
│   └── server.ts
│
├── selection/
│   ├── component-selector.ts
│   └── selection-types.ts
│
└── editor/
    ├── editor-shell.ts
    ├── editor-state.ts
    ├── editor-events.ts
    │
    ├── project-tree/
    │   ├── project-tree.ts
    │   └── project-tree-view.ts
    │
    ├── scene-tree/
    │   ├── scene-tree.ts
    │   └── scene-tree-view.ts
    │
    ├── canvas/
    │   ├── canvas-controller.ts
    │   ├── canvas-messages.ts
    │   └── canvas-viewport.ts
    │
    └── inspector/
        ├── inspector.ts
        ├── inspector-view.ts
        └── inspector-formatters.ts
```

这是逻辑职责拆分，不要求一次性创建所有文件。

如果当前项目使用字符串模板生成页面，应继续保持兼容，不要为了模块拆分引入复杂的构建和打包链路。

---

# 十、异常和边界处理

必须考虑以下场景：

| 场景 | 预期行为 |
|---|---|
| EXML 加载失败 | Canvas 显示错误提示 |
| Scene JSON 加载失败 | Scene Tree 显示错误状态 |
| stableKey 不存在 | 提示节点无法定位 |
| iframe 加载失败 | 显示重试入口 |
| 节点没有 attrs | Inspector 显示空状态 |
| 节点没有 bounds | Transform 显示 — |
| 图片资源缺失 | Inspector 显示资源异常 |
| 自定义组件展开失败 | 保留错误诊断 |
| 静态模拟节点 | 明确标记 synthetic / simulated |
| 文件切换 | 清除旧节点选择 |
| 连续快速切换文件 | 防止旧请求覆盖新文件状态 |
| iframe 尚未加载 | 暂存待定位 stableKey |
| Canvas 和 Tree 不一致 | 以当前 Scene JSON 为准 |

---

# 十一、性能要求

以当前约 1151 个 EXML 的真实工程为基础。

要求：

1. 工程组件树不需要一次性渲染全部 DOM 节点。
2. Scene Tree 支持按需展开。
3. 折叠节点的子树不应重复创建大量 DOM。
4. 选择节点不重新请求整个 Scene JSON。
5. 选择节点不重新渲染整个 Canvas。
6. Inspector 更新只刷新属性区域。
7. 文件切换时取消或忽略过期请求。
8. stableKey 索引在当前文档加载后建立一次。

第一阶段不强制引入虚拟滚动。

如果真实 EXML 存在数千节点且滚动明显卡顿，再增加虚拟树优化。

---

# 十二、开发阶段拆分

建议分成四个小阶段，逐步验收。

## P0：三栏工作台基础布局

目标：先把整体页面改造出来。

任务：

1. 重构 index-html.ts。
2. 建立左侧、Canvas、Inspector 三栏。
3. 左侧拆分上下两个面板。
4. 增加左右宽度调整。
5. 增加上下区域高度调整。
6. 实现工程组件树。
7. 实现基础 Scene Tree。
8. 保留原有文件搜索能力。

验收：

- 页面呈现三栏布局。
- 工程文件可以浏览。
- 点击文件可以加载。
- Scene Tree 正常显示。
- Canvas 正常渲染。
- Inspector 显示空状态。

## P1：Tree 与 Canvas 双向选择

目标：实现真正的节点级交互。

任务：

1. 建立 Selection Store。
2. 改造 component-selector.ts。
3. 增加 postMessage 通信。
4. Tree 点击同步 Canvas。
5. Canvas 点击同步 Tree。
6. 自动展开父级节点。
7. 节点高亮。
8. 取消选择。
9. 处理 iframe 生命周期。

验收：

- 任意节点可以从 Tree 选中。
- 任意真实渲染节点可以从 Canvas 选中。
- 双向选择始终一致。
- stableKey 不匹配时不会错误选中其他节点。
- 文件切换不会残留旧选择状态。

## P2：Inspector 属性展示

目标：让用户能够查看当前节点的真实 EXML 属性。

任务：

1. 建立 stableKey → SceneNode Map。
2. 建立 Inspector 基础信息分组。
3. 实现 Transform。
4. 实现 Layout。
5. 实现 Image。
6. 实现 Text。
7. 实现 Component。
8. 实现 Advanced。
9. 实现 Diagnostics。
10. 根据节点类型动态生成属性面板。

验收：

- 点击 Tree 节点，Inspector 显示对应属性。
- 点击 Canvas 节点，Inspector 同步更新。
- 所有属性来自 Scene JSON。
- 不将 CSS 计算值伪装成 EXML 原始属性。
- 不存在的属性不显示虚假默认值。

## P3：Canvas 基础体验优化

目标：完善画布操作体验。

任务：

1. 缩放。
2. 平移。
3. Fit。
4. 100% 重置。
5. 悬停提示。
6. 选中节点边界。
7. 画布尺寸显示。
8. 选中状态视觉优化。

验收：

- 不同尺寸 EXML 均能适配。
- 缩放和移动不改变原始 HTML 布局。
- Tree 与 Canvas 选择同步不受缩放影响。

---

# 十三、完整验收标准

最终必须满足以下要求：

| 编号 | 验收项目 | 通过标准 |
|---|---|---|
| AC-01 | 三栏布局 | 左、中、右三区域正常显示 |
| AC-02 | 左侧上下分区 | 工程组件树与 Scene Tree 独立展示 |
| AC-03 | 工程组件树 | 能浏览和切换 EXML |
| AC-04 | Scene Tree | 完整展示当前 EXML 的真实节点结构 |
| AC-05 | Tree 展开折叠 | 任意层级可展开、折叠 |
| AC-06 | Tree → Canvas | 点击 Tree 节点，Canvas 正确高亮 |
| AC-07 | Canvas → Tree | 点击 Canvas 节点，Tree 正确定位 |
| AC-08 | Inspector | 显示当前选中节点的真实属性 |
| AC-09 | 属性分类 | 根据节点类型显示对应属性分组 |
| AC-10 | stableKey | 所有真实节点通过 stableKey 关联 |
| AC-11 | 组件溯源 | 展开组件能够显示源文件和实例路径 |
| AC-12 | 合成节点 | synthetic 节点不会伪装成 EXML 节点 |
| AC-13 | iframe 通信 | 双向通信稳定且来源经过校验 |
| AC-14 | 文件切换 | 切换文件后状态正确重建 |
| AC-15 | 画布缩放 | 放大、缩小、Fit、100% 正常 |
| AC-16 | 原渲染回归 | 改造前后的 HTML 视觉结果不变 |
| AC-17 | 回写回归 | P2-E Round-trip 全部通过 |
| AC-18 | 自动化检查 | check:all 全绿，tsc 无错误 |

---

# 十四、本阶段明确不做的事情

为了控制开发范围，以下内容全部留到后续阶段：

1. Inspector 属性直接修改。
2. Canvas 拖拽修改节点坐标。
3. Canvas 拖拽改变宽高。
4. 新增 EXML 节点。
5. 删除 EXML 节点。
6. 调整节点层级。
7. 多选节点。
8. 框选节点。
9. 撤销与重做。
10. EXML 自动保存。
11. 多文件同时编辑。
12. 运行时 Data Binding。
13. Egret 动画真实播放。
14. 完整 EUI Layout 运行时模拟。
15. AI 自动生成和修改 UI。

特别强调：

**本阶段不允许为了实现属性栏而直接引入属性编辑能力。**

先把节点映射、属性读取和双向选择做稳定。

---

# 十五、测试计划

## 15.1 测试工程

使用现有真实 Egret 工程和 HometownRebateView 作为主要测试对象。

建议同时测试：

- HometownRebateView：复杂自定义组件。
- GameDisbandVoteSkin：内联 Button Skin。
- 包含 List 的页面。
- 包含 Scroller 的页面。
- 包含 ArtNumberEUI 的页面。
- 简单 Group / Image / Label 页面。

## 15.2 关键测试用例

### TC-01：工程组件树

- 打开工作台。
- 展开目录。
- 搜索 EXML。
- 点击 HomeView。
- 检查 Canvas 是否加载。
- 检查 Scene Tree 是否更新。

### TC-02：Scene Tree 选择

- 展开 Group。
- 点击 Label。
- 检查 Canvas 高亮。
- 检查 Inspector 属性。

### TC-03：Canvas 选择

- 点击画布中的 Image。
- 检查 Scene Tree 自动展开。
- 检查对应节点高亮。
- 检查 Inspector 显示 Image 属性。

### TC-04：自定义组件

- 打开包含自定义组件的页面。
- 展开组件内部结构。
- 选中内部节点。
- 检查来源 EXML。
- 检查 instancePath。
- 检查 stableKey。

### TC-05：静态模拟节点

- 打开包含 List 的页面。
- 检查静态模拟 item。
- 确认模拟节点有明确标识。
- 确认不会错误映射到其他源节点。

### TC-06：文件切换

- 打开 HomeView。
- 选中一个节点。
- 切换到 RoleView。
- 确认旧选中状态清除。
- 确认新 Scene Tree 和 Canvas 正常。

### TC-07：回归测试

执行：

```bash
npm run check:all
npx tsc --noEmit
```

检查：

- Parser 不受影响。
- Renderer 不受影响。
- Server 不受影响。
- MCP 不受影响。
- Assets 不受影响。
- Graph 不受影响。
- Diff 不受影响。
- Writer Round-trip 不受影响。

---

# 十六、交付物

本阶段需要交付：

1. 三栏式工作台页面。
2. 工程组件树。
3. Scene Tree。
4. Canvas 双向选择。
5. 统一 Selection Store。
6. Inspector 属性展示。
7. Canvas 缩放和平移。
8. 自动化测试。
9. 开发执行报告。
10. 页面截图和真实工程验收记录。

开发完成后更新：

- `dev-docs/progress/执行进度.md`
- `dev-docs/progress-result/` 下的阶段执行报告。

---

# 十七、最终产品形态

V1 完成后，工作台应该具备以下交互体验：

```text
用户打开 Egret UI 工作台
          │
          ▼
    左侧工程组件树
          │
     选择 HomeView
          │
          ▼
     加载 Scene Tree
          │
          ▼
     中间 Canvas 渲染
          │
     点击任意 UI 节点
          │
          ▼
    左侧 Scene Tree 定位
          │
          ▼
    右侧 Inspector 展示属性
          │
          ▼
       完成节点检查
```

下一阶段再扩展：

```text
Inspector 修改属性
          ↓
Canvas 实时预览
          ↓
Scene JSON 更新
          ↓
EXML Writer
          ↓
Scene Diff 验证
          ↓
人工确认
          ↓
写回本地 Egret 工程
```

**V1 的最终目标不是让用户能够修改 UI，而是让用户能够像使用 Unity Inspector 一样，准确理解、定位和检查 Egret EXML 中的每一个 UI 节点。**
