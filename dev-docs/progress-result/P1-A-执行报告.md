# P1-A 执行报告：组件发现与基础容器化

- 日期：2026-11-05
- 基线：`9eba9fb`（P0.1 闭环 + P1 目标归档）
- 范围：HometownRebateView 静态框架不再因代码组件丢失视觉结构；不混入 P1-B（itemRenderer 展开）/ P1-C（布局与位图数字）
- 结论：**通过**。阶段验收达成：背景/按钮/文本等静态元素全部正常显示，EmptyBtn/Scroller 容器化，DragonBones 动画标注占位，`npm run check:all` 全绿，浏览器实机验证通过。

## 交付清单

| 模块 | 内容 | 文件 |
| --- | --- | --- |
| 组件注册表 | 身份解析（URI+localName，不依赖前缀）/ 语义注册 / 类名索引双数据源 | `src/scene/component-registry.ts`（新增） |
| Normalizer | custom 节点记录 nsUri；`e:layout` 属性元素收纳到 layout 字段（不再渲染为未知节点） | `src/parser/exml/exml-normalizer.ts` |
| Scene Builder | custom 语义分派（container/animation/bitmap-number/exml-skin）；Scroller 容器化；component/layout 字段 | `src/scene/scene-builder.ts` |
| 渲染器 | scroller（裁剪容器 overflow:hidden）/ animation（透明标注框 + fileName 标签）新节点文件；container 复用 group 渲染 | `src/renderer/nodes/{scroller,animation}-node.ts`（新增）、`html-renderer.ts` |
| 溯源 | DOM `data-egret-component` / `data-egret-component-kind`；Scene JSON component/layout 字段 | `src/renderer/utils.ts`、`src/scene/scene-json.ts` |
| 类名索引 | thm.json skins（优先）+ EXML 根 class 全量扫描（惰性一次构建），重复类名记诊断 | `src/scene/workspace.ts` |

## 关键实现决策

1. **组件身份 = Namespace URI + localName**（评审采纳的提醒）：
   `uri "*" -> "EmptyBtn"`（根包）、`uri "gdmj.*" -> "gdmj.ArtNumber"`（包通配）。
   Normalizer 在归一化时记录 custom 节点的 nsUri，Scene Builder 据此解析身份，全程不碰 `e:`/`ns1:` 前缀字符串。
2. **语义注册表**（新增组件不改 Scene Builder 核心）：
   EmptyBtn=container（视觉=内联子节点，同 Group 渲染）、ArtNumberEUI=bitmap-number（P1-C 实现 prefix 位图拼合，
   当前占位但语义可追溯）、DragonBonesAni=animation（静态不可还原，透明标注框 + fileName 标签）。
   未登记 custom = exml-skin 候选（P1-B 经类名索引展开），当前保持虚线占位。
3. **Scroller 容器化**：`overflow:hidden` 裁剪容器；滚动交互/viewport 自适应静态不支持，unsupported 明示。
4. **`e:layout` 属性元素**：从 children 剔除收纳到 `layout` 字段（className+attrs），unsupported 明示
   "已记录（排列 P1-C 应用）"——修复了 P0 把 layout 声明渲染成 `unknown:layout` 虚线框的噪音。
5. **类名索引双数据源收口**：thm.json（92 条，优先）+ EXML 全量扫描根 class 属性；
   重复类名按来源记诊断（thm 优先 / scan 按扫描序取首个）。实测：
   `HometownRebateItemRenderSkin -> skins/homeTown/HometownRebateItemRender.exml`（scan）、
   `gdmj.ArtNumber -> skins/ArtNumber.exml`（thm），无重复诊断。
6. **动画占位形态**：半透明青色虚线框 + `[动画] fileName` 标签（标签在框上方避免遮挡），
   无显式尺寸时用名义 96x96（真实包围盒运行时骨骼决定，静态不可知）。

## 溯源五元组落点（验收标准第 8 条的第一批）

- 来源 EXML 文件：`data-egret-src`（P1-B 展开节点将携带源组件 EXML）
- 原始组件 class：`data-egret-component`（身份）+ `data-egret-component-kind`（语义）
- 实例路径：`data-egret-path`（instancePath）
- 源节点路径：`data-egret-key`（stableKey）
- 静态模拟标记：P1-B（List 静态 item）/ P1-C（位图数字示例值）落

## 验证结果

```
npm run check:all
  parser-check 全部通过（新增：e:layout 收纳 / custom nsUri 记录）
  render-check 全部通过（新增：CustomCompSkin fixture 六类断言 + HometownRebateView 实机断言 + 类名索引双数据源断言）
  server-check 全部通过（新增：scan-only 索引 / Scene JSON component 溯源）
  mcp-check 全部通过
  tsc --noEmit 通过
```

浏览器实机（真实工程 GDMahjongMobile，127.0.0.1:7790）：
- 24 个 DOM 节点，0 破图，console 无错误（仅 favicon 404，非场景资源）；
- EmptyBtn 三实例（关闭/帮助/领取按钮）：容器渲染无虚线，内联图标可见；
- Scroller `overflow:hidden` 裁剪生效；
- DragonBones 两处标注框（`[动画] Xiandinglibao_yh` / `[动画] Xiandinglibao_01`）；
- ArtNumberEUI 三实例 bitmapnumber 占位（位置/尺寸正确，等 P1-C）；
- 剩余占位恰为 P1-B（List x1）/ P1-C（bitmapnumber x3）范围，边界干净；
- 视觉分析确认：背景大图/关闭/帮助按钮/日期文本/进度条/横幅全部就位。

## 与目标的差距（移交 P1-B/P1-C）

- List itemRendererSkinName 展开（P1-B，类名索引已就绪）；
- HorizontalLayout 排列（P1-C，layout 声明已记录）；
- ArtNumberEUI prefix 位图数字拼合（P1-C，语义已登记）。
