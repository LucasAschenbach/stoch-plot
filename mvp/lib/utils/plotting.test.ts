import { describe, expect, it } from "vitest";

import { buildHistogram } from "@/lib/utils/plotting";

describe("distribution panel histogram math", () => {
  it("normalizes histograms as densities over the visible range", () => {
    const values = Array.from({ length: 1000 }, (_, index) => index / 1000);
    const bins = buildHistogram(values, 0, 1, 20);
    const area = bins.reduce((sum, bin) => sum + bin.density * (bin.end - bin.start), 0);

    expect(area).toBeCloseTo(1, 6);
  });

  it("ignores samples outside the visible range instead of clamping them into edge bins", () => {
    const bins = buildHistogram([-5, -4, 0.25, 0.75, 5], 0, 1, 10);
    const totalCount = bins.reduce((sum, bin) => sum + bin.count, 0);

    expect(totalCount).toBe(2);
  });
});
