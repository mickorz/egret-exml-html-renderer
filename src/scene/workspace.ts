import fs from "node:fs";
import path from "node:path";
import { EgretAssetResolver } from "../assets/egret-asset-resolver.js";
import { safeResolveWithin } from "../assets/safe-path.js";
import { buildExmlClassIndex, type ClassIndexEntry } from "./component-registry.js";
import { buildSceneFromFile, type SceneDocument } from "./scene-builder.js";
import type { ExmlDiagnostic } from "../parser/exml/exml-types.js";

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
  /** 类名索引（thm.json + EXML 全量扫描，P1-A；惰性构建一次，进程生命周期内复用） */
  private classIndex: Map<string, ClassIndexEntry> | null = null;
  private indexDiagnostics: ExmlDiagnostic[] = [];

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

  /** EXML 相对路径 -> 绝对路径；越界（路径穿越/符号链接穿透）返回 null */
  resolveExml(rel: string): string | null {
    const abs = safeResolveWithin(this.resourceDir, rel);
    if (!abs || !abs.toLowerCase().endsWith(".exml")) return null;
    return fs.existsSync(abs) ? abs : null;
  }

  /** 组件类名索引（thm.json 优先 + EXML 根 class 全量扫描；首次调用惰性构建） */
  getClassIndex(): Map<string, ClassIndexEntry> {
    if (!this.classIndex) {
      this.indexDiagnostics = [];
      this.classIndex = buildExmlClassIndex(this.resourceDir, this.listExmlFiles(), this.indexDiagnostics);
    }
    return this.classIndex;
  }

  /** 组件类名 -> EXML 文件（资源目录相对路径）；未登记返回 null（P1-B 展开/List itemRenderer 解析入口） */
  resolveSkinClass(cls: string): ClassIndexEntry | null {
    return this.getClassIndex().get(cls) ?? null;
  }

  /** 类名索引构建诊断（重复类名 / thm.json 异常） */
  getIndexDiagnostics(): ExmlDiagnostic[] {
    this.getClassIndex(); // 确保已构建
    return this.indexDiagnostics;
  }

  /** 构建场景树（每次重新解析，刷新即生效） */
  getScene(rel: string): SceneDocument | null {
    const abs = this.resolveExml(rel);
    if (!abs) return null;
    return buildSceneFromFile(abs, { resolver: this.resolver });
  }

  /** 供静态资源服务的路径守卫：资源目录内文件绝对路径，越界返回 null */
  resolveAsset(rel: string): string | null {
    const abs = safeResolveWithin(this.resourceDir, rel);
    return abs && fs.statSync(abs).isFile() ? abs : null;
  }
}
