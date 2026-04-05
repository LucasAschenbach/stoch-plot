import { describe, expect, it } from "vitest";

import { logNormalPdf, normalPdf } from "@/lib/runtime/math";
import {
  densityGrid,
  estimateLawRange,
  integrateTrapezoid,
  createCell,
  evaluateTestNotebook,
} from "@/lib/runtime/test-helpers";

function squaredNormalPdf(value: number, stdDev = 1) {
  if (value <= 0) {
    return 0;
  }

  const root = Math.sqrt(value);
  return (normalPdf(root, 0, stdDev) + normalPdf(-root, 0, stdDev)) / (2 * root);
}

describe("notebook evaluator endpoint laws", () => {
  it("keeps sigma * B_t^2 nonnegative and normalized", () => {
    const notebook = evaluateTestNotebook([
      createCell("sigma", "sigma = 7"),
      createCell("brownian", "B_t = Brownian()"),
      createCell("derived", "X_t = sigma * B_t^2"),
    ]);

    const process = notebook.records.derived.value;
    expect(process?.type).toBe("process");
    if (!process || process.type !== "process") {
      throw new Error("Expected process output.");
    }

    const range = estimateLawRange(process.endpointLaw!, { min: 0, max: 30 });
    const densityY = densityGrid(range.min - 0.5, range.max + 0.5, 60001);
    const density = process.endpointLaw?.density(densityY);
    const area = integrateTrapezoid(densityY, density ?? []);

    expect(density).toBeDefined();
    expect(Math.max(...(density ?? []).filter((_value, index) => densityY[index] < 0))).toBe(0);
    expect(area, `rangeMax=${range.max} maxDensity=${Math.max(...(density ?? [0]))}`).toBeCloseTo(1, 2);
    expect(process.endpointLaw?.expectation()).toBeCloseTo(7, 1);
  });

  it("keeps reused process symbols dependent rather than treating them as independent", () => {
    const notebook = evaluateTestNotebook([
      createCell("brownian", "B_t = Brownian()"),
      createCell("derived", "Y_t = B_t - B_t"),
    ]);

    const process = notebook.records.derived.value;
    expect(process?.type).toBe("process");
    if (!process || process.type !== "process") {
      throw new Error("Expected process output.");
    }

    expect(process.endpoints.every((value) => Math.abs(value) < 1e-10)).toBe(true);
    expect(process.endpointLaw?.expectation()).toBeCloseTo(0, 6);
  });

  it("keeps exp of an affine Brownian endpoint aligned with the exact lognormal density", () => {
    const mu = 0.12;
    const sigma = 0.3;
    const notebook = evaluateTestNotebook([
      createCell("mu", `mu = ${mu}`),
      createCell("sigma", `sigma = ${sigma}`),
      createCell("brownian", "B_t = Brownian()"),
      createCell("derived", "Y_t = exp(mu + sigma * B_t)"),
    ]);

    const process = notebook.records.derived.value;
    expect(process?.type).toBe("process");
    if (!process || process.type !== "process") {
      throw new Error("Expected process output.");
    }

    const densityY = densityGrid(1e-4, 4, 4001);
    const density = process.endpointLaw?.density(densityY) ?? [];
    const expected = densityY.map((value) => logNormalPdf(value, mu, sigma));
    const maxError = Math.max(
      ...density.map((value, index) => Math.abs(value - expected[index])),
    );

    expect(maxError).toBeLessThan(1e-9);
  });

  it("keeps affine Brownian endpoint laws aligned with the exact normal density", () => {
    const notebook = evaluateTestNotebook([
      createCell("brownian", "B_t = Brownian()"),
      createCell("derived", "X_t = 1 + 2 * B_t"),
    ]);

    const process = notebook.records.derived.value;
    expect(process?.type).toBe("process");
    if (!process || process.type !== "process") {
      throw new Error("Expected process output.");
    }

    const densityY = densityGrid(-8, 10, 4001);
    const density = process.endpointLaw?.density(densityY) ?? [];
    const expected = densityY.map((value) => normalPdf(value, 1, 2));
    const maxError = Math.max(
      ...density.map((value, index) => Math.abs(value - expected[index])),
    );

    expect(maxError).toBeLessThan(1e-9);
  });

  it("keeps B_t^2 aligned with the exact squared-normal density away from zero", () => {
    const notebook = evaluateTestNotebook([
      createCell("brownian", "B_t = Brownian()"),
      createCell("derived", "X_t = B_t^2"),
    ]);

    const process = notebook.records.derived.value;
    expect(process?.type).toBe("process");
    if (!process || process.type !== "process") {
      throw new Error("Expected process output.");
    }

    const densityY = densityGrid(1e-4, 12, 4001);
    const density = process.endpointLaw?.density(densityY) ?? [];
    const expected = densityY.map((value) => squaredNormalPdf(value));
    const maxError = Math.max(
      ...density.map((value, index) => Math.abs(value - expected[index])),
    );

    expect(maxError).toBeLessThan(1e-9);
  });
});
