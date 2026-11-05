# P2-C 执行报告：UI 搜索与可视化定位

- 日期：2026-11-05
- 基线：`e80c8d6`（P2-B 组件关系图谱）
- 范围：工作台页面升级——资产搜索（三模式）+ 点击预览 + 邻域跳转 + 组件定位
- 结论：**通过**。真实工程浏览器全操作链验证（搜索→预览→邻域→跳转→组件搜索），六套检查全绿。

## 交付清单

| 项 | 实现 | 文件 |
| --- | --- | --- |
| 工作台页面升级 | 侧栏搜索（文件模糊 / 类名精确 / 组件类型三模式，Enter 或按钮触发）+ 结果列表（文件 + 类名 + 尺寸 + 节点数徽标）+ 命中统计（耗时/失败数明示） | `src/server/index-html.ts`（重写） |
| 点击预览 | 搜索结果与全量列表点击 → iframe `/view` 渲染（复用既有选择器/focus 能力，零新增渲染代码） | 同上 |
| 关系面板 | 预览文件 → `/api/scene` 取根类 → `/api/component-graph?class=` 邻域 → 引用了/被引用芯片 + 孤儿提示 + 图级环警告 | 同上 |
| 芯片跳转 | 引用芯片点击 → `/api/ui-assets?class=` 定位定义文件并跳转预览；悬空引用（无定义）明示 | 同上 |

设计约束延续：零构建 vanilla（无前端依赖），产物仍是单文件内嵌页面；全部数据走既有 HTTP API，服务端零改动。

## 浏览器验收（真实工程操作链，全部通过）

| 步骤 | 结果 |
| --- | --- |
| 页面加载 | 全量 1151 文件 + 搜索栏三模式就位 |
| 文件模糊搜索 HometownRebateView | 命中 1/1151（1201ms，失败 0），行内显示 `HometownRebateViewSkin 1280x720 · 25节点` |
| 点击结果 → 预览 | iframe 渲染 111 节点 / 3 个位图数字 / 12 数字位片 / 0 破图（P1-C 状态无损） |
| 邻域面板 | 引用了 5 芯片（ArtNumberEUI tag / ArtNumberSkin skinName / DragonBonesAni tag / EmptyBtn tag / HometownRebateItemRenderSkin itemRenderer）+ 被引用为无（孤儿/代码挂载） |
| 芯片跳转 | 点 ArtNumberSkin → 跳转定义文件 `skins/ArtNumber.exml`（空皮肤，0 节点为正确结果） |
| 组件类型搜索 ArtNumberEUI | 命中 99/1151（702ms），与 P2-A 口径一致 |
| Console | 零报错零警告 |

## 回归

- `npm run check:all` 六套全绿（parser / render / server / mcp / ui-asset / component-graph）
- `/view` 选择器与 focus 深度定位（P0-G）未改动，行为不变

## 边界与后续

- 邻域面板只展示直接邻域（uses/usedBy）；传递闭包/子图可视化（多层展开图）留给 P2-B 深化或工作台后续迭代，当前无需求方
- 类名精确搜索区分大小写（与索引口径一致）
- 搜索每次触发完整索引构建（约 1.2s），按需构建决策不变；如工作台使用频率升高再做增量优化

## 下一步

P2-D UI 结构差异分析：基于 Scene JSON（stableKey/instancePath/srcFile 已是稳定规范化序列化）做结构 diff（新增/删除/属性变化/层级变化），先不做视觉 diff。
