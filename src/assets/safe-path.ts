import fs from "node:fs";
import path from "node:path";

// 统一路径守卫（P0.1 加固）：所有外部输入的文件路径（HTTP 参数、res.json url、EXML source）
// 必须经此解析：规范化 + 越界检查 + 真实路径（符号链接）复核，结果必须严格落在允许根内。

/**
 * rel 解析后必须落在 root 内（含子目录）；root 本身不放行（只允许访问文件）。
 * 存在性校验：文件/目录不存在返回 null。
 */
export function safeResolveWithin(root: string, rel: string, opts: { requireExist?: boolean } = {}): string | null {
  const rootNorm = path.normalize(root);
  const resolved = path.normalize(path.resolve(rootNorm, rel));
  if (resolved === rootNorm || !resolved.startsWith(rootNorm + path.sep)) return null;
  if (opts.requireExist === false) return resolved;
  // 符号链接穿透防护：真实路径也必须落回 root 内（root 与目标都取 realpath，规避盘符大小写差异）
  try {
    const realRoot = path.normalize(fs.realpathSync(rootNorm));
    const real = path.normalize(fs.realpathSync(resolved));
    if (real === realRoot || !real.startsWith(realRoot + path.sep)) return null;
  } catch {
    return null; // 不存在或不可达
  }
  return resolved;
}
