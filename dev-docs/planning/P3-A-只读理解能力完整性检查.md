# P3-A 只读理解能力完整性检查（ReadOnly-Audit）

- 前置：P0（三栏骨架）/ P1（双向选择）/ P2（Inspector 八组）全部通过评审
- 本阶段不写代码功能（只允许修复审计发现的 P0/P1 缺陷），只做全面走查与审计报告
- 通过标准：P0（阻塞只读理解）与 P1（重要信息错误或丢失）问题清零后才进入 P3

## 一、审计目标

给 AI 或开发人员一个陌生 EXML 页面，通过工作台能否完整理解 UI 结构：
每个节点为什么存在、为什么可见或不可见、能否追溯、Inspector 是否正确解释。

**验收原则**：不要求所有 Scene Tree 节点都在 Canvas 中出现（动态内容、静态模拟、
透明包装渲染行为不同）；要求的是每个节点的存在/可见性可解释、可追溯、展示正确。

## 二、审计范围

| 工程 | 节点规模 | 重点 |
|---|---|---|
| HometownRebateView（skins/homeTown/） | 112 节点 | 复杂业务页面：Group/Image/Label/Button/Scroller/BitmapNumber/Animation/List |
| GameDisbandVoteSkin（skins/） | 34 节点 | Skin、内联组件、skin-wrap 包装节点、组件展开溯源 |

## 三、审计方法（程序化全节点遍历 + 抽查）

不做随机点击。在真实浏览器中注入审计脚本，对 ED.index 全部节点逐个检查；
三个区域联动用浏览器实测抽查。两层：

### 层 1：数据与 DOM 全量程序化遍历（审计脚本，一次 eval 全节点）

- **A 节点覆盖**：每个 key 在画布 DOM（`[data-egret-key]`）中查找；
  未命中节点收集并自动归因（模拟/合成/零尺寸/alpha=0/visible=false/占位）——
  无法归因的未命中记问题。
- **B 身份一致性**：ED.index 的 key 与画布 `data-egret-key` 与树行 dataset.key 三方一致；
  srcFile 存在时 key 前缀必须等于源 EXML basename（stableKey 前缀规则）；
  instancePath 非空。
- **C 属性完整性**：遍历选中每个节点，检查 Inspector DOM：
  insp-head 有节点标题；Basic 组存在；Transform 组双小节（原始/计算）；
  有 attrs 时 Advanced 组有内容；无「选中节点不在当前文档索引中」错误态；
  模拟节点 insp-head 带模拟徽标。
- **D 组件展开**：srcFile 节点全部核对 key 前缀 = basename(srcFile)；
  component.kind 与展开标记语义一致（exml-skin 有 srcFile、container 无）。
- **E 诊断可信度**：id 唯一节点与文档诊断 nodeId 匹配数；
  id 重复节点不绑定（无「当前节点相关」小节或提示）；
  文档级计数 = doc.diagnostics.length。

### 层 2：三栏联动浏览器实测抽查（每个工程）

1. 文件切换正确重建（树重置展开、旧选择清除、iframe 换 docid、关系条刷新）。
2. 重复打开同文件不重载 iframe（幂等）。
3. Canvas 点击（深层节点）→ Tree 自动展开父链 + 定位 + Inspector 更新。
4. Tree 点击 → Canvas 高亮（金框）+ Inspector 更新。
5. 连续快速切换节点无旧数据残留（Inspector 标题与选中一致）。
6. 点空白取消选择三区一致清空。

## 四、问题分级

| 级别 | 定义 | 处理 |
|---|---|---|
| P0 | 阻塞只读理解（节点丢失/身份错乱/属性错误） | 本阶段必须修复 |
| P1 | 重要信息错误或丢失（溯源断裂/诊断误绑/残留） | 本阶段必须修复 |
| P2 | 展示与交互体验问题（过长/截断/顺序） | 记入清单，后续优化 |

## 五、交付物

- `dev-docs/progress-result/P3-A-只读理解能力审计报告.md`：
  节点总数/已检查数/类型覆盖数/无法渲染节点及原因/溯源异常/属性异常/
  诊断误匹配/三栏联动问题/遗留问题（分级）。
- 修复（若 P0/P1 非零）：独立提交，修复后复审对应项。

## 六、评审补充事项（记入优化清单，不在本阶段实施）

- Diagnostics 文档级列表较长：当前节点相关默认展开、文档级折叠显示数量、
  点击诊断可定位节点（若可唯一定位）——后续体验优化。
- 诊断数据结构升级（DiagnosticLocation：stableKey/instancePath/nodeId）——
  等实际出现四级匹配需求时再做，本阶段不为它改 Scene Builder。
