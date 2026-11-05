import fs from "node:fs";
import path from "node:path";

// Egret 资源解析器（P0-D）：EXML source 引用 -> 真实图片文件/图集矩形
// Egret 资源索引以 default.res.json（及其他 *.res.json）为准，两类引用形式：
//   1. 直接图片名  source="poker_spades_png"   -> resources 中 name 匹配（type=image）
//   2. 图集子图    source="pdk_json.puke_da_di_png" -> sheet 资源 + 子键（帧矩形在 atlas json 内）
// 直接名找不到时回退查所有 sheet 的 subkeys（工程中大量图片只以子键形式存在）。

/** res.json 中单条资源记录 */
export interface ResJsonEntry {
  url: string;
  type: string;
  name: string;
  subkeys?: string;
}

/** 图集帧数据（Egret texture merger 格式） */
export interface AtlasFrame {
  x: number;
  y: number;
  w: number;
  h: number;
  offX: number;
  offY: number;
  sourceW: number;
  sourceH: number;
}

/** 解析结果：直接文件或图集帧 */
export type ResolvedAsset =
  | { kind: "file"; file: string; width?: number; height?: number }
  | { kind: "frame"; file: string; frame: AtlasFrame; sheetName: string };

/** 解析失败原因诊断 */
export interface AssetDiagnostic {
  source: string;
  exmlFile: string;
  reason: string;
}

export interface ResolveOptions {
  /** 触发解析的 EXML 文件（用于诊断归属） */
  exmlFile?: string;
}

/** 读取 PNG 尺寸（IHDR）：图集九宫格切片需要整图尺寸；非法 PNG 返回 null */
function pngSize(file: string): { width: number; height: number } | null {
  try {
    const buf = Buffer.alloc(24);
    const fd = fs.openSync(file, "r");
    fs.readSync(fd, buf, 0, 24, 0);
    fs.closeSync(fd);
    if (buf.readUInt32BE(0) !== 0x89504e47) return null;
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  } catch {
    return null;
  }
}

export class EgretAssetResolver {
  /** 资源目录（res.json 与 url 的基准目录，通常是 Egret 工程 resource/） */
  readonly resourceDir: string;
  /** name -> 资源记录 */
  private byName = new Map<string, ResJsonEntry>();
  /** 子键 -> 拥有该子键的 sheet 记录列表（一个子键理论只属一个图集，列表兜底重名） */
  private sheetBySubkey = new Map<string, ResJsonEntry[]>();
  /** atlas json 帧表缓存：atlasJson 绝对路径 -> (子键 -> 帧) */
  private atlasCache = new Map<string, Record<string, AtlasFrame>>();
  /** 整图尺寸缓存 */
  private sizeCache = new Map<string, { width: number; height: number } | null>();

  constructor(resourceDir: string) {
    this.resourceDir = path.normalize(resourceDir);
    this.loadResJsons();
  }

