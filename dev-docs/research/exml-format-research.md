# EXML 格式调研（P0-B1）

调研样本：`E:/WorkProjects/GDMahjongMobile/gdmahjong/GDMahjongMobile`（1145 个 EXML，Poker/GDMJ 两玩法）。

## 一、文件分布

| 目录 | 数量 | 说明 |
| --- | --- | --- |
| resource/eui_skins/ | 45 | 扑克玩法皮肤 |
| resource/skins/ | 约 1100 | 麻将玩法皮肤（含子目录） |

资源配置：`resource/default.res.json`（2011 条 resources + 264 个 groups）、局部 `*.res.json`（如 assets/music/music.res.json）。

## 二、XML 结构

```xml
<?xml version="1.0" encoding="utf-8"?>
<e:Skin class="BaseCardSkin" width="174" height="238"
        xmlns:e="http://ns.egret.com/eui"
        xmlns:w="http://ns.egret.com/wing"
        xmlns:gdmj="gdmj.*" xmlns:ns1="*"
        states="state_front,state_back,...">
```

- 根节点：`e:Skin`，`class` 属性为皮肤类名，`width/height` 为舞台尺寸（可缺省）。
- Namespace 判定组件类型必须用 URI（`http://ns.egret.com/eui`），不能用前缀字符串。
- `w:` 前缀（Wing IDE）是编辑器元数据（`w:Config`/`w:Declarations`），非 UI，解析时剔除。
- `tween:` 前缀（http://ns.egret.com/tween）是动画声明，P0 不支持。

## 三、标签分布（全工程统计）

| 标签 | 次数 | P0 处理 |
| --- | --- | --- |
| e:Image | 9512 | 支持 |
| e:Group | 4645 | 支持 |
| e:Label | 3670 | 支持 |
| 自定义组件（ns1:*/gdmj:*/Poker:*） | ~3000 | 占位容器 + 上报 |
| e:Rect | 535 | 支持 |
| e:Button | 51 | 支持（内联 skinName） |
| e:Scroller / e:List / e:DataGroup | ~390 | 占位容器 + 上报 |
| e:BitmapLabel / e:EditableText | ~110 | 占位容器 + 上报 |
| tween:* / e:Object / e:ArrayCollection | ~1000 | 剔除 + 上报 |

## 四、属性要点

1. **state 后缀属性**：`visible.state_back="false"`、`y.state_pending="-25"`——仅该状态生效。P0 只记录不应用（默认状态渲染），必须上报。
2. **includeIn / excludeIn**：节点级状态归属，同上。
3. **布局约束**：`horizontalCenter` / `verticalCenter` / `left` / `right` / `top` / `bottom` 大量使用（几乎每个居中图标/文本都有）；`width="100%"` 百分比写法常见。缺了这些属性基本页面必乱，P0 做最小静态计算。
4. **颜色**：`0xRRGGBB` 格式（`textColor="0xFFE8B4"`）。
5. **字号**：Label 的字号属性名是 `size`（继承 egret.TextField），不是 `fontSize`。
6. **九宫格**：`scale9Grid="10,28,8,19"`（x,y,w,h）。
7. **锚点**：`anchorOffsetX/Y`（transform-origin 对应物）。
8. **资源引用**：
   - 直接名：`source="poker_spades_png"`——先查 resources 名称，再回退查全部 sheet 子键；
   - 图集子图：`source="pdk_json.puke_da_di_png"`——sheet 资源名.子键；
   - 帧矩形在 atlas json（texture merger 格式：`frames.<key> = {x,y,w,h,offX,offY,sourceW,sourceH}`）。
9. **内联皮肤**：`<e:Button><e:skinName><e:Skin>...</e:Skin></e:skinName></e:Button>`——skinName 是属性的内联子节点写法，其子 Skin 的内容即按钮视觉。
10. **默认状态无宽高的居中图片**：`<e:Image source="btn_di_png" horizontalCenter="0" verticalCenter="0"/>`——需要图片自然尺寸（PNG 头 / 帧尺寸）参与布局求解。

## 五、对实现的约束

1. z-order 依赖子节点顺序 → fast-xml-parser 必须用 preserveOrder。
2. 组件识别用 namespace URI + localName，禁止前缀字符串匹配。
3. 不支持的节点保留原始 XML 信息与子树，记 unsupported，不静默丢弃。
