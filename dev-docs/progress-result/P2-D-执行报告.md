# P2-D 执行报告：UI 结构差异分析

- 日期：2026-11-05
- 基线：`68f0495`（P2-C UI 搜索与可视化定位）
- 范围：两份 EXML 场景的结构 diff（新增/删除/跨父移动/属性级变化）
- 结论：**通过**。fixture 四类差异全覆盖精确命中，真实工程浏览器验证含真实跨父移动语义，八套检查全绿。

## 核心设计决策（对既定前提的两处修正）

1. **stableKey 不做身份主键**（修正"利用 stableKey 匹配节点"的原始设想）：
   stableKey = `EXML文件名#兄弟索引路径`（如 `Skin#0.2.1`），对中间插入/删除敏感——
   中间插一个节点，后续兄弟 stableKey 全部偏移，一次插入会误报成大量差异。
   stableKey/instancePath 降级为报告中的**定位信息**（可喂给 `/view?focus=` 深度定位）。
2. **moved 判定不用 instancePath 字符串比较**：instancePath 内嵌根类名，
   两文件根类名不同（DiffSkinA vs DiffSkinB）时所有根级子节点全部假报 moved（实测复现）。
   修正为**配对伴侣比较**：A 侧父的配对伴侣不是 B 侧实际父，才是真跨父移动。

## 匹配算法（两层）

```
第一层  id 主键（全树收集，两遍扫描）
        ├─ 同 id -> 配对（EXML 同文件 id 唯一，跨版本保留率高）
        ├─ id 只在 A -> removed
        └─ 配对伴侣表记录（父辈伴侣供 moved 判定）

第二层  无 id 同父顺序配对
        ├─ 剔除已配对 -> 按 (type + native.className) 分桶
        ├─ 桶内按顺序一一配对（业界树 diff 标准做法）
        └─ 尾差 -> added / removed

执行顺序（关键）：先根走查填满配对伴侣表，再跑 id 配对报告循环
（否则非 id 父节点伴侣未登记，深层 id 节点假报 moved）
```

属性变化：配对节点 flatten 全量对比（`bounds.x` / `attrs.text` / `native.attributes.width`
等路径级 from/to），排除 children 与 stableKey/instancePath（派生定位字段，moved 已覆盖）。

## 明示边界（不做近似猜测）

- 无 id 同签名兄弟的**中间**插入/删除会从插入点起报成属性变化链（顺序配对的位置敏感性）；
  有 id 节点不受影响；真实工程重要节点普遍带 id（_labTotal 等），此边界影响有限
- 只做结构 diff；视觉语义分类（位置类/资源类/文本类）不做，bounds/asset 路径的 from/to 已足够消费方自行分类

## 交付清单

| 项 | 实现 | 文件 |
| --- | --- | --- |
| diff 模块 | diffScenes（id 配对 + 顺序配对 + moved/changed/added/removed + 统计） | `src/scene/scene-diff.ts`（新增） |
| HTTP | `/api/scene-diff?fileA=&fileB=`（缺参 400，文件不存在 404） | `src/server/server.ts` |
| MCP | `diff_exml_scenes`（第 8 个工具） | `src/mcp/tools.ts`、`src/mcp/main.ts` |
| fixture | DiffSkinA/DiffSkinB（四类差异全覆盖设计用例） | `tests/fixtures/egret/resource/eui_skins/` |
| 验收套件 | tests/scene-diff-check.ts 入 check:all；server-check 路由断言；mcp-check 8 工具 | `tests/`、`package.json` |

## 验收结果

fixture（DiffSkinA → DiffSkinB，matched 5 / added 1 / removed 1 / moved 1 / changed 4）：

| 用例 | 预期 | 结果 |
| --- | --- | --- |
| img1 x 10→30（id 配对） | changed 含 native.attributes.x 10→30 | 通过 |
| label 文案/字号变（无 id 顺序配对） | changed 含 attrs.text + attrs.fontSize | 通过 |
| gone 只在 A | removed | 通过 |
| B 多一个无 id Image | added | 通过 |
| mv 从 grp1 移到根 | moved（且不报 stableKey 噪音） | 通过 |
| btnA 未变 | 不进 changed | 通过 |
| 根 width/class 变化 | changed 可报告 | 通过 |
| 同文件自 diff | 全零 | 通过 |

真实工程（浏览器验证）：

- HometownBagHelpView vs HometownBagRecordView：matched 7 / added 1 / removed 12 / moved 1 / changed 3，
  其中 **moved 是真实语义**：`_labReward` 从 `_listPrayHigh.item2` 跨父移到 `_listRecord.item2`
  （两处 List itemRenderer 静态展开上下文），changed 含资源图切换（asset.frame.x/y/w + attrs.source）
- HometownRebateView 自 diff：112 matched / 0/0/0/0（无差异基线）
- 同族版本对 FrontOpenHandCardItem41 vs 42：matched 6 / changed 6 / 无结构增删移（属性级差异，符合编号变体系列特征）
- 缺参 400 / 文件不存在 404

## 下一步

P2-E HTML → EXML 回写：以 data-egret-* 语义属性携带的 HTML 为输入写出 EXML
（不引入 React，见 P2 规划决策），打通 AI 生成 UI 的最后一环。
