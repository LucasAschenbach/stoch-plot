import { describe, expect, it } from "vitest";

import {
  densityGrid,
  estimateLawRange,
  integrateTrapezoid,
  createCell,
  evaluateTestNotebook,
} from "@/lib/runtime/test-helpers";

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
});
