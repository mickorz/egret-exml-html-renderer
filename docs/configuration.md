# 配置

## 环境变量

| 变量 | 用于 | 说明 | 缺省 |
| --- | --- | --- | --- |
| `EGRET_PROJECT_ROOT` | serve / mcp / render | Egret 工程根目录（其下应有 `resource/`） | 无（必填，缺失时报错退出） |
| `PORT` | serve | HTTP 服务端口 | 7789 |
| `CHROME_PATH` | mcp 截图 | chrome.exe 路径（找不到时自动探测常见安装位置） | 自动探测 |

## 资源目录约定

`EgretWorkspace` 默认在工程根下找 `resource/` 目录作为资源根：

- EXML 枚举范围：资源根下全部 `**/*.exml`；
- `*.res.json` 加载范围：资源根（含一级子目录）全部文件；
- res.json 中 `url` 相对资源根解析；
- 所有 HTTP 路径参数（`/api/scene?file=`、`/api/assets/*`）经守卫限制在资源根内，越界返回 404。

## API 路由

| 路由 | 作用 |
| --- | --- |
| `GET /` | 工作区页面 |
| `GET /api/project` | 工程信息（根目录名 / EXML 数量） |
| `GET /api/exml` | EXML 文件清单 |
| `GET /api/scene?file=<相对资源根路径>` | Scene JSON |
| `GET /view?file=<...>&bare=1&focus=<stableKey>` | HTML 预览（bare 纯净模式 / focus 定位高亮） |
| `GET /api/assets/<相对资源根路径>` | 图片/图集静态服务 |
| `GET /api/ui-assets?class=&file=&component=` | 全工程 UI 资产索引检索（三层元数据，条件 AND 组合） |
| `GET /api/ui-assets/usage?class=<类名>` | 反查组件类被哪些 EXML 引用 |
| `GET /api/component-graph` | 组件关系图谱全图（节点/边/环/枢纽/统计） |
| `GET /api/component-graph?class=<类名>` | 单类邻域（直接引用了谁、被谁引用、是否在环中） |
| `GET /api/scene-diff?fileA=<路径>&fileB=<路径>` | 两份 EXML 结构 diff（新增/删除/跨父移动/属性级变化） |
