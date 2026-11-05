# 最终目标：HometownRebateView 在 HTML 中正常显示

- 设定日期：2026-11-05
- 目标组件：`resource/skins/homeTown/HometownRebateView.exml`（HometownRebateViewSkin，1280x720）
- 状态：目标已设定，待 P1 分阶段达成

## 一、目标定义

「正常显示」的可验收标准（全部满足即达成）：

1. 舞台 1280x720 正确，全屏半透明黑底 Rect 铺满（边缘布局）。
2. 静态视觉元素全部就位且位置/尺寸正确：
   - 居中背景大图 `ht_rebate_bg_png`（1254x655，hcenter/vcenter）；
   - 关闭按钮 `_btnClose`（EmptyBtn 40x40 + 内联关闭图标，hcenter=541/vcenter=-240）；
   - 帮助按钮 `_btnTips`（同上形态）；
   - 活动时间文本 `_labTime`（"11月11日-12月30日"，20 号字，颜色 0xFFEBB2）；
   - 进度条线（`htSub_json.htrebate_ImgJindu1/2_png`，scale9Grid 九宫格，图集子图）；
   - 累计/消耗/加赠横幅（`ImgLeijiNs_png` / `ImgShuliang_png` / `ImgJiazeng_png`，scale9Grid="153,18,6,9"）；
   - 领取按钮 `_btnGift`（EmptyBtn + 内联 `BtnZslb_png`）。
3. `ArtNumberEUI` 数字组件按 prefix 位图数字渲染示例值（如 "8888"），三处实例
   （_labTotal / _labCost / _labJiazeng，后者带 rotation=-10）可见且按位对齐。
4. `e:List`（HorizontalLayout + itemRendererSkinName="HometownRebateItemRenderSkin"）
   静态展开至少 3 个 item，item 宽 229.96 水平排列，item 内部结构完整
   （背景/进度条/图标占位/x1 文本/箭头/目标数文本"5000"）。
5. `DragonBonesAni` 两处（烟花/礼物动画）无法静态还原 → 渲染为明确的标注占位
   （不虚线噪音化、不静默空白），unsupported 清单记录。
6. 浏览器 Console 无错误、图片请求无 404、无图集串图。
7. unsupported 清单仅剩「运行时行为」类条目（动画/数据绑定/交互），无结构缺失类条目。

最终对照物：游戏内该界面截图（用户可提供）做视觉对比收尾。

## 二、差距分析（当前 P0.1 能力 -> 目标所需）

| 元素 | 当前行为 | 差距 | 归属阶段 |
| --- | --- | --- | --- |
| Rect/背景图/Label/九宫格图集子图/EmptyBtn 内联子图标 | 部分支持 | EmptyBtn 等「带内联子节点的 custom 组件」当前画虚线占位框，需改为坐标系容器渲染 | P1-A2 |
| DragonBonesAni（骨骼动画） | 虚线占位框 | 已知动画类组件清单 -> 透明占位 + 诊断标注（动画无法静态还原） | P1-A2 |
| ArtNumberEUI（空皮肤 + 代码构建 + prefix 数字图集） | 虚线占位框 | 已知代码组件语义：`ArtNumberSkin` 是空 EXML（已核实），视觉全靠 `prefix="htSub_json.img_FntXiaohao_"` 数字图集逐位拼合；需按 prefix 渲染示例数字 | P1-A3 |
| e:Scroller | 虚线占位框 | 按容器渲染 + overflow 裁剪 | P1-A2 |
| e:List + itemRendererSkinName | 虚线占位框 | **类名 -> EXML 索引**：扫描全部 EXML 的 `class` 属性建索引（default.thm.json 仅 92 条映射，覆盖不了 ItemRender 类直引）+ 按 itemRendererSkinName 展开 N 个 item | P1-B |
| e:HorizontalLayout（List 排列） | 未支持记录 | 最小静态实现：按 item 首选宽度水平排列 | P1-C |
| HometownRebateItemRenderSkin 递归展开 | - | 递归场景构建已具备（buildScene 递归），补自定义组件展开入口 + 循环检测 + 展开缓存 | P1-B |

关键调研结论（已核实）：
- `default.thm.json` 的 skins 仅 92 条（`gdmj.ArtNumber -> resource/skins/ArtNumber.exml`），
  `itemRendererSkinName="HometownRebateItemRenderSkin"` 这类类名直引不在其中，
  必须建「EXML class 属性 -> 文件路径」全量索引（1143 个文件，一次性扫描建缓存）。
- `ArtNumberSkin`（ArtNumber.exml）是空皮肤：ArtNumberEUI 的视觉完全由组件代码构建，
  渲染器需要按「已知代码组件」逐类实现语义（bitmap 数字 prefix 拼合）。
- `EmptyBtn` / `DragonBonesAni` 无皮肤、无 EXML，是纯代码组件：
  EmptyBtn 的视觉即其内联子节点（当容器渲染即可）；DragonBonesAni 是纯动画无法静态还原。

## 三、执行计划

| 阶段 | 内容 | 交付物 |
| --- | --- | --- |
| P1-A | 类名索引 + custom 组件容器化（EmptyBtn/Scroller） + 动画类组件透明占位 | HometownRebateView 静态框架可见 |
| P1-B | itemRendererSkinName 展开（类名索引 -> 递归构建 item 场景） | List 内 item 结构完整 |
| P1-C | HorizontalLayout 最小静态排列 + ArtNumberEUI 数字位图渲染 | 完整验收标准达成 |
| 验收 | 浏览器像素/视觉对照 + 用户提供的游戏内截图对比 | P1-执行报告 |

## 四、关联文档

- 上游计划：`P0-迁移与最小验证执行计划.md`
- 路线登记：`../progress/执行进度.md`
- 差距调研记录：本文档第二节
