import fs from "node:fs";
import path from "node:path";
import { EgretAssetResolver } from "../assets/egret-asset-resolver.js";
import { buildSceneFromFile, type SceneDocument } from "./scene-builder.js";

// Egret 工作区（P0-F）：工程信息 + EXML 枚举 + Scene 构建入口
// HTTP 服务（src/server）与 MCP（src/mcp）共用，保证两者数据一致。

export interface EgretWorkspaceOptions {
  /** Egret 工程根目录（其下应有 resource/ 资源目录） */
  rootDir: string;
  /** 资源目录名（默认 resource） */
  resourceDirName?: string;
}

export class EgretWorkspace {
  readonly rootDir: string;
  readonly resourceDir: string;
  readonly resolver: EgretAssetResolver;

  constructor(opts: EgretWorkspaceOptions) {
    this.rootDir = path.resolve(opts.rootDir);
    this.resourceDir = path.join(this.rootDir, opts.resourceDirName ?? "resource");
    if (!fs.existsSync(this.resourceDir)) {
      throw new Error(`资源目录不存在: ${this.resourceDir}（工程根: ${this.rootDir}）`);
    }
    this.resolver = new EgretAssetResolver(this.resourceDir);
  }

  /** 工程信息 */
  getProjectInfo(): { root: string; resourceDir: string; exmlCount: number } {
    return {
      root: path.basename(this.rootDir),
      resourceDir: path.basename(this.resourceDir),
      exmlCount: this.listExmlFiles().length,
    };
  }

  /** 枚举资源目录下全部 EXML（相对资源目录的路径，/ 分隔） */
  listExmlFiles(): { file: string; name: string }[] {
    const out: { file: string; name: string }[] = [];
    const walk = (dir: string): void => {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (e.isFile() && e.name.toLowerCase().endsWith(".exml")) {
          out.push({
            file: path.relative(this.resourceDir, full).split(path.sep).join("/"),
            name: e.name,
          });
        }
      }
    };
    walk(this.resourceDir);
    return out.sort((a, b) => a.file.localeCompare(b.file));
  }

  /** EXML 相对路径 -> 绝对路径；越界（路径穿越）返回 null */
  resolveExml(rel: string): string | null {
    const abs = path.normalize(path.resolve(this.resourceDir, rel));
    if (!abs.startsWith(this.resourceDir + path.sep)) return null;
    if (!abs.toLowerCase().endsWith(".exml")) return null;
    return fs.existsSync(abs) ? abs : null;
  }

  /** 构建场景树（每次重新解析，刷新即生效） */
  getScene(rel: string): SceneDocument | null {
    const abs = this.resolveExml(rel);
    if (!abs) return null;
    return buildSceneFromFile(abs, { resolver: this.resolver });
  }

  /** 供静态资源服务的路径守卫：资源目录内文件绝对路径，越界返回 null */
  resolveAsset(rel: string): string | null {
    const abs = path.normalize(path.resolve(this.resourceDir, rel));
    if (!abs.startsWith(this.resourceDir + path.sep)) return null;
    return fs.existsSync(abs) && fs.statSync(abs).isFile() ? abs : null;
  }
}
