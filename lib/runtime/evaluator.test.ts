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

describe("stochastic calculus DSL", () => {
  it("treats t as the process-time variable in derived process cells", () => {
    const notebook = evaluateTestNotebook([
      createCell("mu", "mu = 2"),
      createCell("line", "X_t = mu * t"),
    ]);

    const process = notebook.records.line.value;
    expect(process?.type).toBe("process");
    if (!process || process.type !== "process") {
      throw new Error("Expected process output.");
    }

    expect(process.paths[0][0]).toBeCloseTo(0, 9);
    expect(process.paths[0].at(-1)).toBeCloseTo(2, 9);
  });

  it("solves the ODE dX_t = dt with X_0 = 0", () => {
    const notebook = evaluateTestNotebook([
      createCell("x0", "X_0 = 0"),
      createCell("ode", "dX_t = dt"),
    ]);

    const process = notebook.records.ode.value;
    expect(process?.type).toBe("process");
    if (!process || process.type !== "process") {
      throw new Error("Expected process output.");
    }

    process.mean.forEach((value, index) => {
      expect(value).toBeCloseTo(process.times[index], 9);
    });
  });

  it("matches Brownian paths through integral(dB_t)", () => {
    const notebook = evaluateTestNotebook([
      createCell("brownian", "B_t = Brownian()"),
      createCell("integral", "I_t = integral(dB_t)"),
    ]);

    const brownian = notebook.records.brownian.value;
    const integral = notebook.records.integral.value;
    expect(brownian?.type).toBe("process");
    expect(integral?.type).toBe("process");
    if (!brownian || brownian.type !== "process" || !integral || integral.type !== "process") {
      throw new Error("Expected process output.");
    }

    brownian.paths.forEach((path, sampleIndex) => {
      const integralPath = integral.paths[sampleIndex];
      path.forEach((value, index) => {
        expect(integralPath[index]).toBeCloseTo(value, 9);
      });
    });
  });

  it("approximates geometric Brownian motion from its SDE", () => {
    const mu = 0.2;
    const sigma = 0.35;
    const x0 = 1.3;
    const cells = [
      createCell("mu", `mu = ${mu}`),
      createCell("sigma", `sigma = ${sigma}`),
      createCell("x0", `X_0 = ${x0}`),
      createCell("driver", "B_t = Brownian()"),
      createCell("sde", "dX_t = mu * X_t * dt + sigma * X_t * dB_t"),
      createCell("builtin", `Y_t = GeometricBrownian(${mu}, ${sigma}, ${x0})`),
    ];
    const notebook = evaluateTestNotebook(cells, {
      tMin: 0,
      tMax: 1,
      points: 2001,
    });

    const sde = notebook.records.sde.value;
    const builtin = notebook.records.builtin.value;
    expect(sde?.type).toBe("process");
    expect(builtin?.type).toBe("process");
    if (!sde || sde.type !== "process" || !builtin || builtin.type !== "process") {
      throw new Error("Expected process output.");
    }

    expect(sde.mean.at(-1) ?? 0).toBeCloseTo(builtin.mean.at(-1) ?? 0, 1);
    expect(sde.variance.at(-1) ?? 0).toBeCloseTo(builtin.variance.at(-1) ?? 0, 1);
  });

  it("approximates quadratic variation of Brownian motion by time", () => {
    const notebook = evaluateTestNotebook([
      createCell("brownian", "B_t = Brownian()"),
      createCell("qv", "Q_t = qv(B_t)"),
    ], {
      tMin: 0,
      tMax: 1,
      points: 2001,
    });

    const process = notebook.records.qv.value;
    expect(process?.type).toBe("process");
    if (!process || process.type !== "process") {
      throw new Error("Expected process output.");
    }

    expect(process.mean.at(-1) ?? 0).toBeCloseTo(1, 1);
  });

  it("keeps qv(X_t, X_t) aligned with qv(X_t)", () => {
    const notebook = evaluateTestNotebook([
      createCell("brownian", "B_t = Brownian()"),
      createCell("single", "Q_t = qv(B_t)"),
      createCell("double", "R_t = qv(B_t, B_t)"),
    ]);

    const single = notebook.records.single.value;
    const double = notebook.records.double.value;
    expect(single?.type).toBe("process");
    expect(double?.type).toBe("process");
    if (!single || single.type !== "process" || !double || double.type !== "process") {
      throw new Error("Expected process output.");
    }

    single.paths.forEach((path, sampleIndex) => {
      const other = double.paths[sampleIndex];
      path.forEach((value, index) => {
        expect(other[index]).toBeCloseTo(value, 9);
      });
    });
  });

  it("supports deterministic time changes", () => {
    const notebook = evaluateTestNotebook([
      createCell("brownian", "B_t = Brownian()"),
      createCell("clock", "f(t) = t^2"),
      createCell("time-changed", "Z_t = B_t[f(t)]"),
      createCell("time-changed-sugar", "Y_t = B_{f(t)}"),
    ]);

    const direct = notebook.records["time-changed"].value;
    const sugar = notebook.records["time-changed-sugar"].value;
    expect(direct?.type).toBe("process");
    expect(sugar?.type).toBe("process");
    if (!direct || direct.type !== "process" || !sugar || sugar.type !== "process") {
      throw new Error("Expected process output.");
    }

    direct.paths.forEach((path, sampleIndex) => {
      const other = sugar.paths[sampleIndex];
      path.forEach((value, index) => {
        expect(other[index]).toBeCloseTo(value, 9);
      });
    });
  });

  it("supports random monotone clocks", () => {
    const notebook = evaluateTestNotebook([
      createCell("driver", "B_t = Brownian()"),
      createCell("clock", "T_t = 0.5 * qv(B_t)"),
      createCell("time-changed", "Z_t = B_t[T_t]"),
    ]);

    const process = notebook.records["time-changed"].value;
    expect(process?.type).toBe("process");
    if (!process || process.type !== "process") {
      throw new Error("Expected process output.");
    }

    expect(process.paths[0].length).toBe(process.times.length);
  });

  it("rejects non-monotone clocks", () => {
    const notebook = evaluateTestNotebook([
      createCell("brownian", "B_t = Brownian()"),
      createCell("clock", "T_t = 1 - t"),
      createCell("time-changed", "Z_t = B_t[T_t]"),
    ]);

    expect(notebook.records["time-changed"].error).toContain("nondecreasing");
  });

  it("rejects clocks outside the source horizon", () => {
    const notebook = evaluateTestNotebook([
      createCell("brownian", "B_t = Brownian()"),
      createCell("clock", "T_t = 2 * t"),
      createCell("time-changed", "Z_t = B_t[T_t]"),
    ]);

    expect(notebook.records["time-changed"].error).toContain("horizon");
  });
});
