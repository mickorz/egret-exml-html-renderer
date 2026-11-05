# CLAUDE.md

本仓库（egret-exml-html-renderer）的开发过程文档管理规范。

## 开发文档目录：`dev-docs/`

`dev-docs/` 是本仓库专门保存开发过程文档的目录（纳入 git 管理，过程文档与代码同仓库追溯）。

> 边界：仓库根 `docs/` 是**读者向**文档（随项目分发、README 链接引用）；
> `dev-docs/` 只服务开发过程，两者不混放。

### 规则

1. **所有开发过程文档必须放在 `dev-docs/` 目录下**，不要散落在仓库根目录或其他位置。
2. **新建文档时先判断类型**，放入对应类型的子文件夹；子文件夹不存在时按需创建。
3. 子文件夹按文档类型分类，命名使用小写英文和连字符（kebab-case）：

   | 类型 | 子文件夹 | 说明 |
   |------|----------|------|
   | 设计方案 | `dev-docs/design/` | 架构设计、技术方案、接口设计 |
   | 调研笔记 | `dev-docs/research/` | 技术调研、选型对比、EXML 格式调研 |
   | 问题排查 | `dev-docs/troubleshooting/` | Bug 分析、故障排查、复盘 |
   | 任务计划 | `dev-docs/planning/` | 任务拆解、进度计划、里程碑 |
   | 执行进度 | `dev-docs/progress/` | 阶段性进度总结、里程碑状态 |
   | 执行报告 | `dev-docs/progress-result/` | 阶段完整执行报告、验收结果 |
   | 使用指南 | `dev-docs/guides/` | 操作手册、环境搭建、工作流说明 |
   | 经验沉淀 | `dev-docs/experience/` | 踩坑记录、问题解决方案、经验教训 |

4. 若现有分类不适用，可新建类型子文件夹，但需保持命名风格一致，并在本文件表格中补充登记。
5. 文档统一使用 Markdown 格式，文件名应能体现内容。

## 进度文件夹：`dev-docs/progress/` 与报告文件夹：`dev-docs/progress-result/`

1. **阶段完成必须记录**：每完成一个阶段/里程碑，必须更新进度文档，不得只提交代码不更新进度。
2. **双文件夹同步更新**：每次执行完一个里程碑，除更新 `dev-docs/progress/` 外，还必须同步更新 `dev-docs/progress-result/` 中的对应阶段执行报告。
3. **每阶段独立报告文件**：阶段报告按阶段命名（`P0-执行报告.md`、`P1-执行报告.md`...），新阶段内容写入新文件，禁止向其他阶段报告追加。
4. **进度文档要求维护到位**：更新 `dev-docs/progress/执行进度.md` 的里程碑状态表。
5. **进行中也要反映**：阶段启动、中途重要节点都应同步到进度文档。

## 经验文件夹：`dev-docs/experience/`

1. **遇到坑必须记录**：问题现象 → 排查过程 → 根因 → 解决方案 → 预防/注意事项，一篇一个问题。
2. **解决问题前先查经验**：先到 `dev-docs/experience/` 查找类似问题。

## EXML/EUI 解析参考规范

遇到 EXML 属性语义不确定时（如 `ellipseWidth` 的直径/半径语义、`fillMode` 行为、
`horizontalCenter` 计算规则），优先查 Egret Engine 源码（`egret` / `eui` 模块）与官方 API 文档确认行为后再写代码，不要靠猜测。

## 渲染器实现硬性规则（沿袭 fairygui-html-renderer 踩坑沉淀）

1. **双引号 HTML 属性内禁用双引号**：拼进 `style="..."`、`src="..."` 的值内嵌引号必须换形（CSS url 用单引号）。
2. **字符串断言不能证明 HTML 合法**：border-image/clip-path 等复杂视觉链路必须配浏览器 computed style 实测收尾。
3. **九宫格 border-image 必须加 fill 关键字**：CSS border-image-slice 默认不画中心，EUI scale9Grid 画中心。
4. **渲染器节点文件一类型一文件**：`src/renderer/nodes/` 每种节点类型一个独立渲染文件，禁止多类型共用。
5. **不支持的特性必须明确上报**：unsupported 清单进 Scene JSON 与页面底部横幅，不允许静默忽略伪装成完整支持。
6. **改代码不生效先查进程**：长驻服务一律 tsx watch；排查"改了没变化"先确认进程启动时间。
7. **路径参数必须过守卫**：所有文件路径参数经 safeResolve 类守卫，解析结果必须落在资源目录内（防路径穿越）。
8. **z-order 只依赖子节点数组顺序**：XML 解析用 fast-xml-parser preserveOrder 模式，不依赖 JSON 对象属性键顺序。

## 看图与视觉验证

模型不能直接看截图。需要看图验证渲染效果时：
`browser_save_artifact` 截图存文件 -> `zai_mcp_server_analyze_image` 传入截图路径 + 具体视觉断言提问。
截图前先刷新页面（tsx watch 重启后浏览器仍持有旧 HTML）。
