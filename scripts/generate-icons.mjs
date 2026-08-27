/**
 * Generates the PWA icon set.
 *
 * The mark is drawn analytically (rounded square + the two heart strokes)
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

/**
 * The same two curves the Logo component draws, in the same 32x32 space.
 *
 * Duplicated as control points rather than parsed from the component: this
 * script runs in Node with no DOM, and a path parser would be more code than
 * the numbers it reads. They are checked against the component by eye when the
 * mark changes, which is rare.
 */
const LEFT_CURVE = [
  [[16, 27], [8, 20.5], [4, 15.5], [4, 11.8]],
  [[4, 11.8], [4, 8.2], [6.8, 6], [9.6, 6]],
  [[9.6, 6], [12.3, 6], [15, 7.8], [17.2, 11.2]],
];

const RIGHT_CURVE = [
  [[16, 27], [24, 20.5], [28, 15.5], [28, 11.8]],
  [[28, 11.8], [28, 8.2], [25.2, 6], [22.4, 6]],
  [[22.4, 6], [19.7, 6], [17, 7.8], [14.8, 11.2]],
];

/** Cubic bezier sampled into a polyline, in icon pixels. */
function samplePath(segments, scale, offset, steps = 48) {
  const points = [];

  for (const [p0, p1, p2, p3] of segments) {
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const u = 1 - t;
      const x =
        u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0];
      const y =
        u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1];
      points.push([x * scale + offset, y * scale + offset]);
    }
  }

  return points;
}

/** Squared distance from a point to a segment. */
function segmentDistanceSq(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return (px - cx) * (px - cx) + (py - cy) * (py - cy);
}

/**
 * Coverage of a round-capped stroke.
 *
 * Distance to the polyline gives the round caps and joins for free, which is
 * exactly what strokeLinecap="round" does in the SVG.
 */
function strokeCoverage(x, y, points, halfWidth) {
  const limitSq = halfWidth * halfWidth;

  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    if (segmentDistanceSq(x, y, a[0], a[1], b[0], b[1]) <= limitSq) return 1;
  }

  return 0;
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

  // The mark lives on cream, not ink: the left half of the heart is dark, and
  // on a dark tile it would vanish. The old mark could sit on ink because it
  // was drawn in rose and cream only.
  const scale = inner / 32;
  const left = samplePath(LEFT_CURVE, scale, inset);
  const right = samplePath(RIGHT_CURVE, scale, inset);
  const halfWidth = (3.2 / 2) * scale;

  const SAMPLES = 3;
  const step = 1 / (SAMPLES + 1);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4;

      let bg = 0;
      let leftStroke = 0;
      let rightStroke = 0;

      for (let sy = 1; sy <= SAMPLES; sy += 1) {
        for (let sx = 1; sx <= SAMPLES; sx += 1) {
          const px = x + sx * step;
          const py = y + sy * step;

          bg += roundedRectCoverage(px, py, size, 0.22, inset);
          leftStroke += strokeCoverage(px, py, left, halfWidth);
          rightStroke += strokeCoverage(px, py, right, halfWidth);
        }
      }

      const total = SAMPLES * SAMPLES;
      if (bg > 0) blend(rgba, offset, CREAM, bg / total);
      // Rose last so the crossing reads the same way as in the SVG, where the
      // right half is painted over the left.
      if (leftStroke > 0) blend(rgba, offset, INK, leftStroke / total);
      if (rightStroke > 0) blend(rgba, offset, ROSE, rightStroke / total);
    }
  }

  return encodePng(size, size, rgba);
}


const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
  <rect width="32" height="32" rx="7" fill="#fbf8f4"/>
  <path d="M16 27 C 8 20.5, 4 15.5, 4 11.8 C 4 8.2, 6.8 6, 9.6 6 C 12.3 6, 15 7.8, 17.2 11.2" stroke="#1f2937" stroke-width="3.2" stroke-linecap="round" fill="none"/>
  <path d="M16 27 C 24 20.5, 28 15.5, 28 11.8 C 28 8.2, 25.2 6, 22.4 6 C 19.7 6, 17 7.8, 14.8 11.2" stroke="#e4576e" stroke-width="3.2" stroke-linecap="round" fill="none"/>
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
