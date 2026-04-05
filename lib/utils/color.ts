import type { ColorMode } from "@/lib/runtime/types";

export const COLOR_MODE_OPTIONS: { label: string; value: ColorMode }[] = [
  { label: "Solid", value: "solid" },
  { label: "Viridis", value: "viridis" },
  { label: "Plasma", value: "plasma" },
  { label: "Inferno", value: "inferno" },
  { label: "Magma", value: "magma" },
  { label: "Cividis", value: "cividis" },
  { label: "Turbo", value: "turbo" },
];

const schemePalettes: Record<Exclude<ColorMode, "solid">, string[]> = {
  viridis: ["#440154", "#3b528b", "#21918c", "#5ec962", "#fde725"],
  plasma: ["#0d0887", "#7e03a8", "#cc4778", "#f89540", "#f0f921"],
  inferno: ["#000004", "#57106e", "#bc3754", "#f98e09", "#fcffa4"],
  magma: ["#000004", "#51127c", "#b63679", "#fb8861", "#fcfdbf"],
  cividis: ["#00224e", "#123570", "#406e89", "#8a9a5b", "#fde725"],
  turbo: ["#30123b", "#4662d7", "#35aac3", "#a3dc38", "#f9fb0e"],
};

const legacyColorModeMap: Record<string, ColorMode> = {
  ocean: "cividis",
  sunset: "inferno",
};

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "");
  const value = Number.parseInt(normalized, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b]
    .map((channel) => Math.round(channel).toString(16).padStart(2, "0"))
    .join("")}`;
}

function interpolateColor(start: string, end: string, t: number) {
  const a = hexToRgb(start);
  const b = hexToRgb(end);
  return rgbToHex(
    a.r + (b.r - a.r) * t,
    a.g + (b.g - a.g) * t,
    a.b + (b.b - a.b) * t,
  );
}

function mixColor(base: string, target: string, amount: number) {
  return interpolateColor(base, target, amount);
}

function solidPalette(baseColor: string) {
  return [
    mixColor(baseColor, "#111827", 0.42),
    mixColor(baseColor, "#111827", 0.18),
    baseColor,
    mixColor(baseColor, "#ffffff", 0.18),
    mixColor(baseColor, "#ffffff", 0.38),
  ];
}

export function normalizeColorMode(mode: unknown): ColorMode {
  if (mode === "solid") {
    return "solid";
  }

  if (typeof mode === "string" && mode in schemePalettes) {
    return mode as Exclude<ColorMode, "solid">;
  }

  if (typeof mode === "string" && mode in legacyColorModeMap) {
    return legacyColorModeMap[mode];
  }

  return "viridis";
}

export function paletteForMode(baseColor: string, mode: ColorMode | string) {
  const normalizedMode = normalizeColorMode(mode);
  return normalizedMode === "solid"
    ? solidPalette(baseColor)
    : schemePalettes[normalizedMode];
}

export function representativeColor(mode: ColorMode, baseColor: string) {
  const palette = paletteForMode(baseColor, mode);
  return palette[Math.floor(palette.length / 2)] ?? baseColor;
}

export function colorForIndex(baseColor: string, mode: ColorMode, index: number, total: number) {
  const palette = paletteForMode(baseColor, mode);
  if (total <= 1) {
    return representativeColor(mode, baseColor);
  }

  const position = index / Math.max(total - 1, 1);
  const scaled = position * (palette.length - 1);
  const lowerIndex = Math.floor(scaled);
  const upperIndex = Math.min(lowerIndex + 1, palette.length - 1);
  const localT = scaled - lowerIndex;

  return interpolateColor(palette[lowerIndex], palette[upperIndex], localT);
}

export function withAlpha(hex: string, alpha: number) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
