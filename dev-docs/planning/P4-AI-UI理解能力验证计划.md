# P4-AI UI 理解能力验证计划

- 前置：P3-A 全阶段完成（只读理解基础 + Canvas 体验），审计零 P0/P1
- 本阶段不写 UI 功能：验证「AI 能否通过本工作台理解现有 Egret UI 并提出准确局部修改方案」
- 核心命题：给 AI 一个完全陌生的 Egret 游戏工程，只开放本工作台 MCP，
  它能否像熟悉该项目的 UI 开发人员一样找到组件、理解结构、解释属性、准确提出修改方案。

## 一、两个 Gate（独立评分）

| Gate | 名称 | 输入 | 输出 |
|---|---|---|---|
| A | UI Understanding | Scene JSON / 资产索引 / 组件关系 / 节点属性 | 结构分析 / 节点定位 / 组件溯源 / 属性解释 |
| B | Modification Planning | 用户修改需求 + 工程数据 | 目标节点 / 修改属性 / 影响范围 / 修改前后预期 / 验证方法 |

理解 ≠ 会改：两个 Gate 独立评分，B 不因 A 高分而免检。

## 二、验证方式（MCP 工具链 + 真实 AI 走查）

```
真实 Egret 工程（GDMahjongMobile，1151 EXML）
      |
egret-exml-html-renderer（Scene JSON / Asset Index / Component Graph / Node Detail / Diff）
      |
MCP Server（9 工具）
      |
AI Agent（全新会话，每题只给必要需求，不给答案）
      |
Gate A / Gate B 结构化输出
      |
程序化评测（stableKey / 文件 / 属性 / 依赖自动核对）+ 人工复核
```

**隔离铁律**：被测 AI 只能通过 MCP 获取工程信息；不得读源码 / EXML 原文 / 历史对话。
每组每题独立新会话。

## 三、Gate A：20 道理解题（五类 x4）

| 类别 | 数量 | 考察 | 关键防错点 |
|---|---|---|---|
| A 资产检索 | 4 | 找到正确 EXML/组件/资源 | 遗漏直接引用；混淆文件与展开实例 |
| B 结构理解 | 4 | 父子层级 / instancePath | 把展开节点误认为原始节点；漏中间容器 |
| C 组件溯源 | 4 | component.kind / srcFile / List item | 模拟节点当真实节点；合成包装当声明节点 |
| D 属性理解 | 4 | native.attributes / bounds / attrs / asset | 把计算 bounds 当原始声明（重点） |
| E 综合理解 | 4 | 跨工具跨文件推理 | 修改影响文件清单完整性 |

## 四、Gate B：10 道修改规划题（五类 x2）

单属性修改 / 布局修改 / 组件修改 / 资源替换 / 跨节点影响。
每题必须输出：目标节点（file + stableKey + instancePath）、修改属性（before/after/reason）、
依赖影响（Skin 复用 / 相邻布局）、风险、验证方案（含 Scene Diff）、requiresHumanApproval。

重点案例：关闭按钮位移（约束判定）、List item 内部分隔线（源文件 vs 模拟实例区分）、
按钮皮肤替换（复用候选 + 影响范围）。

## 五、评分规则（0~1，权重）

Gate A：资产检索 15% / 节点定位 25% / 组件溯源 20% / 属性解释 20% / 证据完整性 20%
Gate B：目标定位 25% / 修改属性 20% / 布局影响 20% / 依赖影响 15% / 验证方案 20%

达标线：两 Gate 总分 >= 0.85；节点定位 >= 0.95；组件溯源 >= 0.90；证据完整性 >= 0.90；
**严重事实错误 = 0**（错改源文件 / 模拟当真实 / 计算 bounds 当原始 / 误绑重复 ID 诊断）。
总分不掩盖单项缺陷：任一关键单项不达标即不进入自动修改阶段。

## 六、三组对照实验

| 组 | AI 可获取信息 | 目的 |
|---|---|---|
| A | 仅原始 EXML 文本 | 基线（模型裸读） |
| B | Scene JSON + Node Detail | 结构化数据增益 |
| C | B + Asset Index + Component Graph + Diff | 完整资产上下文增益 |

同模型 / 同题 / 同输出要求 / 独立新会话。回答：B-A 结构属性理解增益？C-B 溯源与跨文件规划增益？
哪些题 C 组仍失败（工具/数据/语义/推理归因）？

## 七、执行顺序

| 阶段 | 任务 | 交付物 |
|---|---|---|
| P4-A0 | MCP 能力盘点（工具 x 数据能力映射 + 实证验证 + 缺口清单） | `P4-A0-MCP能力盘点.md` |
| P4-A1 | Benchmark 建设（20+10 题 + 人工核对标准答案 + 评分规则） | `benchmark/` 四目录 + `P4-A1-Benchmark建设报告.md` |
| P4-A2 | 真实 AI 走查（三组对照，记录工具调用/原始数据/回答/耗时） | `P4-A2-AI走查报告.md` |
| P4-A3 | 评测与归因（准确率/证据/严重错误/三组差异/失败归因） | `P4-A3-综合评测报告.md` |

## 八、结构化输出契约（评测可自动核对）

Gate A：`{answer, evidence:[{file, stableKey, instancePath, field, value}], reasoning, confidence, unknowns}`
Gate B：`{target:{file, stableKey, instancePath}, changes:[{property, before, after, reason}], dependencies, risks, verification, requiresHumanApproval}`

## 九、交付物目录

```
dev-docs/
├── planning/P4-AI-UI理解能力验证计划.md（本文档）
├── benchmark/
│   ├── understanding/questions.json
│   ├── modification/questions.json
│   ├── ground-truth/answers.json
│   └── scoring/scoring-rules.json
└── progress-result/
    ├── P4-A0-MCP能力盘点.md
    ├── P4-A1-Benchmark建设报告.md
    ├── P4-A2-AI走查报告.md
    └── P4-A3-综合评测报告.md
```
