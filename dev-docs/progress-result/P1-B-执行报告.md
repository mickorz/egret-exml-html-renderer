# P1-B 执行报告：自定义组件递归展开

- 日期：2026-11-05
- 基线：`14d3c2d`（P1-A 组件发现与基础容器化）
- 范围：自定义 exml-skin 组件展开 + List/DataGroup itemRendererSkinName 静态展开；不混入 P1-C（精确布局 / 位图数字）
- 结论：**通过**。阶段验收达成：三个 HometownRebateItemRenderSkin 实例完整显示，五元组溯源（源文件/class/实例路径/stableKey/静态模拟标记）全程可追溯。

## 交付清单

| 项 | 实现 | 说明 |
| --- | --- | --- |
| 自定义组件展开 | 类名索引 -> 源 EXML -> 皮肤子树嫁接 | 皮肤根为透明包装层（同 P0 内联 Skin 语义）；`skinName` 字符串属性优先于标签类名 |
| 循环引用检测 | 展开链 skinChain（每分支独立副本） | 回边停止展开按占位渲染，SCENE_CUSTOM_CYCLE 诊断；同文件多兄弟实例不误判 |
| 展开缓存 | 本次构建内按文件路径复用归一化树 | 每次构建 fresh（保持 P0「每请求 fresh 重解析」原则），解析失败缓存 null 记诊断 |
| List 静态 item | itemRendererSkinName -> 3 个静态模拟 item | 朴素堆叠（水平/垂直按布局声明，无声明默认垂直）；gap/padding P1-C |
| 实例/源路径分离 | item 与子节点 stableKey 前缀 = 源皮肤文件名 | 实例路径 instancePath 走宿主树（`..._listAccrue.item0`），源组件路径走 stableKey 前缀（`HometownRebateItemRender#...`） |
| 溯源落 DOM/JSON | `data-egret-simulated` / `data-egret-src`=源 EXML / Scene JSON `srcFile`+`simulated` | 五元组全部落地 |
| 附带修复 | 无 source 图（运行时数据绑定）原为隐形 div 零上报 | 改为虚线可见占位 + unsupported 明示；`right` 锚定 + 自身宽度未知（自适应文本）改 CSS 右锚定（原落到 x=0） |

## 关键实现决策

1. **展开链用不可变副本而非全局 Set**：A 含 B、文档别处又用 A 时，B 出现两次不是循环；
   只有同分支祖先回边才是循环。`skinChain` 每次嫁接 `[...ctx.skinChain, file]`。
2. **item 是合成节点**：`native.tag = "List:itemRenderer"`、`native.attributes.index` 记录序号，
   不伪装成任何 EXML 真实节点；`simulated = true` 明示 AI 静态模拟生成。
3. **展开皮肤默认状态独立**：源皮肤的 states 首项作为其子树 includeIn/excludeIn 判定基准，
   不沿用宿主文档默认状态（跨文档状态语义隔离）。
4. **实例尺寸优先**：皮肤声明 width/height 作为自然尺寸（measuredSize 语义），
   实例显式 width/height 覆盖（实测 w2: 皮肤 80 -> 实例 40 生效）。
5. **List 保持虚线占位框**：运行时行为（数据驱动/滚动）确实未支持，虚线框内渲染 3 个 item——
   诚实标注部分支持，不假装完整。

## 验证结果

```
npm run check:all
  parser-check 全部通过
  render-check 全部通过（新增：ExpandSkin 展开/嵌套/循环/skinName 属性/未解析/List 垂直水平堆叠/溯源/无 source 图断言；真实工程 HometownRebateView 3 item 断言）
  server-check 全部通过
  mcp-check 全部通过
  tsc --noEmit 通过
```

fixture 新增：`WidgetSkin` / `WidgetBigSkin`（嵌套）/ `CycleA`+`CycleB`（循环对）/ `ItemBoxSkin`（item 皮肤）/ `ExpandSkin`（宿主，覆盖全部场景）。

修复测试隐患：真实工程冒烟原 try/catch 会把断言失败降级为「跳过」——改为仅工程不存在时跳过，断言失败必须暴露。

浏览器实机（真实工程 GDMahjongMobile）：
- 3 个 item：各 28 内部节点、230x480、水平排列 x=483/713/943（scroller 裁剪生效）；
- item 内部结构完整：`_imgBg` 背景、目标数 "5000"、`x1` 数量文本、`_btnGet`/`_btnGoto` 按钮；
- 视觉分析确认：3 项等宽等高水平排列、金色 5000 圆章、图标槽（运行时绑定占位）、"前往"按钮全部可见，无遮挡错位；
- 0 破图、无 4xx、总节点 111（P1-A 为 24）；
- EmptyBtn 9 实例（视图 3 + item 3x2）、动画标注框 14 处（视图 2 + item 3x4）全部容器化/占位。

## 与目标的差距（移交 P1-C）

- HorizontalLayout 精确排列（gap/padding/对齐；当前朴素堆叠）；
- ArtNumberEUI prefix 位图数字拼合（当前占位，位置/尺寸正确）；
- 完成后达成全部 8 条验收标准。
