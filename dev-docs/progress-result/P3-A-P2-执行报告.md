# P3-A-P2 执行报告（Inspector 全量属性面板）

- 提交基线：P2-A `commit-a` / P2-B / P2-C / P2-D（四个独立提交，全部已推送 main）
- 对应执行计划：`dev-docs/planning/P3-A-三栏式可视化工作台执行计划.md` 3.6 节 + 用户 P2 评审四阶段拆分
- 架构边界：只读展示，不改 Parser / Scene Builder / Renderer / Writer / Diff

## 交付内容（四阶段）

| 阶段 | 提交 | 内容 |
|---|---|---|
| P2-A | 第 1 个 | 八组面板框架 + 分组折叠（Advanced 默认折叠）+ DOM 安全 kv 行（textContent/esc）+ Basic 组（type/name/id/key/path + 复制按钮） |
| P2-B | 第 2 个 | Transform（原始 XML 声明 vs 计算 bounds 两小节）/ Layout（八项约束 + layout 对象）/ Image（source/scale9Grid/asset 解析）/ Text（含颜色色块）/ Advanced（attrs + native.attributes 双快照） |
| P2-C | 第 3 个 | Component 组件溯源（identity/kind/skinClass + skinName/itemRendererSkinName 声明 + srcFile + 展开/模拟/合成标记） |
| P2-D | 第 4 个 | Diagnostics（节点级稳定身份匹配 + 文档级全量） |

## 关键设计决策

### 1. 数据源语义统一（评审 P2-01 可追溯）

发现：Scene Builder 在布局计算时把约束属性（left/right/horizontalCenter/verticalCenter 等）从 attrs 中 delete——attrs 是「渲染语义属性」而非原始声明。**不改 Scene Builder**，利用既有 `native.attributes`（完整原始 XML 属性快照，P1-A 已有）：

| 数据源 | 语义 | Inspector 用途 |
|---|---|---|
| `native.attributes` | 原始 XML 声明（完整快照） | Transform 原始小节 / Layout 约束 / Image/Text 属性 / Component 声明 |
| `bounds` | Scene Builder 计算结果 | Transform 计算小节 |
| `attrs` | 构建器转换后剩余（含 _centerH/_right 合成标记） | Advanced 渲染语义快照 |

### 2. 实例与来源分离（评审原则一）

Component 组只展示当前实例节点的溯源（组件身份/来源文件/模拟合成标记），不把源皮肤属性混入实例属性列表。来源文件旁标注「展开内容：子树来自源组件 EXML」。

### 3. 原始与计算分离（评审原则二）

Transform 组两小节：原始 XML 声明（native.attributes）与计算 bounds（Scene Builder）。实测 `_imgCost`：原始 x=63/y=120（EXML 声明）vs 计算 x=93.5/y=369（水平居中约束推导）——数值不同正是分离的价值。

### 4. Diagnostics 稳定身份匹配（评审原则四）

诊断只携带 nodeId（无 stableKey/instancePath 字段），优先级落地为：**id 存在且全文档唯一时关联 nodeId 匹配的诊断；id 重复（List 合成展开 3 份）不绑定，显式提示原因；禁止 name 模糊匹配**。

### 5. DOM 安全（评审 P2-02）

动态值一律 DOM API + textContent 赋值（kv 行构造器），JSON 用 pre + textContent，不裸拼 innerHTML。

### 6. 空分组隐藏（评审 P2-03）

分组 render 返回 null 即整组隐藏：Label 无 Image/Layout 组、Image 无 Text 组、非组件节点无 Component 组、无诊断无 Diagnostics 组。

## 浏览器验收（真实工程，测试矩阵全覆盖）

| 节点类型 | 验证对象 | 结果 |
|---|---|---|
| Group | HometownRebateView 主 group（Transform/Layout） | 通过 |
| Image | `_imgCost`（source/scale9Grid/asset frame JSON）+ `_help`（约束 hc/vc） | 通过 |
| Label | `_labTime`（text/fontFamily/textColor 色块 0xFFEBB2） | 通过 |
| Button | `_btnClose`（EmptyBtn identity/kind=container，无展开来源） | 通过 |
| Scroller | `_scrollSign`（约束 + SCENE_EUI_PARTIAL nodeId 匹配） | 通过 |
| BitmapNumber | `_labTotal`（模拟徽标 + 五组） | 通过 |
| Animation | `_aniYanhua`（节点级 2 条匹配：unsupported + PLACEHOLDER） | 通过 |
| List | item 包装层（identity/skinClass/srcFile/模拟/合成）+ `_imgLine1`（id 三处重复不绑定） | 通过 |

MCP 读图复核 7/7 通过（节点标题/分组面板/双小节/资源解析/折叠态/树高亮/画布金框）；「多选状态」疑点 DOM 复核为单选（sel=1），系「模拟」徽章误读。

## 质量门

- `npx tsc --noEmit` 干净（四阶段每阶段）
- `npm run check:all` 13 项全部通过（九套检查 + 分阶段运行）
- 截图存档：`dev-docs/progress-result/p3a-p2-inspector.png`

## 未做（按评审边界）

- 属性编辑、EXML 回写、拖拽修改（保持只读）
- P3（缩放/Fit/悬停/画布交互体验）待 P2 完整性检查后开工
