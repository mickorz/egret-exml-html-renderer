# P4-A1 Benchmark 建设报告

- 对应计划：`dev-docs/planning/P4-AI-UI理解能力验证计划.md`（P4-A1 评审后修订：A 组基线注入方式 + 工具调用效率独立指标）
- 结论：**30 题（20+10）+ 程序采集标准答案 + 人工逐题核对 + 评分规则 + 自动校验脚本全部就绪，验收标准全项达成。**

## 一、执行清单完成情况（9/9）

| # | 任务 | 交付物 |
|---|---|---|
| 1 | A 组数据获取方式修正 | 计划文档修订：A 组=基线组，实验框架直接注入 EXML 原文（不为实验加产品接口） |
| 2 | 理解题 20 道 | `benchmark/understanding/questions.json`（5 类 x4） |
| 3 | 修改题 10 道 | `benchmark/modification/questions.json`（5 类 x2） |
| 4 | MCP 采集标准答案 | `selftest/p4a1-bench.ts collect` -> `benchmark/ground-truth/answers.json`（30 题，全部来自工具真实返回） |
| 5 | 人工逐题核对 | 30 题与 A0/P3 审计期间多次独立采集交叉核对一致（见下"核对过程"） |
| 6 | 评分规则 | `benchmark/scoring/scoring-rules.json` |
| 7 | 严重事实错误规则 | 5 类 SEVERE 清单 + 一票否决政策 |
| 8 | 自动校验脚本 | `selftest/p4a1-bench.ts validate`（5 项校验，通过） |
| 9 | 本报告 | 本文 |

## 二、题目设计要点

- 主场景 `skins/homeTown/HometownRebateView.exml`（结构性最丰富：scroller/list/模拟 item/约束/图集/位图数字/代码组件）
- 辅场景 `skins/GameDisbandVoteSkin.exml`（资源检索题 + 内联皮肤 button）
- **七类陷阱全覆盖**：重复 nodeId（A-CMP-003）/ 模拟 List item（A-STR-004、B-XNODE-001）/ 合成包装（A-TRC-003、B-XNODE-001）/ 计算 bounds（A-PRP-001、B-LAY-001、B-LAY-002）/ class 精确搜索（A-CMP-004）/ 组件引用反查（A-RET-003、B-CMP-001）/ 跨文件组件（A-TRC-002、B-CMP-002）
- 陷阱题与正向题混排（不提示哪题是陷阱）
- 结构化输出契约写进题目文件（evidence 五要素 / target+changes+dependencies+risks+verification+requiresHumanApproval）

## 三、标准答案质量保障（三层）

1. **程序采集**：collect 模式逐题调用 MCP 工具，答案 100% 来自真实工程返回（非人工填写、非 AI 生成）
2. **程序校验**：validate 模式重跑采集逐题比对（防止采集脚本与环境漂移）+ 题目完整性 5 项
3. **人工核对**：30 题摘要与 A0 盘点、P3 只读审计期间的多次独立采集交叉核对一致；
   核对中修正 2 处采集脚本缺陷（见下）

### 核对过程发现并修正的采集脚本缺陷（非产品缺陷）

| 现象 | 根因 | 修正 |
|---|---|---|
| A-RET-004 采集为空（GDV asset 0） | asset 形状为 `{kind, file, frame:{x,y,w,h}}`，脚本误写 `a.frame?.file`（frame 是矩形无 file 字段） | 改 `a.file`；顺带修正 A-PRP-004 同源错误 |
| `hasXY:true` 字段歧义 | 字段名义为"有无 x/y"，实值 true 表示"无 x/y 声明"——裁判文档不允许歧义 | 改名 `noXYDeclaration` / `noWidthDeclaration` |

### 经验沉淀

- **裁判数据自身也要被审计**：采集脚本（写标准答案的代码）与被验证的产品同源风险——本次 asset 形状误用就是"用想象中的结构写断言"，与 ReadOnly-Audit 的空集盲区同类型
- ground-truth 文件由脚本直接落盘真实值；会话回显中的 stableKey 脱敏不影响文件内容（validate 的字符串级比对可证）

## 四、隔离性设计

- 被测 Agent 仅通过 MCP 访问 Egret 工程（`McpContext.rootDir` = 工程根），仓库 `dev-docs/benchmark/ground-truth/` 不在 MCP 数据面
- 实验环境（A2 执行时）：每题独立新会话、不给历史、不给 ground-truth、按组限定数据通道（A 注入原文 / B 场景与节点详情 / C 全部只读工具）
- answers.json 文件头注明用途与禁止访问范围

## 五、验收标准对照

| 验收项 | 标准 | 结果 |
|---|---|---|
| 理解题 | 20 道完整 | 通过（5 类 x4，每题 6 字段） |
| 修改题 | 10 道完整 | 通过（5 类 x2） |
| 标准答案 | 30 道人工核对 | 通过（交叉核对 + 2 处采集缺陷修正） |
| 证据 | 每题可追溯真实 MCP 数据 | 通过（evidence 含工具名+字段+真实值） |
| 评分规则 | 可程序化计算 | 通过（权重和=1、逐点给分、维度明确） |
| 负向测试 | 覆盖七类陷阱 | 通过（validate 断言全覆盖） |
| 隔离性 | 被测 Agent 无法访问标准答案 | 通过（数据面隔离设计） |
| 可重复性 | 同题可独立重复运行 | 通过（collect 幂等、validate 重采比对） |

## 六、下一步

P4-A2 真实 AI 走查：三组对照实验（A 基线 / B 结构化 / C 完整资产上下文），
同模型同题独立会话，逐题记录 MCP 调用 / Token / 耗时 / 回答原文，产出原始数据集。
