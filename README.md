# egret-exml-html-renderer

将 Egret EUI 的 EXML 界面文件解析为场景树并渲染为浏览器可预览的静态 HTML，
同时提供工程级 UI 资产索引、组件关系图谱、结构 Diff，以及**语义 HTML → EXML 回写**，
形成 EXML → HTML → EXML 双向闭环（供 AI / MCP / HTTP 使用）。

```
Egret 游戏工程（resource/）
      │  EXML + 图片资源 + *.res.json
      ▼
  EXML Parser（fast-xml-parser，保留节点顺序 / Namespace / 原始属性）
      ▼
  Scene Builder（EUI 语义归类 + 最小静态布局 + 资源解析 + 自定义组件展开）
      ▼
  Scene Tree ──► Scene JSON（供 AI / MCP 查询）
      │
      ├──► UI 资产索引（P2-A：检索 / 组件反查）
      ├──► 组件关系图谱（P2-B：引用边 / 环检测 / 枢纽）
      ├──► 结构 Diff（P2-D：新增 / 删除 / 跨父移动 / 属性变化）
      │
      ▼
  HTML Renderer（一类型一文件）──► 浏览器预览 / 工作台检索定位（P2-C）
      │
      ▼
  语义 HTML（data-egret-* 标注）──► EXML Writer（P2-E）──► EXML 文本
      └──── round-trip：重新解析 → Scene Diff 验证零差异
```

## 快速开始

```bash
npm install

# 启动只读工作区服务（需指定 Egret 工程根，其下应有 resource/）
EGRET_PROJECT_ROOT=E:/path/to/YourEgretProject npm run serve
# 浏览器打开 http://localhost:7789/

# 单文件渲染 POC
npx tsx src/poc/render.ts <EXML路径> --root <Egret工程根> --out demo

# 自动化检查（全部九套：parser / render / server / mcp / assets / graph / diff / writer + tsc）
npm run check          # 等价于 check:all，含全部检查与类型检查
npm run check:writer   # 单独跑 P2-E 回写 round-trip 验收
```

## MCP 接入

项目自带 `.pi/mcp.json`（stdio JSON-RPC），九个工具（八个只读 + 一个回写文本）：

| 工具 | 作用 |
| --- | --- |
| `list_exml_files` | 列出工程资源目录下全部 EXML |
| `get_exml_scene` | 获取 Scene JSON（节点树 / bounds / stableKey / 未支持清单） |
| `preview_exml` | 渲染为独立 HTML（可选 Chrome headless 截图） |
| `get_node_detail` | 按 stableKey 查询节点详情 |
| `search_ui_assets` | 检索全工程 UI 资产索引（class / 文件名 / 组件类型） |
| `find_component_usages` | 反查组件类被哪些 EXML 引用 |
| `get_component_graph` | 组件关系图谱（三类引用边 / SCC 环检测 / 枢纽排行；传 class 返回单类邻域） |
| `diff_exml_scenes` | 两份 EXML 结构 diff（新增/删除/跨父移动/属性级变化） |
| `write_exml_from_html` | 语义 HTML 回写为 EXML 文本（不写文件系统） |

环境变量：`EGRET_PROJECT_ROOT`（Egret 工程根目录）。

## P0 支持范围

支持：`e:Group` / `e:Image` / `e:Label` / `e:Button`（内联 skinName）/ `e:Rect`；
`x/y/width/height` 绝对定位；`percentWidth/Height`、`left/right/top/bottom`、
`horizontalCenter/verticalCenter` 最小静态计算；图片（直接文件 / 图集子图 / scale9Grid 九宫格 / fillMode）；
文本（字号/颜色/描边/对齐/粗斜体）。

不支持（保留节点、明确上报、不静默丢弃）：state 状态切换、includeIn/excludeIn、
动画 tween、DataGroup/List/Scroller 运行时行为、自定义组件展开、Data Binding、完整 EUI Layout 系统。

## P2-E：EXML 回写（语义 HTML → EXML）

**输入必须是携带 `data-egret-*` 语义标注的 HTML**（渲染器 bare 输出或同约定），不是任意网页 DOM。

接口（均不落盘，返回 EXML 文本）：

- HTTP：`POST /api/exml-write`，body 为 JSON `{ "html": "..." }`（限 2MB）
- MCP：`write_exml_from_html` 工具

语义约定：根元素 `class="egret-stage"` 携带 `data-egret-tag/attrs`；语义节点携带
`data-egret-tag`（原始 EXML 标签）+ `data-egret-attrs`（原始属性全量 JSON）；
布局声明 `data-egret-layout`；内联按钮皮肤包装层 `class="egret-skin-wrap"`。
XHTML 形态（元素显式闭合、img 自闭合、属性双引号）。

回写边界（诚实声明）：

- 文档归属按 stableKey 前缀判定：展开皮肤内容 / 静态 item / 合成元素剪枝不回写（重建时自动再生）
- 位图数字运行时数值、List 运行时数据绑定不回写（保留组件标记与 prefix，重建按示例值重新模拟）
- round-trip 验收：fixture 全量 + 真实工程 HometownRebateView 均结构零增删移、属性零差异

## 目录结构

```
src/
  parser/exml/    EXML 解析（XML -> ExmlDocument -> 归一化）
  scene/          Scene Builder + Scene JSON + Workspace + 索引/图谱/Diff
  assets/         EgretAssetResolver（*.res.json + 图集帧）
  renderer/       HTML 渲染器（nodes/ 一类型一文件）
  writer/         EXML 回写（语义 HTML -> EXML 文本）
  server/         只读 HTTP 工作区服务
  selection/      节点点击选择脚本
  mcp/            MCP stdio server
  poc/            单文件渲染入口
tests/            fixtures/egret + 八套检查脚本（check:all 级联 + tsc）
dev-docs/         开发过程文档（规范见 CLAUDE.md）
docs/             读者向文档
```

更多信息见 `docs/`。