  /** 加载资源目录（含一级子目录）下全部 *.res.json */
  private loadResJsons(): void {
    const scan = (dir: string): void => {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) scan(full);
        else if (e.isFile() && e.name.endsWith(".res.json")) {
          try {
            const data = JSON.parse(fs.readFileSync(full, "utf8")) as { resources?: ResJsonEntry[] };
            for (const r of data.resources ?? []) {
              this.byName.set(r.name, r);
              if (r.type === "sheet" && r.subkeys) {
                for (const sub of r.subkeys.split(",")) {
                  const list = this.sheetBySubkey.get(sub) ?? [];
                  list.push(r);
                  this.sheetBySubkey.set(sub, list);
                }
              }
            }
          } catch (err) {
            throw new Error(`res.json 解析失败: ${full}: ${(err as Error).message}`);
          }
        }
      }
    };
    scan(this.resourceDir);
  }

  /** res.json 的 url -> 绝对路径（url 相对资源目录） */
  private fileOf(entry: ResJsonEntry): string {
    return path.join(this.resourceDir, entry.url);
  }

  /** 读取图集帧表（带缓存）；atlas json 不存在或格式不符返回 null */
  private atlasFrames(atlasJsonFile: string): Record<string, AtlasFrame> | null {
    const key = path.normalize(atlasJsonFile);
    if (this.atlasCache.has(key)) return this.atlasCache.get(key)!;
    let frames: Record<string, AtlasFrame> | null = null;
    try {
      const data = JSON.parse(fs.readFileSync(atlasJsonFile, "utf8"));
      if (data && typeof data.frames === "object") frames = data.frames;
    } catch {
      frames = null;
    }
    this.atlasCache.set(key, frames ?? {});
    return frames;
  }

  /** 整图尺寸（PNG IHDR；非 PNG 或读取失败返回 null） */
  imageSize(file: string): { width: number; height: number } | null {
    const key = path.normalize(file);
    if (this.sizeCache.has(key)) return this.sizeCache.get(key)!;
    const size = pngSize(file);
    this.sizeCache.set(key, size);
    return size;
  }

  /**
   * 解析 EXML source 引用。
   * 解析失败返回 null（调用方负责生成诊断，不允许静默替换占位图）。
   */
  resolve(source: string, opts: ResolveOptions = {}): ResolvedAsset | null {
    const src = source.trim();
    if (!src) return null;

    // 形式 1：sheet名.子键名（子键本身可能含点，只按首个点切分 sheet 名）
    const dot = src.indexOf(".");
    if (dot > 0) {
      const sheetName = src.slice(0, dot);
      const subkey = src.slice(dot + 1);
      const hit = this.resolveFrame(sheetName, subkey);
      if (hit) return hit;
    }

    // 形式 2：直接图片资源
    const direct = this.byName.get(src);
    if (direct && direct.type === "image") {
      const file = this.fileOf(direct);
      if (fs.existsSync(file)) return { kind: "file", file };
    }

    // 形式 3：回退查 sheet 子键
    const frameHit = this.resolveFrameBySubkey(src);
    if (frameHit) return frameHit;

    // 相对路径兜底：source 是相对 EXML 的路径（EUI 支持），仅允许落在资源目录内
    if (opts.exmlFile && (src.startsWith("./") || src.startsWith("../"))) {
      const abs = path.normalize(path.resolve(path.dirname(opts.exmlFile), src));
      if (abs.startsWith(this.resourceDir + path.sep) && fs.existsSync(abs)) {
        return { kind: "file", file: abs };
      }
    }
    return null;
  }

  /** 指定 sheet 名 + 子键 -> 帧资源 */
  private resolveFrame(sheetName: string, subkey: string): ResolvedAsset | null {
    const sheet = this.byName.get(sheetName);
    if (!sheet || sheet.type !== "sheet") return null;
    if (!sheet.subkeys?.split(",").includes(subkey)) return null;
    return this.frameOf(sheet, subkey);
  }

  /** 全部 sheet 的子键反查 */
  private resolveFrameBySubkey(subkey: string): ResolvedAsset | null {
    const sheets = this.sheetBySubkey.get(subkey);
    if (!sheets?.length) return null;
    return this.frameOf(sheets[0], subkey);
  }

  /** sheet 记录 + 子键 -> 帧资源（读取 atlas json 取帧矩形） */
  private frameOf(sheet: ResJsonEntry, subkey: string): ResolvedAsset | null {
    const atlasJson = this.fileOf(sheet); // sheet 的 url 指向 atlas json
    const frames = this.atlasFrames(atlasJson);
    const frame = frames?.[subkey];
    if (!frame) return null;
    const atlasPng = atlasJson.replace(/\.json$/i, ".png");
    if (!fs.existsSync(atlasPng)) return null;
    return { kind: "frame", file: atlasPng, frame, sheetName: sheet.name };
  }

  /** 解析失败时生成诊断信息（调用方收集展示） */
  diagnostic(source: string, exmlFile: string): AssetDiagnostic {
    let reason: string;
    if (!source.trim()) reason = "source 为空";
    else if (!this.byName.size) reason = "资源目录内未找到任何 res.json";
    else reason = "资源键不存在（不在 resources 名称与全部 sheet 子键中）";
    return { source, exmlFile, reason };
  }
}
