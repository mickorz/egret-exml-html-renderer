基于两份实查样本（`ZButton.exml`、`TingItem.exml`）归纳 Scene JSON 的字段字典。

## Scene JSON 字段

### 顶层

| 字段 | 类型 | 观察值 |
|------|------|--------|
| `file` | string | `resource/eui_skins/TingItem.exml`（资源相对路径） |
| `className` | string | 皮肤类名 `TingItemSkin` |
| `rootKey` | string | 根节点 stableKey `TingItem#0` |
| `stage` | object | `{width, height}` 舞台尺寸 |
| `diagnostics` | array | 两例均为空；**非空内容未观察到** |
| `nodes` | array | 节点树，容器节点经 `children` 嵌套 |

### 节点（node）

| 字段 | 类型 | 说明（依据观察） |
|------|------|------|
| `type` | string | 渲染器节点类型；已观察 `image` / `group` |
| `id` | string\|null | EXML `id` 属性（`_card1`）；无则 null |
| `name` | string\|null | 两例均 null；**非空语义未知** |
| `path` | string | 属性路径 `TingItemSkin.group._card1`（皮肤类名.父链.id） |
| `key` | string | stableKey，层级编码：`TingItem#0.0.3` = 文件#根.容器.叶子 |
| `bounds` | object | `x/y` 必有；叶子节点带 `width/height`；**group 的 bounds 两例均无 width/height** |
| `attrs` | object | 解析后布局/视觉属性，**数值已类型化**（x 为数字） |
| `native` | object | 原始 EXML 信息，见下表 |
| `asset` | object\|null | 资源解析结果；null = 未解析到 |
| `unsupported` | array | **仅异常时出现**（如「source 属性缺失（运行时数据绑定）」） |
| `children` | array | 仅容器节点出现 |

### `native` 子字段

| 字段 | 说明 |
|------|------|
| `tag` | 原始 XML 标签 `e:Image` / `e:Group` |
| `className` | EUI 类名 `eui.Image` |
| `attributes` | 原始属性，**全部字符串**（与 `attrs` 的数值化形成对照） |
| `states` | 状态机；两例均为 `{}`，非空结构未观察 |

### `attrs` 已观察词汇表

`source` / `x` / `y` / `scaleX` / `scaleY` / `visible` / `scale9Grid` / `left` `right` `top` `bottom` / `horizontalCenter` `verticalCenter` → 折算为 `_centerH` `_centerV`（相对舞台中心偏移）

### `asset` 结构（已观察 kind 仅有 `frame`）

```
kind: "frame"          → 合成图集帧
file: 物理图集路径（resource/assets/pdk/watchPoker.png）
frame: {x, y, w, h, offX, offY, sourceW, sourceH}
```

## 未确定清单

| # | 内容 | 原因 |
|---|------|------|
| 1 | `diagnostics` 非空时的内容 | 未采样到非空案例 |
| 2 | `name` 字段非空的语义 | 两例均 null |
| 3 | `image`/`group` 之外的 `type`（label/rect/list 等）及其 attrs 词汇 | 未采样含文本/矢量/列表的文件 |
| 4 | `states` 非空的结构 | 两例均 `{}` |
| 5 | `asset.kind` 除 `frame` 外的取值 | 未观察到 |
| 6 | group 的 bounds 不含 width/height 是规则还是偶然 | 两例一致但未对照其他容器 |

要补全 #3/#4，给我一个带文本/状态的界面即可采样验证。