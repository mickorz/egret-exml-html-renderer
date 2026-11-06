# P3-A 只读理解能力审计报告（ReadOnly-Audit）

- 审计基线：P2 完成后（`8e24f2d` + 执行报告提交）
- 审计计划：`dev-docs/planning/P3-A-只读理解能力完整性检查.md`
- 方法：真实浏览器注入审计脚本，ED.index 全节点程序化遍历（层 1）+ 三栏联动实测（层 2）
- 结论：**零 P0、零 P1；3 项 P2 记入优化清单。只读理解能力达标，可进入 P3。**

## 一、总体数据

| 工程 | 节点总数 | 画布命中 | 未解释缺失 | Inspector 渲染异常 | 类型覆盖 |
|---|---|---|---|---|---|
| HometownRebateView | 112 | 112/112 | 0 | 0/112 | rect 1 / group 12 / image 57 / animation 14 / container 12 / label 10 / bitmapnumber 3 / scroller 1 / list 1 / skin 1 |
| GameDisbandVoteSkin | 34 | 34/34 | 0 | 0/34 | rect 1 / group 7 / image 10 / container 3 / label 8 / button 2 / skin 3 |

## 二、五项专项结果

### A 节点覆盖 —— 通过

- 全部 146 节点在画布 DOM（`[data-egret-key]`）命中；零「无法归因的缺失」。
- 自动归因规则备而未用（visible=false / alpha=0 / 零尺寸 / 动画占位 / 模拟 / 合成包装）——本两工程无需归因。
- skin-wrap 包装层（GameDisbandVoteSkin skin 3 处：根 + 2 个展开皮肤子树根）全部命中（P2-E 的 data-egret-key 标记层）。

### B 身份一致性 —— 通过（1 项 P2）

- 展开内容节点（srcFile 非空且非 List 包装层）key 前缀 = basename(srcFile)：两工程全部一致（0 异常）。
- item 包装层（3 处）key 前缀属父文档（`.i0` 后缀）而 srcFile 指 item 皮肤——**为 P2-E 写回所有权设计语义，非异常**（审计规则初版误报，已豁免 `List:*` 包装层后归零）。
- instancePath 全部非空。
- **[P2-1] 合成根 skin 节点无 path**：ED.index 合成根（树根行）没有 path 字段，Inspector Basic 的 path 显示 `—`。影响：展示完整性；根节点身份（key=rootKey）与 className 均正常。后续优化：合成根 path 可显示 className。

### C 属性完整性 —— 通过

- 146 节点逐个选中渲染检查：insp-head 有标题（146/146）、Basic 组存在（146/146）、
  Transform 组双小节「原始 XML 声明 / 计算 bounds」（146/146）、
  有 attrs 时 Advanced 组双 pre（attrs 渲染语义 + native.attributes 原始快照）齐全、
  模拟节点 insp-head 带模拟徽标（全部）、零「选中节点不在当前文档索引中」过期态。
- 三数据源（native.attributes 原始声明 / bounds 计算 / attrs 渲染语义）在 Inspector 中不混淆（小节标题明示来源）。

### D 组件展开 —— 通过

- component.kind 语义一致：exml-skin 均有 srcFile（展开溯源），container 均无 srcFile（代码组件内联）——两工程 0 异常。
- 展开/模拟/合成三类徽章在 Scene Tree 与 Inspector（Component 组）双区一致展示。
- 实测：`_btnClose`（EmptyBtn，container 无展开来源）与 item 包装层（HometownRebateItemRenderSkin，exml-skin + srcFile + 模拟 + 合成标签）两类溯源完整。

### E 诊断可信度 —— 通过（审计过程含一次检测脚本自纠）

- 文档级计数与 doc.diagnostics.length 一致（20 / 1）。
- 唯一 id 节点绑定：HometownRebateView 7 个绑定、GameDisbandVoteSkin 1 个绑定，该绑皆绑、无误绑（misbound=0）。
- 重复 id 节点（HometownRebateView 26 组，List item 合成展开 3 份）：全部不绑定文档诊断，
  「当前节点相关」小节仅出现节点自身 unsupported（SCENE_NODE_* selfNotes，8 条，合法），零误绑定。
- 审计自纠记录：初版检测脚本 `querySelectorAll('.diag')` 抓取整个 Diagnostics 组（含文档级小节），
  将文档级行误判为节点级误绑（8 条假阳性）；限定小节 DOM 范围复测归零。**产品无缺陷，检测脚本已修正。**

## 三、三栏联动实测（层 2）—— 通过

| 检查 | 结果 |
|---|---|
| 文件切换重建（树重置/选择清除/iframe docid 变化/关系条刷新） | 通过（d2→d3 实测） |
| 重复打开同文件幂等（iframe 不重载、docId 不变） | 通过 |
| 快速连续切换（fetchSeq 防过期，最终态正确、无残留） | 通过（112 index/111 canvas/树重建/frame docid=d5） |
| Inspector 全节点遍历无旧数据残留（head 与选中一致） | 通过（112+34 全检查） |
| Tree 点击 → Canvas 金框 + Inspector | 通过（`_btnGift`：key 三方一致） |
| Canvas 点击 → Tree 定位可见 + Inspector | 通过（`_btnGift` 双向） |
| 点空白取消三区清空 | 通过（P1 验证复认） |

## 四、问题清单

### P0（阻塞只读理解）—— 无

### P1（重要信息错误或丢失）—— 无

### P2（展示与交互体验，记入后续优化清单）

| 编号 | 问题 | 建议 | 时机 |
|---|---|---|---|
| P2-1 | 合成根 skin 节点 Inspector 的 path 显示 `—` | 合成根 path 显示 className | P3 体验阶段顺手修 |
| P2-2 | Diagnostics 文档级列表较长（20 条全展开） | 当前节点相关默认展开、文档级折叠显示数量、点击可定位（若可唯一） | P3 体验阶段 |
| P2-3 | 诊断仅携带 nodeId，四级匹配（stableKey/instancePath）未启用 | 升级 DiagnosticLocation 数据结构（暂不改 Scene Builder，等需求出现） | P4 编辑阶段前评估 |

## 五、审计结论

P0/P1 清零。工作台对陌生 EXML 已具备完整只读理解能力：
每个节点可解释（A）、身份一致可追溯（B/D）、属性来源不混淆（C）、诊断可信（E）、三栏联动可靠（层 2）。

**批准进入 P3（Canvas 体验：Zoom / Fit / 悬停信息）。**
