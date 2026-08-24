/**
 * Generates the PWA icon set.
 *
 * The mark is drawn analytically (rounded square + two rings + a leaf shape)
 * and encoded straight to PNG with node:zlib, so the project needs no native
 * image dependency and the icons are reproducible from source.
 *
 * Run: node scripts/generate-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT_DIR = join(process.cwd(), 'public', 'icons');

const INK = [16, 24, 40];
const ROSE = [228, 87, 110];
const ROSE_SOFT = [242, 122, 142];
const CREAM = [251, 248, 244];

/* -------------------------------------------------------------------------- */
/* PNG encoding                                                                */
/* -------------------------------------------------------------------------- */

function crc32(buffer) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let i = 0; i < 256; i += 1) {
      let c = i;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[i] = c;
    }
  }
  let crc = -1;
  for (const byte of buffer) crc = (crc >>> 8) ^ table[(crc ^ byte) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

/** RGBA pixel buffer -> PNG file buffer. */
function encodePng(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: RGBA
  header[10] = 0; // deflate
  header[11] = 0; // adaptive filtering
  header[12] = 0; // no interlace

  // Each scanline is prefixed with filter type 0 (None).
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0;
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* -------------------------------------------------------------------------- */
/* Drawing                                                                     */
/* -------------------------------------------------------------------------- */

/** Signed-distance helpers, sampled 3x3 per pixel for smooth edges. */
function roundedRectCoverage(x, y, size, radiusRatio, inset) {
  const half = size / 2;
  const r = size * radiusRatio;
  const px = Math.abs(x - half) - (half - inset - r);
  const py = Math.abs(y - half) - (half - inset - r);
  const outside = Math.hypot(Math.max(px, 0), Math.max(py, 0)) - r;
  return outside <= 0 ? 1 : 0;
}

function ringCoverage(x, y, cx, cy, radius, thickness) {
  const distance = Math.abs(Math.hypot(x - cx, y - cy) - radius);
  return distance <= thickness / 2 ? 1 : 0;
}

function leafCoverage(x, y, cx, cy, width, height) {
  const nx = (x - cx) / width;
  const ny = (y - cy) / height;
  // Vesica-like shape: intersection of two offset circles.
  const a = Math.hypot(nx + 0.5, ny) <= 1;
  const b = Math.hypot(nx - 0.5, ny) <= 1;
  return a && b ? 1 : 0;
}

function blend(dst, offset, color, alpha) {
  for (let c = 0; c < 3; c += 1) {
    dst[offset + c] = Math.round(dst[offset + c] * (1 - alpha) + color[c] * alpha);
  }
  dst[offset + 3] = Math.round(dst[offset + 3] * (1 - alpha) + 255 * alpha);
}

/**
 * @param size    icon edge in pixels
 * @param padding fraction of the edge kept clear (maskable icons need ~10%)
 */
function drawIcon(size, padding = 0) {
  const rgba = Buffer.alloc(size * size * 4, 0);
  const inset = size * padding;
  const inner = size - inset * 2;
  const cx = size / 2;
  const cy = size / 2;

  const ringRadius = inner * 0.205;
  const ringThickness = Math.max(2, inner * 0.068);
  const ringOffset = inner * 0.11;

  const SAMPLES = 3;
  const step = 1 / (SAMPLES + 1);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4;

      let bg = 0;
      let leftRing = 0;
      let rightRing = 0;
      let leaf = 0;

      for (let sy = 1; sy <= SAMPLES; sy += 1) {
        for (let sx = 1; sx <= SAMPLES; sx += 1) {
          const px = x + sx * step;
          const py = y + sy * step;

          bg += roundedRectCoverage(px, py, size, 0.22, inset);
          leftRing += ringCoverage(px, py, cx - ringOffset, cy, ringRadius, ringThickness);
          rightRing += ringCoverage(px, py, cx + ringOffset, cy, ringRadius, ringThickness);
          leaf += leafCoverage(px, py, cx, cy, inner * 0.115, inner * 0.2);
        }
      }

      const total = SAMPLES * SAMPLES;
      if (bg > 0) blend(rgba, offset, INK, bg / total);
      if (leftRing > 0) blend(rgba, offset, ROSE_SOFT, leftRing / total);
      if (rightRing > 0) blend(rgba, offset, CREAM, rightRing / total);
      if (leaf > 0) blend(rgba, offset, ROSE, leaf / total);
    }
  }

  return encodePng(size, size, rgba);
}

/* -------------------------------------------------------------------------- */

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
  <rect width="32" height="32" rx="7" fill="#101828"/>
  <circle cx="12.5" cy="16" r="6.5" stroke="#f27a8e" stroke-width="2.2" fill="none"/>
  <circle cx="19.5" cy="16" r="6.5" stroke="#fbf8f4" stroke-width="2.2" fill="none"/>
  <path d="M16 11.2c1.2 1.3 1.9 2.9 1.9 4.8s-.7 3.5-1.9 4.8c-1.2-1.3-1.9-2.9-1.9-4.8s.7-3.5 1.9-4.8Z" fill="#e4576e"/>
</svg>
`;

mkdirSync(OUT_DIR, { recursive: true });

writeFileSync(join(OUT_DIR, 'icon.svg'), SVG);

const outputs = [
  ['icon-192.png', 192, 0],
  ['icon-512.png', 512, 0],
  ['apple-touch-icon.png', 180, 0.06],
  ['maskable-192.png', 192, 0.1],
  ['maskable-512.png', 512, 0.1],
];

for (const [name, size, padding] of outputs) {
  const png = drawIcon(size, padding);
  writeFileSync(join(OUT_DIR, name), png);
  console.log(`${name.padEnd(24)} ${size}x${size}  ${(png.length / 1024).toFixed(1)} KB`);
}

console.log('icon.svg                 vector');
