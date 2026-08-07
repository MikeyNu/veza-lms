/**
 * Generates the Veza PNG/ICO brand assets consumed by both apps.
 *
 * Sources are the master artwork in assets/ — previously this script crop-
 * scraped them out of "Brand CI.png" (a flattened board screenshot) and scaled
 * with a nearest-neighbour sampler, which produced blocky, off-colour icons.
 * The masters are clean RGBA, so we key nothing and box-filter on the way down.
 *
 * Pure Node: no image dependencies, just zlib.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const ROOT = path.resolve(import.meta.dirname, "..");
const ASSETS = path.join(ROOT, "assets");
const WEB_PUBLIC = path.join(ROOT, "apps", "web", "public");
const CONTROL_PUBLIC = path.join(ROOT, "apps", "control-plane", "public");

const SYMBOL = path.join(ASSETS, "veza_symbol_only.png");
const LOGO_WHITE = path.join(ASSETS, "veza_logo_white_text_horizontal.png");
const LOGO_DARK = path.join(ASSETS, "veza_logo_black_text_horizontal.png");

/** Slate 900 — the Brand CI icon-mark tile. */
const TILE = [15, 23, 42];

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function decodePng(file) {
  const input = fs.readFileSync(file);
  if (!input.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error(`${file} is not a PNG file`);

  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const compressed = [];

  while (offset < input.length) {
    const length = input.readUInt32BE(offset);
    const type = input.toString("ascii", offset + 4, offset + 8);
    const data = input.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const bitDepth = data[8];
      colorType = data[9];
      const interlace = data[12];
      if (bitDepth !== 8 || ![2, 6].includes(colorType) || interlace !== 0) {
        throw new Error(`Unsupported PNG in ${file}: depth ${bitDepth}, colour type ${colorType}, interlace ${interlace}`);
      }
    } else if (type === "IDAT") compressed.push(data);
    else if (type === "IEND") break;
  }

  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const raw = zlib.inflateSync(Buffer.concat(compressed));
  const pixels = Buffer.alloc(width * height * 4);
  let sourceOffset = 0;
  let previous = Buffer.alloc(stride);

  const paeth = (a, b, c) => {
    const estimate = a + b - c;
    const pa = Math.abs(estimate - a);
    const pb = Math.abs(estimate - b);
    const pc = Math.abs(estimate - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };

  for (let y = 0; y < height; y += 1) {
    const filter = raw[sourceOffset++];
    const scanline = Buffer.from(raw.subarray(sourceOffset, sourceOffset + stride));
    sourceOffset += stride;
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? scanline[x - channels] : 0;
      const up = previous[x] ?? 0;
      const upperLeft = x >= channels ? previous[x - channels] : 0;
      if (filter === 1) scanline[x] = (scanline[x] + left) & 255;
      else if (filter === 2) scanline[x] = (scanline[x] + up) & 255;
      else if (filter === 3) scanline[x] = (scanline[x] + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) scanline[x] = (scanline[x] + paeth(left, up, upperLeft)) & 255;
      else if (filter !== 0) throw new Error(`Unsupported PNG filter ${filter}`);
    }
    for (let x = 0; x < width; x += 1) {
      const src = x * channels;
      const dst = (y * width + x) * 4;
      pixels[dst] = scanline[src];
      pixels[dst + 1] = scanline[src + 1];
      pixels[dst + 2] = scanline[src + 2];
      pixels[dst + 3] = channels === 4 ? scanline[src + 3] : 255;
    }
    previous = scanline;
  }
  return { width, height, pixels };
}

