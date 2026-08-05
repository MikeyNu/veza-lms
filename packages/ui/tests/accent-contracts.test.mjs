import assert from "node:assert/strict";
import test from "node:test";

function channel(value) { const normalized = value / 255; return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4; }
function luminance(hex) { return 0.2126 * channel(parseInt(hex.slice(1, 3), 16)) + 0.7152 * channel(parseInt(hex.slice(3, 5), 16)) + 0.0722 * channel(parseInt(hex.slice(5, 7), 16)); }
function ratio(a, b) { return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); }

const accents = ["#0d9488", "#2563eb", "#7867f8", "#b76e00", "#138a52", "#c72c41"];
test("approved institution accents have a readable black or white foreground", () => {
  for (const accent of accents) {
    const value = luminance(accent);
    const best = Math.max(ratio(value, luminance("#000000")), ratio(value, luminance("#ffffff")));
    assert.ok(best >= 4.5, `${accent} has insufficient foreground contrast: ${best.toFixed(2)}`);
  }
});
