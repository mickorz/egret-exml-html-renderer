# 快速开始

## 前置条件

- Node.js >= 20
- 一个 Egret 工程（其下有 `resource/` 目录、EXML 文件与 `*.res.json` 资源配置）

## 安装与启动

```bash
npm install
EGRET_PROJECT_ROOT=E:/path/to/YourEgretProject npm run serve
```

浏览器打开 <http://localhost:7789/>：左侧 EXML 文件列表，点击任意文件在右侧 iframe 预览渲染结果。

## 单文件渲染（不启服务）

```bash
npx tsx src/poc/render.ts E:/path/to/YourEgretProject/resource/eui_skins/Foo.exml --root E:/path/to/YourEgretProject --out demo
```

产物是自包含 HTML（资源用相对路径引用），可直接双击打开。

## 点击定位

预览页面点击任意节点，顶部信息栏显示该节点的 id / name / type / path / stableKey / 源文件；
URL 带 `&focus=<stableKey>` 打开时自动高亮并滚动到目标节点。

## 下一步

- 配置说明：`docs/configuration.md`
- 架构与开发：`docs/development.md`
- 测试：`docs/testing.md`
