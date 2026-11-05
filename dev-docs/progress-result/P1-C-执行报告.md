# P1-C 执行报告：布局与代码组件语义

- 日期：2026-11-05
- 基线：`cff394d`（P1-B 自定义组件递归展开）
- 范围：HorizontalLayout/VerticalLayout 精确排列 + ArtNumberEUI prefix 位图数字拼合
- 结论：**通过**。目标组件 HometownRebateView 全部 8 条验收标准达成（浏览器数据层 + 视觉复核双重确认）。

## 交付清单

| 项 | 实现 | 文件 |
| --- | --- | --- |
| EUI 布局模块 | gap / padding 四边 / horizontalAlign / verticalAlign（left/center/right、top/middle/bottom）；未测得尺寸的子节点保持原位 | `src/scene/eui-layout.ts`（新增） |
| Group/容器布局应用 | Group/container/scroller 声明 Horizontal/VerticalLayout 时重排子节点（EUI 语义：覆盖显式 x/y）；TileLayout 等未支持类型明示 | `src/scene/scene-builder.ts` |
| List item 精确排列 | buildStaticItems 改用布局模块（P1-B 的朴素堆叠升级；未声明布局默认垂直，EUI 语义） | 同上 |
| 位图数字渲染器 | prefix + 字符 + `_png` 逐位拼合（帧背景），推进宽=sourceW、位高=sourceH、trim 用 offX/offY；示例值 8888（运行时数值未知，simulated 标记 + unsupported 明示）；某位帧缺失跳过该位并上报 | `src/renderer/nodes/bitmapnumber-node.ts`（新增） |
| 布局应用诊断 | SCENE_LAYOUT_APPLIED（gap 值入诊断）；未应用布局 unsupported 明示 | 同上 |

## 调研结论（位图数字）

- 图集子键格式：`prefix + 字符 + "_png"`（如 `htSub_json.img_FntXiaohao_8_png`）；
- 帧尺寸：推进宽 = sourceW，位高 = sourceH（三个 prefix 全部 sourceW==w，offX==0；底部对齐靠统一 sourceH）；
- 工程内 ArtNumberEUI 共 280 处实例（99 个文件），**全部无静态 text**——数值 100% 运行时注入，示例值模拟是唯一静态选择。

## 全量回归（1151 个 EXML，比 P0 记录的 1143 多 8 个为 thm 外文件）

```
总数 1151, 成功 1151, 崩溃 0
自定义组件展开 1028 次, List item 静态展开 92 处, 布局应用 207 处, 位图数字 762 处
```

## 过程中发现并修复的缺陷（根因修复，非防御性规避）

1. **listExmlFiles 静默丢目录**：walk 内 `try { readdirSync } catch { return }` 吞掉瞬态错误
   （Windows 杀软锁目录时整个子树消失），实测一次扫描 1151 -> 576 无任何报错。
   修复：移除 catch，让错误暴露（项目规则：严禁防御性吞错）。
   component-registry 的 readFileSync 吞错同样移除。
2. **heredoc 反斜杠吞噬**：冒烟脚本正则 `[\s\S]` 被写成单反斜杠导致匹配静默失败，
   产出"位图数字 0 位片"的假阴性结论。经验沉淀
   `dev-docs/experience/bash-heredoc-backslash-mangling.md`（本环境写脚本一律用 write 工具）。

## 验证结果

```
npm run check:all
  parser-check 全部通过
  render-check 全部通过（新增：Group 布局 gap/padding/对齐/显式坐标覆盖、TileLayout 明示、
    位图数字位片/推进/旋转/无 prefix 占位、真实工程三处位图数字断言）
  server-check 全部通过
  mcp-check 全部通过
  tsc --noEmit 通过
```

fixture：atlas 增加数字帧行（num_0..num_9）；ExpandSkin 增加 grpLay（布局覆盖显式坐标）、
grpTile（未支持布局）、num1/numRot（位图数字 + 旋转）/numNoPrefix（无 prefix 占位）；listV 加 gap=5。

浏览器终验（真实工程，8 条验收标准）：

| # | 标准 | 结果 |
| --- | --- | --- |
| 1 | 舞台 1280x720 + 全屏半透明底 | 通过（bkg 1280x720 铺满） |
| 2 | 静态视觉元素就位 | 通过（背景/关闭/帮助/日期/进度条/横幅，P1-A 验收后无回归） |
| 3 | ArtNumberEUI 位图数字示例值 + 旋转 | 通过（三处各 4 位片全可见，_labJiazeng 变换矩阵 -10°） |
| 4 | List 展开 3 item 水平排列 | 通过（483/713/943 各 230x480，scroller 裁剪生效） |
| 5 | DragonBones 明确标注占位 | 通过（[动画] 标签，不虚线噪音化） |
| 6 | Console 无错误/无 404/无串图 | 通过（0 破图、0 4xx、111 节点） |
| 7 | unsupported 仅剩运行时行为类 | 通过（数据绑定/动画/滚动/状态切换，无结构缺失项） |
| 8 | 组件展开可追溯（五元组） | 通过（源 EXML/class/instancePath/stableKey/静态模拟标记全落 DOM+JSON） |

视觉复核（截图分析）：三组 8888 金色位图数字（左下 -10° 倾斜确认）、3 列表项
（5000 圆章/图标槽/x1/前往按钮）、无破图无异常空白——与游戏内对照待用户提供截图后终比。

## 最终状态

P1-A/B/C 全部完成，最终目标「HometownRebateView 在 HTML 正常显示」的 8 条标准全部达成。
剩余为运行时行为类（动画/数据绑定/交互/状态切换），属静态渲染器边界外，均已在 unsupported 清单明示。