function encodePng(image) {
  const scanlines = Buffer.alloc((image.width * 4 + 1) * image.height);
  for (let y = 0; y < image.height; y += 1) {
    const row = y * (image.width * 4 + 1);
    scanlines[row] = 0;
    image.pixels.copy(scanlines, row + 1, y * image.width * 4, (y + 1) * image.width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(image.width, 0);
  ihdr.writeUInt32BE(image.height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(scanlines, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Crop to the opaque bounding box, ignoring near-transparent compression dust. */
function trim(image, threshold = 40) {
  let minX = image.width;
  let minY = image.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (image.pixels[(y * image.width + x) * 4 + 3] > threshold) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX) return image;
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const src = ((minY + y) * image.width + minX) * 4;
    image.pixels.copy(pixels, y * width * 4, src, src + width * 4);
  }
  return { width, height, pixels };
}

/**
 * Area-average resample. Alpha is premultiplied for the duration so that
 * transparent pixels cannot bleed their (arbitrary) RGB into the edges.
 */
function resize(image, targetWidth, targetHeight = Math.max(1, Math.round((image.height / image.width) * targetWidth))) {
  const out = Buffer.alloc(targetWidth * targetHeight * 4);
  const scaleX = image.width / targetWidth;
  const scaleY = image.height / targetHeight;

  for (let y = 0; y < targetHeight; y += 1) {
    const y0 = y * scaleY;
    const y1 = (y + 1) * scaleY;
    const startY = Math.floor(y0);
    const endY = Math.min(image.height, Math.ceil(y1));

    for (let x = 0; x < targetWidth; x += 1) {
      const x0 = x * scaleX;
      const x1 = (x + 1) * scaleX;
      const startX = Math.floor(x0);
      const endX = Math.min(image.width, Math.ceil(x1));

      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let weight = 0;

      for (let sy = startY; sy < endY; sy += 1) {
        const coverY = Math.min(y1, sy + 1) - Math.max(y0, sy);
        if (coverY <= 0) continue;
        for (let sx = startX; sx < endX; sx += 1) {
          const coverX = Math.min(x1, sx + 1) - Math.max(x0, sx);
          if (coverX <= 0) continue;
          const w = coverX * coverY;
          const src = (sy * image.width + sx) * 4;
          const alpha = image.pixels[src + 3] / 255;
          r += image.pixels[src] * alpha * w;
          g += image.pixels[src + 1] * alpha * w;
          b += image.pixels[src + 2] * alpha * w;
          a += image.pixels[src + 3] * w;
          weight += w;
        }
      }

      const dst = (y * targetWidth + x) * 4;
      if (weight === 0) continue;
      const alpha = a / weight;
      const unpremultiply = alpha > 0 ? 255 / alpha : 0;
      out[dst] = Math.max(0, Math.min(255, Math.round((r / weight) * unpremultiply)));
      out[dst + 1] = Math.max(0, Math.min(255, Math.round((g / weight) * unpremultiply)));
      out[dst + 2] = Math.max(0, Math.min(255, Math.round((b / weight) * unpremultiply)));
      out[dst + 3] = Math.max(0, Math.min(255, Math.round(alpha)));
    }
  }
  return { width: targetWidth, height: targetHeight, pixels: out };
}

/** Rounded-rectangle coverage mask, supersampled 4x for clean corners. */
function roundedMask(size, radiusRatio) {
  const radius = size * radiusRatio;
  const mask = new Float64Array(size * size);
  const samples = 4;
  const step = 1 / samples;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let hits = 0;
      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const px = x + (sx + 0.5) * step;
          const py = y + (sy + 0.5) * step;
          const dx = Math.max(radius - px, 0, px - (size - radius));
          const dy = Math.max(radius - py, 0, py - (size - radius));
          if (dx * dx + dy * dy <= radius * radius) hits += 1;
        }
      }
      mask[y * size + x] = hits / (samples * samples);
    }
  }
  return mask;
}

/** Dark rounded tile with the gradient mark centred on it (Brand CI 01). */
function appIcon(mark, size, { padding = 0.16, rounded = true } = {}) {
  const pixels = Buffer.alloc(size * size * 4);
  const mask = rounded ? roundedMask(size, 0.2237) : null;

  for (let i = 0; i < size * size; i += 1) {
    const coverage = mask ? mask[i] : 1;
    pixels[i * 4] = TILE[0];
    pixels[i * 4 + 1] = TILE[1];
    pixels[i * 4 + 2] = TILE[2];
    pixels[i * 4 + 3] = Math.round(coverage * 255);
  }

  const box = size * (1 - 2 * padding);
  const scale = Math.min(box / mark.width, box / mark.height);
  const scaled = resize(mark, Math.max(1, Math.round(mark.width * scale)), Math.max(1, Math.round(mark.height * scale)));
  const offsetX = Math.round((size - scaled.width) / 2);
  // The V's visual mass sits high; nudge up slightly so it reads centred.
  const offsetY = Math.round((size - scaled.height) / 2 - size * 0.012);

  for (let y = 0; y < scaled.height; y += 1) {
    const ty = offsetY + y;
    if (ty < 0 || ty >= size) continue;
    for (let x = 0; x < scaled.width; x += 1) {
      const tx = offsetX + x;
      if (tx < 0 || tx >= size) continue;
      const src = (y * scaled.width + x) * 4;
      const dst = (ty * size + tx) * 4;
      const alpha = scaled.pixels[src + 3] / 255;
      if (alpha <= 0) continue;
      for (let c = 0; c < 3; c += 1) {
        pixels[dst + c] = Math.round(scaled.pixels[src + c] * alpha + pixels[dst + c] * (1 - alpha));
      }
      // Keep the tile silhouette: the mark never punches outside the mask.
      pixels[dst + 3] = Math.max(pixels[dst + 3], Math.round(alpha * 255 * (mask ? mask[ty * size + tx] : 1)));
    }
  }
  return { width: size, height: size, pixels };
}

