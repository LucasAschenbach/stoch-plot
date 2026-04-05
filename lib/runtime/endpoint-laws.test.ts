import { describe, expect, it } from "vitest";

import { normalPdf } from "@/lib/runtime/math";
import {
  affineEndpointLaw,
  normalEndpointLaw,
  powerEndpointLaw,
} from "@/lib/runtime/endpoint-laws";
import {
  densityGrid,
  integrateTrapezoid,
} from "@/lib/runtime/test-helpers";

function squaredNormalPdf(value: number, stdDev = 1) {
  if (value <= 0) {
    return 0;
  }

  const root = Math.sqrt(value);
  return (normalPdf(root, 0, stdDev) + normalPdf(-root, 0, stdDev)) / (2 * root);
}

function scaledSquaredNormalPdf(value: number, scale: number) {
  if (Math.abs(scale) <= 1e-12) {
    return 0;
  }

  const sourceValue = value / scale;
  if (sourceValue <= 0) {
    return 0;
  }

  return squaredNormalPdf(sourceValue) / Math.abs(scale);
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
    const y = densityGrid(1e-4, 12, 4001);
    const density = law.density(y);
    const expected = y.map((value) => squaredNormalPdf(value));

    expect(density.every((value) => Number.isFinite(value) && value >= 0)).toBe(true);
    expect(integrateTrapezoid(y, density)).toBeCloseTo(integrateTrapezoid(y, expected), 9);
    expect(law.expectation()).toBeCloseTo(1, 1);
  });

  it("square transforms match the exact chi-square density away from the singularity", () => {
    const law = powerEndpointLaw(normalEndpointLaw("z", 0, 1), 2);
    const y = densityGrid(1e-4, 12, 4001);
    const density = law.density(y);
    const expected = y.map((value) => squaredNormalPdf(value));
    const maxError = Math.max(
      ...density.map((value, index) => Math.abs(value - expected[index])),
    );

    expect(maxError).toBeLessThan(1e-9);
  });

  it("negative affine scaling flips support without losing mass", () => {
    const squared = powerEndpointLaw(normalEndpointLaw("z", 0, 1), 2);
    const law = affineEndpointLaw(squared, -3, 0);
    const y = densityGrid(-36, -1e-4, 4001);
    const density = law.density(y);
    const expected = y.map((value) => scaledSquaredNormalPdf(value, -3));

    expect(density.every((value) => Number.isFinite(value) && value >= 0)).toBe(true);
    expect(integrateTrapezoid(y, density)).toBeCloseTo(integrateTrapezoid(y, expected), 9);
    expect(law.expectation()).toBeCloseTo(-3, 1);
  });
});
