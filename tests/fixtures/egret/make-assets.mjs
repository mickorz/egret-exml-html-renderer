// 测试 fixture 资源生成器：node tests/fixtures/egret/make-assets.mjs
// 生成 hero.png（8x8 红色）与 atlas.png（16x16，含两个 8x8 色块帧）+ atlas.json
// 最小 PNG 编码器（zlib 内置），无需任何依赖

import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const assetsDir = join(here, "resource", "assets");
mkdirSync(assetsDir, { recursive: true });

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = (crc ^ buf[i]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** RGBA 像素 -> PNG 文件 */
function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 4);
    raw[rowStart] = 0; // filter none
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function fillRect(rgba, w, x, y, rw, rh, r, g, b, a = 255) {
  for (let py = y; py < y + rh; py++) {
    for (let px = x; px < x + rw; px++) {
      const i = (py * w + px) * 4;
      rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = a;
    }
  }
}

// hero.png：8x8 纯红
{
  const rgba = Buffer.alloc(8 * 8 * 4);
  fillRect(rgba, 8, 0, 0, 8, 8, 220, 40, 40);
  writeFileSync(join(assetsDir, "hero.png"), encodePng(8, 8, rgba));
}

// panel.png：32x32 非对称九宫格样本（左 10 / 右 8 / 上 8 / 下 12，中心 14x12），四边异色便于实测边缘渲染
{
  const rgba = Buffer.alloc(32 * 32 * 4);
  fillRect(rgba, 32, 0, 0, 32, 32, 200, 200, 200); // 底灰
  fillRect(rgba, 32, 0, 0, 10, 32, 255, 0, 0); // 左 10 红
  fillRect(rgba, 32, 24, 0, 8, 32, 0, 0, 255); // 右 8 蓝（x=24..31，与 grid 右缘宽度一致）
  fillRect(rgba, 32, 0, 0, 32, 8, 0, 200, 0); // 上 8 绿
  fillRect(rgba, 32, 0, 20, 32, 12, 255, 255, 0); // 下 12 黄（y=20..31）
  writeFileSync(join(assetsDir, "panel.png"), encodePng(32, 32, rgba));
}

// atlas.png：16x16，两帧（frame_one 左上蓝 8x8，frame_two 右上绿 8x8，下半透明留白）
{
  const rgba = Buffer.alloc(16 * 16 * 4);
  fillRect(rgba, 16, 0, 0, 8, 8, 40, 80, 220);
  fillRect(rgba, 16, 8, 0, 8, 8, 40, 200, 80);
  writeFileSync(join(assetsDir, "atlas.png"), encodePng(16, 16, rgba));
}

// atlas.json：texture merger 帧表
writeFileSync(
  join(assetsDir, "atlas.json"),
  JSON.stringify({
    file: "atlas.png",
    frames: {
      frame_one_png: { x: 0, y: 0, w: 8, h: 8, offX: 0, offY: 0, sourceW: 8, sourceH: 8 },
      frame_two_png: { x: 8, y: 0, w: 8, h: 8, offX: 0, offY: 0, sourceW: 8, sourceH: 8 },
      frame_trim_png: { x: 0, y: 8, w: 4, h: 6, offX: 2, offY: 1, sourceW: 8, sourceH: 8 },
    },
  }, null, 2),
);

console.log("fixture 资源已生成:", assetsDir);
