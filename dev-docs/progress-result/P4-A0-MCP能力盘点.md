# P4-A0 MCP 能力盘点报告

- 对应计划：`dev-docs/planning/P4-AI-UI理解能力验证计划.md`
- 方法：9 工具逐一映射 Gate A/B 数据需求 + 实证脚本（`selftest/p4a0-mcp-audit.ts`，真实工程 24 项检查）
- 结论：**修复 1 项 P1 级数据缺口（节点级溯源断裂）后，Gate A/B 所需数据全部可达，无缺口。**

## 一、工具与数据能力映射表

| MCP 工具 | 数据能力 | Gate A 用途 | Gate B 用途 |
|---|---|---|---|
| list_exml_files | 工程文件全量（1151）+ 项目信息 | A 资产检索（枚举） | — |
| get_exml_scene | Scene JSON（rootKey/className/stage/diagnostics + 递归节点：type/id/name/path/key/bounds/attrs/native.attributes/asset/component/srcFile/simulated/layout/unsupported/children） | B 结构 / C 溯源 / D 属性（全字段） | 目标定位 / 原始声明（native.attributes） |
| get_node_detail | 单节点全量（同上 + unsupported + childCount；按 stableKey） | D 属性（Inspector 数据源） | 修改属性 before 值 |
| search_ui_assets | 三层元数据检索（class=根类**精确** / file=路径**模糊** / component=标签组件类型） | A 资产检索 | 候选搜索 |
| find_component_usages | 组件被引用反查（tag / itemRenderer / skinName 三类边） | A 检索 / C 溯源 | **依赖影响（Skin 复用范围）** |
| get_component_graph | 组件关系图 / 单类邻域（uses/usedBy/inCycle） | C 溯源（引用链） | 影响范围分析 |
| diff_exml_scenes | 两 EXML 结构差异（stats/added/removed/moved/changed） | — | **验证方案（Scene Diff）** |
| preview_exml | HTML 渲染 + 截图（临时目录，只读） | 视觉辅助 | 修改前后预期（视觉） |
| write_exml_from_html | 语义 HTML -> EXML 文本（不落盘） | — | （P4 后期，方案产出格式） |

## 二、Gate 数据需求可达性（实证 24 项全过）

| 需求 | 验证点 | 结果 |
|---|---|---|
| 结构理解 | rootKey/递归节点/className | 通过 |
| 原始声明 | native.attributes（source/scale9Grid/约束） | 通过 |
| 计算结果 | bounds（数值） | 通过 |
| 渲染语义 | attrs（对象） | 通过 |
| 资源解析 | asset（kind=file/frame + frame 对象） | 通过 |
| List 溯源 | 包装层 srcFile + 3 item + 展开内容 srcFile | 通过（修复后） |
| 模拟标记 | simulated=true | 通过 |
| 组件语义 | component.kind=container（EmptyBtn）/exml-skin | 通过 |
| 诊断 | diagnostics 20 条（nodeId 关联数据齐备） | 通过 |
| 检索三模式 | class 精确 / file 模糊 23 / component 标签 467 | 通过 |
| 引用反查 | EmptyBtn 467 处 | 通过 |
| 关系邻域 | uses/usedBy 数组 | 通过 |
| Diff | stats.matched/changed 结构 | 通过 |

## 三、盘点发现的缺口与处置

### 已修复（本提交）：P1 级节点级溯源断裂

**现象**：`get_exml_scene` / `get_node_detail` 中，展开皮肤与静态 List item 的**内容子节点**
（如 `_imgLine1`，key 前缀 `HometownRebateItemRender#`）**没有 srcFile 字段**——只有展开根
（exml-skin container）与 item 包装层有。Inspector 对这些节点显示「无展开来源（当前文件
声明的节点）」——**语义错误**（内容实际来自 item 皮肤文件）。

**根因**：`convertNode` 的 `file` 参数（节点所属源文件）只用于图片资源解析与尺寸测量，
从未赋给 `srcFile` 输出字段。

**为何此前审计未发现**：ReadOnly-Audit 的 B 项检查「srcFile 存在时 key 前缀一致」——
内容节点无 srcFile 直接跳过，检查集合为空集，形成盲区（**检查规则必须覆盖"应有而缺失"
的断言形态，不能只查"已有的是否正确"**——已记入经验）。

**修复**：BuildContext 增补 `rootFile`（当前文档根文件）；`convertNode` 统一赋值
`srcFile = file !== rootFile ? file : undefined`（exml-skin 展开根在原分支覆盖为自身皮肤
文件，行为不变）。stableKey 前缀（写回所有权判定）本就正确，写回回归实测 112 matched/0
changed 不受影响；check:all 13 项全绿。

### 语义澄清（非缺陷，测评注意）

| 项 | 语义 | 注意 |
|---|---|---|
| search_ui_assets.class | 根 class **精确**匹配 | AI 用模糊词（如 HometownRebate）会 0 命中；模糊需求应先 file 模式或用 find_component_usages |
| search_ui_assets.component | **标签引用**的组件类型/自定义类名 | 搜 itemRenderer 皮肤类应使用 find_component_usages（三类引用边） |
| diff_exml_scenes | matched 位于 stats.matched | 顶层字段为 stats/added/removed/moved/changed |

工具描述（mcp/main.ts）本已写明上述语义，无需修改；记入 Benchmark 出题与评分注意事项。

## 四、Gate B 关键场景数据链验证（不修改，仅验可达）

| 案例 | 数据链 | 状态 |
|---|---|---|
| 关闭按钮位移 | get_node_detail（native.attributes 原始 x/y + 约束 + bounds 计算） | 可达 |
| List item 内部图片 | scene（item 包装 srcFile -> 内容 srcFile -> 源文件区分） | 可达（修复后） |
| 按钮皮肤替换候选 | find_component_usages（复用范围）+ get_component_graph（邻域）+ search（候选） | 可达 |
| 修改影响验证 | diff_exml_scenes（修改前后对比） | 可达 |

## 五、结论

MCP 9 工具已完整覆盖 Gate A（五类理解）与 Gate B（五类修改规划）的数据需求；
本阶段修复的节点级溯源断裂是进入 Benchmark（P4-A1）前的必要补齐。

**下一步：P4-A1 Benchmark 建设（20 理解题 + 10 修改题 + 人工核对标准答案 + 评分规则）。**
