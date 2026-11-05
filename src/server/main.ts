import path from "node:path";
import { createApp } from "./server.js";

// 只读工作区服务启动入口：npm run serve
// 工程根：环境变量 EGRET_PROJECT_ROOT；端口：PORT，默认 7789

const root = process.env.EGRET_PROJECT_ROOT;
if (!root) {
  console.error("缺少环境变量 EGRET_PROJECT_ROOT（Egret 工程根目录，其下应有 resource/）");
  process.exit(1);
}
const port = Number(process.env.PORT ?? 7789);

createApp({ rootDir: path.resolve(root) }).listen(port, () => {
  console.log(`Egret EXML 工作区已启动: http://localhost:${port}/  (工程根: ${path.resolve(root)})`);
});
