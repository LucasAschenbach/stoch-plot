import { describe, expect, it } from "vitest";

import { sampleBuiltinProcess } from "@/lib/runtime/processes";
import { createRngContext } from "@/lib/runtime/rng";
import { linspace, mean, variance } from "@/lib/runtime/math";

function samplerContext(seed = 11, sampleCount = 4096) {
  const times = linspace(0, 1, 501);

  return {
    cellId: "test-cell",
    sampleCount,
    times,
    tMin: 0,
    tMax: 1,
    rng: createRngContext(seed),
  };
}

describe("built-in process samplers", () => {
  it("Brownian endpoints have approximately correct mean and variance", () => {
    const sampled = sampleBuiltinProcess("Brownian", [], samplerContext());

    expect(mean(sampled.endpoints)).toBeCloseTo(0, 1);
    expect(variance(sampled.endpoints)).toBeCloseTo(1, 1);
  });

  it("Brownian bridge endpoints stay pinned at zero", () => {
    const sampled = sampleBuiltinProcess("BrownianBridge", [1], samplerContext(5, 512));

    expect(sampled.endpoints.every((value) => Math.abs(value) < 1e-10)).toBe(true);
  });

  it("Geometric Brownian motion stays positive and matches endpoint mean approximately", () => {
    const mu = 0.3;
    const sigma = 0.5;
    const x0 = 1.2;
    const sampled = sampleBuiltinProcess(
      "GeometricBrownian",
      [mu, sigma, x0],
      samplerContext(17),
    );

    expect(sampled.endpoints.every((value) => value > 0)).toBe(true);
    expect(mean(sampled.endpoints)).toBeCloseTo(x0 * Math.exp(mu), 1);
  });

  it("Poisson endpoints are nonnegative integers with the correct mean", () => {
    const lambda = 3.5;
    const sampled = sampleBuiltinProcess("Poisson", [lambda], samplerContext(23));

    expect(
      sampled.endpoints.every(
        (value) => value >= 0 && Math.abs(value - Math.round(value)) < 1e-10,
      ),
    ).toBe(true);
    expect(mean(sampled.endpoints)).toBeCloseTo(lambda, 1);
  });
});
