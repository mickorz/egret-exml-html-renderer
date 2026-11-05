# P2-E 执行报告：HTML→EXML 回写（EXML→HTML→EXML 闭环）

## 目标

让 AI 按约定生成的语义 HTML 能回写为 EXML 文本，形成 EXML→HTML→EXML 闭环，并用 P2-D 的 `diffScenes` 验证保真（结构零增删移、属性零差异）。

## 交付物

| 文件 | 内容 |
| --- | --- |
| `src/writer/exml-writer.ts` | `parseSemanticHtml()` / `writeExml()` / `htmlToExml()` 一步入口 |
| `src/renderer/utils.ts` | `dataAttrs()` 输出全集：id/name/type/path/key/src/tag/class/attrs + 可选 component/component-kind/simulated/layout |
| `src/renderer/html-renderer.ts` | stage 根携带根语义属性（tag/class/attrs/src/key/layout）；非根 skin 包装层发 `egret-skin-wrap` 标记层 |
| `src/renderer/nodes/image-node.ts` | img 自闭合（XHTML 形态，属性语义可机器解析） |
| `src/server/server.ts` | POST `/api/exml-write`（body JSON `{ html }`，限 2MB，返回 EXML 文本，不落盘） |
| `src/mcp/tools.ts` + `main.ts` | 第 9 个 MCP 工具 `write_exml_from_html` |
| `tests/exml-writer-check.ts` | 三段验收：fixture 全量 round-trip / AI 手写用例 / 真实工程 round-trip |

## 语义约定（AI 生成 HTML 的契约）

- 元素显式闭合、`img` 自闭合、属性双引号（XHTML 形态，fast-xml-parser preserveOrder 可稳定解析）
- 根元素 `class="egret-stage"`，携带 `data-egret-tag`（如 `e:Skin`）、`data-egret-attrs`（原始 EXML 属性全量 JSON）
- 语义节点携带 `data-egret-tag` + `data-egret-attrs`；布局声明 `data-egret-layout`（JSON：className + attrs）
- 内联按钮皮肤包装层：`class="egret-skin-wrap"` → 回写重建 `<e:skinName><e:Skin>...</e:Skin></e:skinName>`

## 核心设计决策

### 1. 文档归属判定：stableKey 前缀，而非 data-egret-src

P1-B 的 `srcFile` 溯源语义指向**皮肤文件**（实例节点 src = 皮肤 EXML），与写回需要的"标记属于哪个文档"正好相反。正确的判别器是 stableKey 前缀（= 源 EXML basename）：

- 实例与内联子节点 → 根文档前缀（回写保留）
- 展开皮肤内容 / 静态 item / 内联 skin 包装 → 皮肤文件前缀（**剪枝不回写**，重建时由皮肤展开自动再生）
- 递归循环皮肤的内容（前缀 = 根前缀）→ 被父级皮肤前缀子树剪枝先命中，不误写

### 2. 循环检测依赖根文件路径 → round-trip 必须原路径重建

`skinChain` 以根文件路径为起点。临时文件名（`__roundtrip_tmp__.exml`）会让 CycleA/CycleB 的循环链断在错误深度。测试改为**备份-写回-建场景-还原**（原路径重建），真实工程用临时文件（0 图级环，不受影响）。

### 3. 合成元素剪枝：`List:itemRenderer`

List 静态 item 包装层（P1-B 合成标记，非真实 EXML 元素）按标签名剪枝；item 内容由 `itemRendererSkinName` 重建时自动再生。

### 4. 内联按钮皮肤包装层重建

Skin 透明包装层原本不产生 DOM。P2-E 给非根 skin 节点发 `class="egret-skin-wrap"` 标记层（absolute inset 0，视觉零变化——浏览器实测可见包装层内 Image 与按钮盒精确对齐 220×76 = 220×76），回写器据此重建 `e:skinName/e:Skin` 属性子元素结构（skinName 标签前缀随皮肤标签前缀，如 `ui:Skin → ui:skinName`）。

### 5. e:layout 属性子元素重建

布局声明（`<e:layout><e:HorizontalLayout gap="5"/></e:layout>`）不是 XML 属性而是子元素——P2-E-1 曾因此丢失导致 List 布局退化。现在 `data-egret-layout` JSON 携带（className + attrs），回写重建为属性子元素形态。

## 修复的两个真实缺陷（过程中暴露）

1. **`/api/exml-write` 把整个 JSON body 喂给回写器**（未解析 `html` 字段）——server-check 未覆盖此路由所以存活。已修复并补齐路由测试（有效 200 / 非法 HTML 400 / 非 JSON body 400）。
2. **scene-diff 第 3 步顺序缺陷（P2-D 遗留假阳性）**：id 配对循环先报 moved 再递归填配对表。`lab`（在 listH item 内，id 收集顺序在 listH 之前）处理时 item 包装层尚未配对 → 同父假报跨父移动。修复：第 3 步拆两遍——先递归填满全树配对伴侣表，再做 moved 判定。真实跨父移动（HometownBagHelpView vs HometownBagRecordView 的 `_labReward`，跨 scroller 结构）不受影响仍正确报告。

## 验收结果（全绿）

- `exml-writer-check` fixture round-trip：**全部 EXML 结构零差异（无增删移）、属性零差异**
- `exml-writer-check` AI 生成用例：手写语义 HTML → EXML → 场景 → 渲染链路通过；非法输入（无语义标记普通 HTML）明确报错不静默输出空皮肤
- `exml-writer-check` 真实工程：HometownRebateView round-trip **matched 112 / changed 0 / 结构增删移 0**（60 个装饰元素跳过：位图数字位片 span 等）
- `check:all` 全链 9 套通过（parser / render / server / mcp / ui-asset / component-graph / scene-diff / writer / tsc）
- 浏览器验证（真实工程 7790）：
  - HometownRebateView 渲染无回归（111 语义节点、12 位图数字位片、无破坏图片）
  - 页面内 fetch `/view?bare=1` → POST `/api/exml-write` 完整链路：137,660 字节 HTML → 200 → 3,805 字节 EXML（25 语义节点 / 60 跳过），HometownRebateViewSkin / HometownRebateItemRender / ArtNumberEUI / DragonBonesAni 全部保留，无 `List:itemRenderer` 内联泄漏，`<e:layout>` 重建
  - GameDisbandVoteSkin（含 2 个可见内联按钮皮肤）：包装层标记不影响渲染（内衬图精确填充按钮盒）

## 已知边界（明示）

- 无 id 同签名兄弟的中间插入/删除：顺序配对位置敏感（P2-D 已知边界，回写场景不触发——round-trip 结构不变）
- 位图数字运行时数值：回写保留 `prefix` 属性与组件标记，位片 span 是装饰被跳过（重建按示例值重新模拟）
- 运行时数据绑定（如 List item 数据）：静态模拟 N 个 item 语义不变，item 内容不回写

## 结论

EXML→HTML→EXML 闭环达成：AI 按 XHTML 语义约定生成/编辑 HTML 即可获得保真 EXML 文本，round-trip 经 `diffScenes` 验证结构与属性零差异。P2 五个子阶段（A 资产索引 / B 组件图谱 / C 搜索工作台 / D 结构 diff / E 回写闭环）全部完成。