/** Multi-resolution ICO with PNG-compressed frames. */
function encodeIco(frames) {
  const payloads = frames.map((frame) => encodePng(frame));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(frames.length, 4);

  const directory = Buffer.alloc(16 * frames.length);
  let offset = header.length + directory.length;
  frames.forEach((frame, index) => {
    const entry = index * 16;
    directory[entry] = frame.width >= 256 ? 0 : frame.width;
    directory[entry + 1] = frame.height >= 256 ? 0 : frame.height;
    directory[entry + 2] = 0;
    directory[entry + 3] = 0;
    directory.writeUInt16LE(1, entry + 4);
    directory.writeUInt16LE(32, entry + 6);
    directory.writeUInt32LE(payloads[index].length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += payloads[index].length;
  });

  return Buffer.concat([header, directory, ...payloads]);
}

function write(dir, name, buffer) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), buffer);
}

// ---------------------------------------------------------------------------

const mark = trim(decodePng(SYMBOL));
const logoWhite = trim(decodePng(LOGO_WHITE));
const logoDark = trim(decodePng(LOGO_DARK));

const brandingDirs = [path.join(WEB_PUBLIC, "branding"), path.join(CONTROL_PUBLIC, "branding")];
const publicDirs = [WEB_PUBLIC, CONTROL_PUBLIC];

// Wordmark lockups (Brand CI 01).
const lockups = {
  "veza-logo-white.png": resize(logoWhite, 1400),
  "veza-logo-dark.png": resize(logoDark, 1400),
  "veza-logo-primary.png": resize(logoDark, 1024),
  "veza-logo-horizontal.png": resize(logoDark, 1200),
};
for (const [name, image] of Object.entries(lockups)) {
  const png = encodePng(image);
  for (const dir of brandingDirs) write(dir, name, png);
}

// Transparent mark, for in-app use.
for (const size of [64, 128, 768]) {
  const png = encodePng(resize(mark, size, Math.round((mark.height / mark.width) * size)));
  const name = size === 768 ? "veza-icon-mark.png" : `veza-symbol-${size}.png`;
  for (const dir of brandingDirs) write(dir, name, png);
}

// App icons. Small sizes get less padding so the V still reads at 16px.
const iconSizes = [16, 32, 48, 64, 128, 180, 192, 256, 512];
for (const size of iconSizes) {
  const png = encodePng(appIcon(mark, size, { padding: size <= 32 ? 0.1 : 0.16 }));
  for (const dir of brandingDirs) write(dir, `veza-app-icon-${size}.png`, png);
}

// Android adaptive icons are masked hard, so go full-bleed with deep padding.
const maskable = encodePng(appIcon(mark, 512, { padding: 0.28, rounded: false }));
for (const dir of brandingDirs) write(dir, "veza-app-icon-maskable-512.png", maskable);

// Multi-resolution favicon.
const ico = encodeIco([16, 24, 32, 48, 64, 128, 256].map((size) => appIcon(mark, size, { padding: size <= 32 ? 0.1 : 0.16 })));
for (const dir of publicDirs) write(dir, "favicon.ico", ico);

console.log(
  `Generated ${Object.keys(lockups).length + iconSizes.length + 4} brand assets from assets/ into ` +
    `${brandingDirs.map((dir) => path.relative(ROOT, dir)).join(", ")} (+ favicon.ico)`,
);
