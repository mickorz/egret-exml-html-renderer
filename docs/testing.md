# 测试

## 命令

```bash
npm run check          # parser-check + render-check（解析链路 + 场景构建 + 渲染 HTML 断言）
npm run check:parser   # 仅解析层（Namespace / 属性保留 / 非法 XML / 归一化）
npm run check:render   # 场景树 + Scene JSON + HTML 内容断言 + 真实工程冒烟
npm run check:server   # 启动 fixture 工作区服务，断言路由 / 穿越防护 / 资源服务
npm run check:mcp      # 启动 MCP stdio 子进程，JSON-RPC 全流程四工具
```

## Fixtures

`tests/fixtures/egret/` 是最小 Egret 工程样本：

- `resource/default.res.json`（1 个直接图片 + 1 个图集 sheet）
- `resource/eui_skins/SampleSkin.exml`（Group/Image/Label/Rect/Button 内联皮肤/自定义组件/state 属性/缺失资源）
- `resource/eui_skins/LayoutSkin.exml`（百分比 / 边缘 / 居中布局）
- `resource/eui_skins/UnknownSkin.exml`（Scroller / 自定义组件占位）
- `make-assets.mjs`：用 node 内置 zlib 生成 fixture PNG（无二进制依赖，可随时重新生成）

## 真实工程冒烟

`render-check.ts` 在 `EGRET_PROJECT_ROOT`（缺省指向本机 GDMahjongMobile）存在时，
额外解析真实 EXML（BaseCard.exml），断言节点数、层级与 sheet 帧解析。工程不可用时自动跳过。

## 浏览器实机验收

字符串断言只能证明内容生成，不能证明浏览器渲染正确。九宫格 / 图集背景 / 居中约束等视觉链路
必须用浏览器实测 computed style 收尾（pi browser 工具 + `.agents/skills/browser-selftest`）。
