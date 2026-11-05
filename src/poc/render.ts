import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { EgretWorkspace } from "../scene/workspace.js";
import { renderHtml } from "../renderer/html-renderer.js";

// POC 渲染入口：npx tsx src/poc/render.ts <EXML路径> [--root <工程根>]
// 工程根缺省取环境变量 EGRET_PROJECT_ROOT

const [, , exmlArg] = process.argv;
const rootIdx = process.argv.indexOf("--root");
const rootArg = rootIdx >= 0 ? process.argv[rootIdx + 1] : undefined;
const outIdx = process.argv.indexOf("--out");
const outArg = outIdx >= 0 ? process.argv[outIdx + 1] : "demo";

if (!exmlArg) {
  console.error("用法: npm run render -- <EXML文件路径> [--root <Egret工程根>] [--out <输出目录，默认 demo>]");
  process.exit(1);
}
const root = rootArg ?? process.env.EGRET_PROJECT_ROOT;
if (!root) {
  console.error("缺少工程根：--root 参数或环境变量 EGRET_PROJECT_ROOT");
  process.exit(1);
}

const ws = new EgretWorkspace({ rootDir: root });
const exmlFile = path.resolve(exmlArg);
const rel = path.relative(ws.resourceDir, exmlFile).split(path.sep).join("/");
const scene = ws.getScene(rel);
if (!scene) {
  console.error(`EXML 不存在或不在资源目录内: ${exmlFile}（资源目录: ${ws.resourceDir}）`);
  process.exit(1);
}

const outDir = path.resolve(outArg);
const html = renderHtml(scene, {
  scene,
  resolver: ws.resolver,
  toAssetUrl: (abs) => path.relative(outDir, abs).split(path.sep).join("/"),
});

mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, path.basename(exmlFile, ".exml") + ".html");
writeFileSync(outFile, html, "utf8");
const unsupported = JSON.stringify(html.match(/未支持 \d+ 项/)?.[0] ?? "未支持 0 项");
console.log(`已生成: ${outFile}（${unsupported}）`);
