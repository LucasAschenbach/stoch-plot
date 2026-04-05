import { describe, expect, it } from "vitest";

import {
  affineEndpointLaw,
  normalEndpointLaw,
  powerEndpointLaw,
} from "@/lib/runtime/endpoint-laws";
import {
  densityGrid,
  estimateLawRange,
  integrateTrapezoid,
} from "@/lib/runtime/test-helpers";
import type { EndpointLaw } from "@/lib/runtime/types";

function densityGridForLaw(
  law: EndpointLaw,
  fallbackMin: number,
  fallbackMax: number,
  padding = 0.5,
) {
  const estimated = estimateLawRange(law, { min: fallbackMin, max: fallbackMax });
  const min = law.support?.min ?? estimated.min;
  const max = law.support?.max ?? estimated.max;
  const span = Math.max(max - min + padding * 2, 1);
  const count = Math.min(60001, Math.max(6001, Math.ceil(span * 400)));
  return densityGrid(min - padding, max + padding, count);
}

describe("endpoint laws", () => {
  it("normal endpoint densities integrate close to one", () => {
    const law = normalEndpointLaw("z", 0.5, 2.25);
    const y = densityGrid(-12, 12);
    const density = law.density(y);

    expect(integrateTrapezoid(y, density)).toBeCloseTo(1, 2);
    expect(law.expectation()).toBeCloseTo(0.5, 2);
  });

  it("square transforms preserve nonnegative support and unit mass", () => {
    const law = powerEndpointLaw(normalEndpointLaw("z", 0, 1), 2);
    const y = densityGridForLaw(law, -3, 12);
    const density = law.density(y);
    const area = integrateTrapezoid(y, density);

    expect(Math.max(...density.filter((_value, index) => y[index] < 0))).toBe(0);
    expect(area, `maxDensity=${Math.max(...density)}`).toBeCloseTo(1, 2);
    expect(law.expectation()).toBeCloseTo(1, 1);
  });

  it("negative affine scaling flips support without losing mass", () => {
    const squared = powerEndpointLaw(normalEndpointLaw("z", 0, 1), 2);
    const law = affineEndpointLaw(squared, -3, 0);
    const y = densityGridForLaw(law, -120, 5);
    const density = law.density(y);
    const area = integrateTrapezoid(y, density);

    expect(Math.max(...density.filter((_value, index) => y[index] > 0))).toBe(0);
    expect(area, `maxDensity=${Math.max(...density)}`).toBeCloseTo(1, 2);
    expect(law.expectation()).toBeCloseTo(-3, 1);
  });
});
