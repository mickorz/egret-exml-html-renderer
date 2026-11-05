# 架构与开发

## 数据流

```
EXML 文本
  └─ exml-parser.ts        fast-xml-parser preserveOrder（子节点数组 = z-order）
       └─ exml-normalizer.ts    namespace URI 归类 / w:* 剔除 / skinName 提升 / state 属性拆分
            └─ scene-builder.ts      类型映射 + 属性数值化 + 最小静态布局 + 资源挂载 + stableKey
                 ├─ scene-json.ts     Scene JSON（AI / MCP 消费）
                 └─ html-renderer.ts  分发到 nodes/<类型>-node.ts -> 静态 HTML
```

## 模块职责

| 模块 | 职责 | 禁止 |
| --- | --- | --- |
| `src/parser/exml/` | XML 语法层（Namespace / 属性 / 诊断） | 理解 EUI 语义 |
| `src/scene/` | EUI 语义层（类型映射 / 布局 / 资源挂载） | 生成 HTML |
| `src/assets/` | res.json 索引 / 图集帧 / PNG 尺寸 | 理解 EXML |
| `src/renderer/` | Scene Tree -> HTML（一类型一文件） | 解析 EXML |
| `src/server/` `src/mcp/` | 传输层（HTTP / stdio JSON-RPC） | 业务逻辑 |

## 最小静态布局（P0 策略）

构建期自上而下求解，父尺寸已知时：

1. 宽高：数值 > 百分比（按父折算）> left+right / top+bottom 边缘差 > 图片自然尺寸（PNG 头 / 帧尺寸）；
2. x/y：left/top 优先 > right/bottom 反推 > horizontalCenter/verticalCenter 数值解；
3. 自身尺寸未知时（文本自适应）：horizontalCenter/verticalCenter 标记 `_centerH/_centerV`，
   渲染期用 CSS `left:50% + translateX(calc(-50% + Npx))` 实现；
4. 约束无法求解时保留原值并写入节点 unsupported（不静默丢弃）。

完整 EUI Layout（Horizontal/Vertical/Tile）不在 P0 范围。

## 图集子图渲染

- 普通子图：`background-image` + `background-position: (offX-x)px (offY-y)px`，尺寸 `sourceW/sourceH`；
- 九宫格子图：border-image 用整张图集切片（slice = 帧起点与图集余量），`border-image-width` 用帧九宫分量，加 `fill` 关键字。

## 开发约定

- 渲染器节点文件一类型一文件（`src/renderer/nodes/`）；
- 中文注释；不支持特性必须进 unsupported（Scene JSON + 页面横幅双通道）；
- 路径参数必须过守卫；z-order 只依赖子节点数组顺序；
- 详细规范见 `CLAUDE.md`。
