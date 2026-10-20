// Draws the extension icon (a 3×3 grid in the pillar colors) and writes
// public/icons/icon{16,48,128}.png. No dependencies: a tiny PNG encoder.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const BG = '#17181c';
const CENTER = '#ffffff';
const COLORS = ['#F4A236', '#F2D543', '#E8609F', '#7CC46A', CENTER, '#F3B3CE', '#8DB4E8', '#C6DA58', '#5EC4B9'];
const SS = 4; // supersampling factor for smooth edges

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

function inRoundRect(px, py, x0, y0, x1, y1, r) {
  const dx = Math.max(x0 + r - px, 0, px - (x1 - r));
  const dy = Math.max(y0 + r - py, 0, py - (y1 - r));
  return px >= x0 && px <= x1 && py >= y0 && py <= y1 && dx * dx + dy * dy <= r * r;
}

function draw(size) {
  const n = size * SS;
  const px = new Float64Array(size * size * 4);
  const pad = n * 0.16;
  const gap = n * 0.045;
  const cell = (n - 2 * pad - 2 * gap) / 3;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      let color = null;
      if (inRoundRect(x + 0.5, y + 0.5, 0, 0, n, n, n * 0.22)) {
        color = BG;
        const col = Math.floor((x - pad) / (cell + gap));
        const row = Math.floor((y - pad) / (cell + gap));
        if (col >= 0 && col < 3 && row >= 0 && row < 3) {
          const x0 = pad + col * (cell + gap);
          const y0 = pad + row * (cell + gap);
          if (inRoundRect(x + 0.5, y + 0.5, x0, y0, x0 + cell, y0 + cell, cell * 0.22)) color = COLORS[row * 3 + col];
        }
      }
      const i = (Math.floor(y / SS) * size + Math.floor(x / SS)) * 4;
      if (color) {
        const [r, g, b] = rgb(color);
        px[i] += r;
        px[i + 1] += g;
        px[i + 2] += b;
        px[i + 3] += 255;
      }
    }
  }
  const out = Buffer.alloc(size * size * 4);
  const samples = SS * SS;
  for (let i = 0; i < size * size; i++) {
    const a = px[i * 4 + 3] / samples;
    // Average color over covered samples only (un-premultiply).
    const cover = px[i * 4 + 3] / 255 || 1;
    out[i * 4] = Math.round(px[i * 4] / cover);
    out[i * 4 + 1] = Math.round(px[i * 4 + 1] / cover);
    out[i * 4 + 2] = Math.round(px[i * 4 + 2] / cover);
    out[i * 4 + 3] = Math.round(a);
  }
  return out;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('public/icons', { recursive: true });
for (const size of [16, 48, 128]) {
  writeFileSync(`public/icons/icon${size}.png`, png(size, draw(size)));
  console.log(`public/icons/icon${size}.png`);
}
