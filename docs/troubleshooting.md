# 常见问题

## 服务启动报「缺少环境变量 EGRET_PROJECT_ROOT」

serve / mcp / render 都需要知道 Egret 工程根。设置环境变量，或 render 用 `--root` 参数。

## 页面图片全部裂开

1. 确认工程 `resource/` 下有 `default.res.json`（或其他 `*.res.json`）；
2. res.json 的 `url` 必须相对资源目录；
3. sheet 资源的 url 指向 atlas json（同目录需有同名 .png）。

解析失败的图片渲染为虚线占位框（title 显示原始 source），并在页面底部「未支持清单」上报——不会静默替换占位图。

## 渲染结果和游戏内不一致

P0 是静态近似，以下特性未实现（节点树里都有 unsupported 标记）：

- state 状态切换（`visible.state_xxx`、`includeIn`）——按默认状态渲染；
- HorizontalLayout / VerticalLayout / TileLayout 布局容器；
- List / Scroller / DataGroup 运行时行为（按占位容器渲染，子树保留）；
- 自定义组件（ns1:*/gdmj:* 前缀）不展开实现；
- 文本自适应宽度是 CSS 近似（行高按 字号x1.25+行距 估算）。

## 改了 EXML 页面没变化

`npm run serve` 用 tsx watch，服务端代码改动会重启；每请求重新解析 EXML，刷新页面即生效。
若改的是本仓库渲染代码而页面没变，确认服务进程重启时间晚于代码保存时间。

## MCP 无响应

1. 确认 `EGRET_PROJECT_ROOT` 已在 `.pi/mcp.json` 或环境变量中配置；
2. MCP 是 stdio 协议，日志走 stderr，不要往 stdin 写非 JSON 内容；
3. 用 `npm run check:mcp` 验证协议链路。
