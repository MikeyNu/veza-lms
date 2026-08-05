export interface InstitutionAccentResult {
  readonly accent: string;
  readonly contrast: "#000000" | "#ffffff";
  readonly contrastRatio: number;
}

function normalizeHex(input: string): string {
  const value = input.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(value)) return value;
  if (/^#[0-9a-f]{3}$/.test(value)) {
    return `#${value.slice(1).split("").map((character) => character.repeat(2)).join("")}`;
  }
  throw new Error("Institution accent must be a three or six digit hexadecimal colour");
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const linear = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

function ratio(first: number, second: number): number {
  const light = Math.max(first, second);
  const dark = Math.min(first, second);
  return (light + 0.05) / (dark + 0.05);
}

export function institutionAccent(input: string): InstitutionAccentResult {
  const accent = normalizeHex(input);
  const accentLuminance = luminance(accent);
  const dark = "#000000" as const;
  const light = "#ffffff" as const;
  const darkRatio = ratio(accentLuminance, luminance(dark));
  const lightRatio = ratio(accentLuminance, luminance(light));
  return darkRatio >= lightRatio
    ? { accent, contrast: dark, contrastRatio: darkRatio }
    : { accent, contrast: light, contrastRatio: lightRatio };
}

export function institutionAccentVariables(input: string): Readonly<Record<string, string>> {
  const result = institutionAccent(input);
  return {
    "--institution-accent": result.accent,
    "--institution-accent-contrast": result.contrast,
    "--veza-institution-accent": result.accent,
    "--veza-institution-accent-contrast": result.contrast,
  };
}
