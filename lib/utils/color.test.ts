import { describe, expect, it } from "vitest";

import { colorForIndex, normalizeColorMode, representativeColor } from "@/lib/utils/color";

describe("color helpers", () => {
  it("derives a tonal path palette for solid colors", () => {
    const first = colorForIndex("#3b82f6", "solid", 0, 5);
    const middle = colorForIndex("#3b82f6", "solid", 2, 5);
    const last = colorForIndex("#3b82f6", "solid", 4, 5);

    expect(first).not.toBe(middle);
    expect(middle).not.toBe(last);
    expect(representativeColor("solid", "#3b82f6")).toBe("#3b82f6");
  });

  it("uses the scheme palette representative color for overlays", () => {
    expect(representativeColor("viridis", "#ef4444")).toBe("#21918c");
    expect(colorForIndex("#ef4444", "viridis", 0, 5)).toBe("#440154");
    expect(colorForIndex("#ef4444", "viridis", 4, 5)).toBe("#fde725");
  });

  it("normalizes legacy and invalid color modes", () => {
    expect(normalizeColorMode("ocean")).toBe("cividis");
    expect(normalizeColorMode("sunset")).toBe("inferno");
    expect(normalizeColorMode("not-a-mode")).toBe("viridis");
    expect(normalizeColorMode(undefined)).toBe("viridis");
  });
});
