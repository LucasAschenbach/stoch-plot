import type { ColorMode } from "@/lib/runtime/types";

export const COLOR_MODES: { label: string; value: ColorMode }[] = [
  { label: "Solid", value: "solid" },
  { label: "Viridis", value: "viridis" },
  { label: "Ocean", value: "ocean" },
  { label: "Sunset", value: "sunset" },
];

const palettes: Record<Exclude<ColorMode, "solid">, string[]> = {
  ocean: ["#0f172a", "#0ea5e9", "#5eead4", "#d1fae5"],
  sunset: ["#7f1d1d", "#ea580c", "#f59e0b", "#fef3c7"],
  viridis: ["#440154", "#3b528b", "#21918c", "#5ec962", "#fde725"],
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

export function colorForIndex(baseColor: string, mode: ColorMode, index: number, total: number) {
  if (mode === "solid" || total <= 1) {
    return baseColor;
  }

  const palette = palettes[mode];
  const position = total === 1 ? 0 : index / Math.max(total - 1, 1);
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
