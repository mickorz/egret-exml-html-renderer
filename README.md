# egret-exml-html-renderer

将 Egret EUI 的 EXML 界面文件解析并渲染为可在浏览器直接预览的静态 HTML。

```
Egret 游戏工程（resource/）
      │  EXML + 图片资源 + *.res.json
      ▼
  EXML Parser（fast-xml-parser，保留节点顺序 / Namespace / 原始属性）
      ▼
  Scene Builder（EUI 语义归类 + 最小静态布局 + 资源解析）
      ▼
  Scene Tree ──► Scene JSON（供 AI / MCP 查询）
      │
      ▼
  HTML Renderer（一类型一文件）──► 浏览器预览
```

## 快速开始

```bash
npm install

# 启动只读工作区服务（需指定 Egret 工程根，其下应有 resource/）
EGRET_PROJECT_ROOT=E:/path/to/YourEgretProject npm run serve
# 浏览器打开 http://localhost:7789/

# 单文件渲染 POC
npx tsx src/poc/render.ts <EXML路径> --root <Egret工程根> --out demo

# 自动化检查
npm run check          # parser + render
npm run check:server   # HTTP 服务
npm run check:mcp      # MCP stdio 协议
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

## 目录结构

```
src/
  parser/exml/    EXML 解析（XML -> ExmlDocument -> 归一化）
  scene/          Scene Builder + Scene JSON + Workspace
  assets/         EgretAssetResolver（*.res.json + 图集帧）
  renderer/       HTML 渲染器（nodes/ 一类型一文件）
  server/         只读 HTTP 工作区服务
  selection/      节点点击选择脚本
  mcp/            MCP stdio server
  poc/            单文件渲染入口
tests/            fixtures/egret + parser/render/server/mcp 检查脚本
dev-docs/         开发过程文档（规范见 CLAUDE.md）
docs/             读者向文档
```

更多信息见 `docs/`。
