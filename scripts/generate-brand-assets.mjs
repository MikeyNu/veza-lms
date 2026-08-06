import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const ROOT = path.resolve(import.meta.dirname, "..");
const SOURCE = path.join(ROOT, "Brand CI.png");
const OUTPUT = path.join(ROOT, "apps", "web", "public", "branding");

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
  if (!input.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error("Brand CI source is not a PNG file");

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
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
      bitDepth = data[8];
      colorType = data[9];
      if (bitDepth !== 8 || ![2, 6].includes(colorType)) throw new Error(`Unsupported PNG format: bit depth ${bitDepth}, colour type ${colorType}`);
    } else if (type === "IDAT") compressed.push(data);
    else if (type === "IEND") break;
  }

  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const raw = zlib.inflateSync(Buffer.concat(compressed));
  const pixels = Buffer.alloc(width * height * 4);
  let sourceOffset = 0;
  let previous = Buffer.alloc(stride);

  function paeth(a, b, c) {
    const estimate = a + b - c;
    const pa = Math.abs(estimate - a);
    const pb = Math.abs(estimate - b);
    const pc = Math.abs(estimate - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  }

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
  return Buffer.concat([PNG_SIGNATURE, chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(scanlines, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

function crop(image, [left, top, right, bottom]) {
  const width = right - left;
  const height = bottom - top;
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const src = ((top + y) * image.width + left + x) * 4;
      const dst = (y * width + x) * 4;
      image.pixels.copy(pixels, dst, src, src + 4);
    }
  }
  return { width, height, pixels };
}

function keyBackground(image, background, tolerance, softRange = 26) {
  const pixels = Buffer.from(image.pixels);
  for (let index = 0; index < pixels.length; index += 4) {
    const distance = Math.max(
      Math.abs(pixels[index] - background[0]),
      Math.abs(pixels[index + 1] - background[1]),
      Math.abs(pixels[index + 2] - background[2]),
    );
    const alpha = Math.max(0, Math.min(255, Math.round(((distance - tolerance) / softRange) * 255)));
    pixels[index + 3] = alpha;
    if (alpha > 0 && alpha < 255) {
      const ratio = alpha / 255;
      pixels[index] = Math.max(0, Math.min(255, Math.round((pixels[index] - (1 - ratio) * background[0]) / ratio)));
      pixels[index + 1] = Math.max(0, Math.min(255, Math.round((pixels[index + 1] - (1 - ratio) * background[1]) / ratio)));
      pixels[index + 2] = Math.max(0, Math.min(255, Math.round((pixels[index + 2] - (1 - ratio) * background[2]) / ratio)));
    }
  }
  return { ...image, pixels };
}

function trim(image, padding = 2) {
  let minX = image.width;
  let minY = image.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (image.pixels[(y * image.width + x) * 4 + 3] > 8) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  if (maxX < minX) return image;
  return crop(image, [Math.max(0, minX - padding), Math.max(0, minY - padding), Math.min(image.width, maxX + padding + 1), Math.min(image.height, maxY + padding + 1)]);
}

function resize(image, targetWidth) {
  const targetHeight = Math.max(1, Math.round((image.height / image.width) * targetWidth));
  const pixels = Buffer.alloc(targetWidth * targetHeight * 4);
  for (let y = 0; y < targetHeight; y += 1) {
    const sourceY = Math.min(image.height - 1, Math.floor((y / targetHeight) * image.height));
    for (let x = 0; x < targetWidth; x += 1) {
      const sourceX = Math.min(image.width - 1, Math.floor((x / targetWidth) * image.width));
      const src = (sourceY * image.width + sourceX) * 4;
      const dst = (y * targetWidth + x) * 4;
      image.pixels.copy(pixels, dst, src, src + 4);
    }
  }
  return { width: targetWidth, height: targetHeight, pixels };
}

function roundedIcon(mark, size) {
  const pixels = Buffer.alloc(size * size * 4);
  const radius = Math.round(size * 0.22);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = Math.max(radius - x, 0, x - (size - radius - 1));
      const dy = Math.max(radius - y, 0, y - (size - radius - 1));
      const inside = dx * dx + dy * dy <= radius * radius;
      const dst = (y * size + x) * 4;
      pixels[dst] = 5;
      pixels[dst + 1] = 12;
      pixels[dst + 2] = 37;
      pixels[dst + 3] = inside ? 255 : 0;
    }
  }
  const scaled = resize(mark, Math.round(size * 0.6));
  const offsetX = Math.round((size - scaled.width) / 2);
  const offsetY = Math.round((size - scaled.height) / 2);
  for (let y = 0; y < scaled.height; y += 1) {
    for (let x = 0; x < scaled.width; x += 1) {
      const src = (y * scaled.width + x) * 4;
      const dst = ((offsetY + y) * size + offsetX + x) * 4;
      const alpha = scaled.pixels[src + 3] / 255;
      for (let channel = 0; channel < 3; channel += 1) pixels[dst + channel] = Math.round(scaled.pixels[src + channel] * alpha + pixels[dst + channel] * (1 - alpha));
      pixels[dst + 3] = Math.max(pixels[dst + 3], scaled.pixels[src + 3]);
    }
  }
  return { width: size, height: size, pixels };
}

function write(name, image) {
  fs.mkdirSync(OUTPUT, { recursive: true });
  fs.writeFileSync(path.join(OUTPUT, name), encodePng(image));
}

const source = decodePng(SOURCE);
const variants = {
  "veza-logo-primary.png": { box: [430, 88, 600, 174], background: [255, 255, 255], width: 1024 },
  "veza-logo-horizontal.png": { box: [724, 88, 928, 176], background: [255, 255, 255], width: 1200 },
  "veza-logo-stacked.png": { box: [620, 184, 756, 302], background: [255, 255, 255], width: 800 },
  "veza-logo-monochrome.png": { box: [790, 192, 950, 286], background: [255, 255, 255], width: 900 },
  "veza-logo-white.png": { box: [48, 42, 346, 172], background: [5, 12, 37], width: 1400 },
};

for (const [name, specification] of Object.entries(variants)) {
  const transparent = trim(keyBackground(crop(source, specification.box), specification.background, specification.background[0] > 200 ? 5 : 8));
  write(name, resize(transparent, specification.width));
}

const mark = trim(keyBackground(crop(source, [614, 84, 712, 178]), [255, 255, 255], 5));
write("veza-icon-mark.png", resize(mark, 768));
for (const size of [16, 32, 48, 64, 128, 180, 192, 256, 512]) write(`veza-app-icon-${size}.png`, roundedIcon(mark, size));

const faviconPng = encodePng(roundedIcon(mark, 64));
const directory = Buffer.alloc(6 + 16);
directory.writeUInt16LE(0, 0);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(1, 4);
directory[6] = 64;
directory[7] = 64;
directory[8] = 0;
directory[9] = 0;
directory.writeUInt16LE(1, 10);
directory.writeUInt16LE(32, 12);
directory.writeUInt32LE(faviconPng.length, 14);
directory.writeUInt32LE(22, 18);
fs.writeFileSync(path.join(ROOT, "apps", "web", "public", "favicon.ico"), Buffer.concat([directory, faviconPng]));

console.log(`Generated ${Object.keys(variants).length + 10} Veza PNG and favicon assets in ${path.relative(ROOT, OUTPUT)}`);
