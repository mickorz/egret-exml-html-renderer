# P2-B 执行报告：组件关系图谱

- 日期：2026-11-05
- 基线：`0dc2034`（P2-A 全工程 UI 资产索引）
- 范围：三类引用边 + SCC 环检测 + 悬空/孤儿/枢纽分析 + 单类邻域 + HTTP/MCP 暴露
- 结论：**通过**。真实工程图谱 1289 节点 / 1660 边 / 0 图级环，六套检查全绿，浏览器实测邻域与 P1 已知事实完全吻合。

## 设计决策

1. **图的边 = 三类真实引用**：tag（自定义组件标签）/ itemRenderer（List 皮肤）/ skinName（实例皮肤指派——P2-A 未收集，本阶段补入结构层 `skinNameRefs`）。
   EXML 格式**没有继承关系**（皮肤不是类的 extends），图谱不含继承边，不发明格式外语义。
2. **图级环 ≠ 场景级环**：图上 A→B→A（跨分支回边）不是场景展开环（场景环检测按分支祖先链处理，SCENE_CUSTOM_CYCLE 不变）；
   图级环用 Tarjan SCC 独立上报，只报不展开。
3. **边去重口径**：`(from类, to类, kind, file)` 四元组去重——同类同文件多次引用计 1 边（ExpandSkin 3 个 ArtNumberEUI→ArtNumberSkin 是 1 边）。
4. **节点 = 类，不是文件**：文件无根 class 时用 `<file:路径>` 占位保证边可归属（占位节点不参与悬空判定）。
5. **迭代版 Tarjan**：防深图递归栈溢出（1151 量级浅，但工程图深度未知，迭代版无代价）。
6. **数据源 = P2-A 索引**：图谱零额外解析，buildComponentGraph 是纯函数（索引+类名索引入，图出）。

## 交付清单

| 项 | 实现 | 文件 |
| --- | --- | --- |
| 结构层补边数据 | `skinNameRefs`（自定义组件实例 skinName 指派，去重）；findComponentUsages 扩展 skinName 类 | `src/scene/ui-asset-index.ts` |
| 图谱模块 | buildComponentGraph（节点/边/SCC 环/悬空引用/孤儿皮肤/枢纽排行/stats）+ classNeighborhood（单类邻域） | `src/scene/component-graph.ts`（新增） |
| workspace 入口 | getComponentGraph()（HTTP 与 MCP 共用） | `src/scene/workspace.ts` |
| HTTP API | `/api/component-graph`（全图）、`?class=X`（单类邻域） | `src/server/server.ts` |
| MCP 工具 | get_component_graph（第 7 个工具） | `src/mcp/tools.ts`、`src/mcp/main.ts` |
| 验收套件 | tests/component-graph-check.ts 入 check:all 级联；server-check 补路由断言（含 P2-A 路由回归）；mcp-check 工具列表 6→7 + 邻域 call 断言 | `tests/`、`package.json` |
| 文档同步 | README MCP 工具表（4→7）；docs/configuration.md 路由表补 4 条 | `README.md`、`docs/configuration.md` |

## 验收结果

fixture（19 节点 / 20 边 / 1 环 / 8 悬空 / 5 孤儿）：

- 三类边各就位：ExpandSkin→ArtNumberEUI(tag)、→ItemBoxSkin(itemRenderer)、→WidgetSkin(skinName)
- 重复引用去重：3 个 ArtNumberEUI 同文件同目标 = 1 边
- 环检测：CycleA↔CycleB 互引 SCC 命中
- 悬空引用：ArtNumberSkin（被指派但 fixture 无定义）命中
- 孤儿皮肤：LayoutSkin（定义了无人引用）命中
- 邻域：ExpandSkin uses 3 类、无人引用；ItemBoxSkin 被 ExpandSkin itemRenderer 引用

真实工程（1289 节点 / 1660 边 [tag 1191 / itemRenderer 79 / skinName 390] / 0 环 / 133 悬空 / 849 孤儿）：

- **浏览器实测邻域与 P1 已知事实完全吻合**：HometownRebateViewSkin 的 uses =
  ArtNumberEUI(tag) + ArtNumberSkin(skinName) + DragonBonesAni(tag) + EmptyBtn(tag) + HometownRebateItemRenderSkin(itemRenderer)
  ——与 P1-A/C 各阶段人工确认的五处引用一字不差，跨阶段交叉验证成立
- 枢纽排行：EmptyBtn:467 / AutoDragonAni:109 / ArtNumberEUI:99（与 P2-A 反查 467、99 文件口径一致）
- 环结构合法性断言（每个环 ≥2 成员且成员均为图节点）+ 悬空类确实不在类名索引（逐个断言）

## 数据质量发现（给工程的提示，非渲染器问题）

- **悬空引用 133 个**：被引用但类名索引无定义（多为代码注册组件/非 EXML 类名字符串），AI 侧引用这类类名时应注意无皮肤文件可展开
- **孤儿皮肤 849 个**：定义了但无 EXML 内引用（多为主界面级 View 皮肤，由代码挂载），符合 Egret 工程惯例
- **图级环 0**：工程组件引用无环（fixture 的 CycleA/B 是专门造的测试用例）

## 下一步

P2-C UI 搜索与可视化定位：在 P2-A 检索 + P2-B 邻域之上，做工作台交互层（搜索定位到 stableKey、列表点开预览、引用跳转）。
