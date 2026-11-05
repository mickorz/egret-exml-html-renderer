# P2-A 执行报告：全工程 UI 组件资产索引

- 日期：2026-11-05
- 基线：`619b94b`（P1 关闭 + P2 路线图）
- 范围：性能基准 → 三层元数据索引 → 检索/反查 → HTTP + MCP 暴露 → 8 条验收
- 结论：**通过**。1151 EXML 全量索引零失败，整链约 1.3s（秒级），按需构建、未引入缓存。

## 性能基准（P2-A-1，决策数据）

Pass 1 整链（真实调用路径）：

| 阶段 | 耗时 |
| --- | --- |
| 文件枚举（1151） | 183ms |
| 类名索引构建 | 155ms |
| 资产索引构建（读+解析+归一化+提取） | 1010ms |
| **合计** | **1348ms** |

Pass 2 分项：枚举 65ms / 读文件 94ms / XML 解析 416ms / 归一化 72ms / 元数据提取（单趟三层）34ms。

**决策：整链秒级 → 按需构建，不引入缓存/文件监听/失效维护**（验收 #8 依据）。
服务端每次请求重建（与既有「每次重新解析」惯例一致）；XML 解析是唯一大头，若未来需要优化，
方向是解析结果复用，而非加缓存层。

## 交付清单

| 项 | 实现 | 文件 |
| --- | --- | --- |
| 三层元数据提取 | 基础层（file/rootClass/宽高/节点数/state 数）+ 结构层（组件类型计数/自定义组件计数/itemRenderer 皮肤引用）+ 资源层（图片 source/位图数字 prefix），单趟遍历 | `src/scene/ui-asset-index.ts`（新增） |
| 索引构建 | buildUiAssetIndex：枚举→读→解析→归一化→提取；解析失败计入 parseFailures+诊断（可统计不静默）；stats 记录耗时/文件数/条目数/失败数 | 同上 |
| 检索 | searchUiAssets：class 精确 / 文件名子串模糊 / 组件类型（eui.X 或自定义类名），AND 组合，线性过滤 | 同上 |
| 反查 | findComponentUsages：标签引用 + itemRendererSkinName 引用（P2-B 图谱数据基础） | 同上 |
| workspace 入口 | listUiAssets()（HTTP 与 MCP 共用同一入口） | `src/scene/workspace.ts` |
| HTTP API | `/api/ui-assets`（?class=&file=&component=）、`/api/ui-assets/usage?class=` | `src/server/server.ts` |
| MCP 工具 | search_ui_assets、find_component_usages（tools/list 共 6 个） | `src/mcp/tools.ts`、`src/mcp/main.ts` |
| 验收套件 | tests/ui-asset-check.ts（fixture 11 条目 + 真实工程 1151 全量），`npm run check:assets`，纳入 check:all 级联 | `package.json` |
| fixture | 新增 default.thm.json（SampleSkin 走 thm 源，激活 thm 优先级验收路径） | `tests/fixtures/egret/resource/default.thm.json` |

## 过程中的联动修改（断言放大复核）

- server-check 的 fixture 类名索引断言从「无 thm scan-only」更新为「thm 优先 + scan 回退」双路径
  （新增 fixture thm.json 后 SampleSkin 来源变 thm，WidgetSkin 保持 scan）。
- mcp-check tools/list 断言从 4 工具更新为 6 工具，并补 search_ui_assets / find_component_usages 的 call 断言。

## 验收结果（8 条逐条）

| # | 标准 | 结果 |
| --- | --- | --- |
| 1 | 1151 全量扫描无静默漏文件 | 通过（entryCount+failureCount===fileCount===listExmlFiles 数量，断言强制） |
| 2 | 提取成功率可统计，失败有诊断 | 通过（stats.failureCount + parseFailures 明细 + ASSET_INDEX_* 诊断） |
| 3 | thm/scan 来源优先级正确 | 通过（thm 登记类标 thm，未登记回退 scan，fixture + 真实工程双断言） |
| 4 | 按 class/文件名/组件类型搜索 | 通过（HTTP + MCP + 浏览器实测：HometownRebateViewSkin 1 命中、hometown+eui.List 5 命中） |
| 5 | 反查组件被哪些 EXML 引用 | 通过（HometownRebateItemRenderSkin→1 处 itemRenderer；EmptyBtn→467 处 tag） |
| 6 | HTTP 与 MCP 同一份索引服务 | 通过（两入口都走 ws.listUiAssets()，mcp-check 断言与 HTTP 同构） |
| 7 | 记录构建耗时/文件数/失败数 | 通过（stats.buildMs/fileCount/entryCount/failureCount，随每次响应返回） |
| 8 | 不引入未验证的持久化缓存 | 通过（基准数据在案，未加任何缓存） |

## 索引规模（真实工程）

1151 条目 / 0 失败 / 0 诊断；HometownRebateView 抽样与 P1-C 已知事实全对齐
（eui.Image×9、ArtNumberEUI×3、3 个 bitmapPrefix、itemRenderer 引用 HometownRebateItemRenderSkin、1280x720）。
ArtNumberEUI 命中 99 文件（与 P1-C 调研口径一致）。

## 下一步

P2-B 组件关系图谱：以本索引 entries 的 structure 层（customComponents/itemRendererSkins）+
类名索引为数据源，构建引用关系图（引用方向/父子嵌套层级），无需再全量解析。
