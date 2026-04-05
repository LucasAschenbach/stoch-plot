import {
  linspace,
  logNormalPdf,
  normalCdf,
  normalPdf,
  variance,
} from "@/lib/runtime/math";
import type {
  EndpointLaw,
  EndpointLawSupport,
  EndpointLawVariable,
} from "@/lib/runtime/types";

const MAX_COMBINATIONS = 40000;
const CONTINUOUS_POINTS = 121;

function normalizeWeights(weights: number[]) {
  const total = weights.reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    return weights.map(() => 0);
  }
  return weights.map((value) => value / total);
}

function createVariable(
  key: string,
  label: string,
  values: number[],
  weights: number[],
): EndpointLawVariable {
  return {
    key,
    label,
    values,
    weights: normalizeWeights(weights),
  };
}

type WeightedSamples = {
  values: number[];
  weights: number[];
};

type EndpointLawOptions = {
  support?: EndpointLawSupport;
};

const SUPPORT_EPSILON = 1e-9;

function clampSupportValue(value?: number) {
  return value !== undefined && Number.isFinite(value) ? value : undefined;
}

function inSupport(value: number, support?: EndpointLawSupport) {
  if (!support) {
    return true;
  }

  if (support.min !== undefined && value < support.min - SUPPORT_EPSILON) {
    return false;
  }

  if (support.max !== undefined && value > support.max + SUPPORT_EPSILON) {
    return false;
  }

  return true;
}

function normalizeSupport(support?: EndpointLawSupport) {
  if (!support) {
    return undefined;
  }

  const min = clampSupportValue(support.min);
  const max = clampSupportValue(support.max);

  if (min === undefined && max === undefined) {
    return undefined;
  }

  if (min !== undefined && max !== undefined && min > max) {
    return {
      min: max,
      max: min,
    };
  }

  return {
    min,
    max,
  };
}

function isPointSupport(support?: EndpointLawSupport) {
  return (
    support?.min !== undefined &&
    support.max !== undefined &&
    Math.abs(support.max - support.min) < SUPPORT_EPSILON
  );
}

function affineSupport(
  support: EndpointLawSupport | undefined,
  scale: number,
  offset: number,
) {
  if (!support) {
    return undefined;
  }

  const min = support.min;
  const max = support.max;

  if (scale === 0) {
    return normalizeSupport({ min: offset, max: offset });
  }

  if (min === undefined || max === undefined) {
    if (scale > 0) {
      return normalizeSupport({
        min: min === undefined ? undefined : offset + scale * min,
        max: max === undefined ? undefined : offset + scale * max,
      });
    }

    return normalizeSupport({
      min: max === undefined ? undefined : offset + scale * max,
      max: min === undefined ? undefined : offset + scale * min,
    });
  }

  return normalizeSupport({
    min: offset + scale * min,
    max: offset + scale * max,
  });
}

function addSupports(
  left: EndpointLawSupport | undefined,
  right: EndpointLawSupport | undefined,
) {
  if (!left || !right) {
    return undefined;
  }

  return normalizeSupport({
    min:
      left.min !== undefined && right.min !== undefined
        ? left.min + right.min
        : undefined,
    max:
      left.max !== undefined && right.max !== undefined
        ? left.max + right.max
        : undefined,
  });
}

function subtractSupports(
  left: EndpointLawSupport | undefined,
  right: EndpointLawSupport | undefined,
) {
  if (!left || !right) {
    return undefined;
  }

  return normalizeSupport({
    min:
      left.min !== undefined && right.max !== undefined
        ? left.min - right.max
        : undefined,
    max:
      left.max !== undefined && right.min !== undefined
        ? left.max - right.min
        : undefined,
  });
}

function integerPowerSupport(
  support: EndpointLawSupport | undefined,
  exponent: number,
) {
  const normalized = normalizeSupport(support);
  if (!normalized) {
    return exponent % 2 === 0 ? { min: 0 } : undefined;
  }

  const { min, max } = normalized;
  if (min === undefined || max === undefined) {
    if (exponent % 2 === 0) {
      if (min !== undefined && min >= 0) {
        return normalizeSupport({ min: min ** exponent });
      }

      if (max !== undefined && max <= 0) {
        return normalizeSupport({ min: Math.abs(max) ** exponent });
      }

      return { min: 0 };
    }

    if (min !== undefined && min >= 0) {
      return normalizeSupport({ min: min ** exponent });
    }

    if (max !== undefined && max <= 0) {
      return normalizeSupport({ max: max ** exponent });
    }

    return undefined;
  }

  if (exponent % 2 !== 0) {
    return normalizeSupport({
      min: min ** exponent,
      max: max ** exponent,
    });
  }

  if (min >= 0) {
    return normalizeSupport({
      min: min ** exponent,
      max: max ** exponent,
    });
  }

  if (max <= 0) {
    return normalizeSupport({
      min: max ** exponent,
      max: min ** exponent,
    });
  }

  return normalizeSupport({
    min: 0,
    max: Math.max(Math.abs(min), Math.abs(max)) ** exponent,
  });
}

function materializeWeightedSamples(law: EndpointLaw): WeightedSamples | null {
  if (law.variables.length === 0) {
    return {
      values: [law.evaluate({})],
      weights: [1],
    };
  }

  const combinationCount = law.variables.reduce(
    (product, variable) => product * variable.values.length,
    1,
  );

  if (combinationCount > MAX_COMBINATIONS) {
    return null;
  }

  const values: number[] = [];
  const weights: number[] = [];
  const environment: Record<string, number> = {};

  const walk = (index: number, weight: number) => {
    if (index >= law.variables.length) {
      values.push(law.evaluate(environment));
      weights.push(weight);
      return;
    }

    const variable = law.variables[index];
    variable.values.forEach((value, valueIndex) => {
      environment[variable.key] = value;
      walk(index + 1, weight * variable.weights[valueIndex]);
    });
  };

  walk(0, 1);

  return {
    values,
    weights: normalizeWeights(weights),
  };
}

function densityFromWeightedSamples(
  weightedSamples: WeightedSamples,
  yGrid: number[],
  support?: EndpointLawSupport,
) {
  if (weightedSamples.values.length === 0) {
    return yGrid.map(() => 0);
  }

  if (weightedSamples.values.length === 1) {
    const width =
      Math.max((yGrid.at(-1) ?? 1) - (yGrid[0] ?? 0), 1e-3) / Math.max(yGrid.length, 2);
    return yGrid.map((value) =>
      (isPointSupport(support) || inSupport(value, support))
        ? normalPdf(value, weightedSamples.values[0], Math.max(width * 1.5, 1e-3))
        : 0,
    );
  }

  const sampleVariance = variance(weightedSamples.values);
  const sampleStd = Math.sqrt(Math.max(sampleVariance, 1e-12));
  const ySpan = Math.max((yGrid.at(-1) ?? 1) - (yGrid[0] ?? 0), 1e-6);
  const bandwidth = Math.max(
    1.06 * sampleStd * weightedSamples.values.length ** (-0.2),
    ySpan / 150,
    1e-3,
  );

  const kernelMassInSupport = (sample: number) => {
    const lowerMass =
      support?.min === undefined ? 0 : normalCdf(support.min, sample, bandwidth);
    const upperMass =
      support?.max === undefined ? 1 : normalCdf(support.max, sample, bandwidth);
    return Math.max(upperMass - lowerMass, 1e-9);
  };

  return yGrid.map((y) => {
    if (!inSupport(y, support)) {
      return 0;
    }

    return weightedSamples.values.reduce(
      (sum, sample, index) =>
        sum +
        (weightedSamples.weights[index] * normalPdf(y, sample, bandwidth)) /
          kernelMassInSupport(sample),
      0,
    );
  });
}

function dedupeVariables(variables: EndpointLawVariable[]) {
  const byKey = new Map<string, EndpointLawVariable>();
  variables.forEach((variable) => {
    if (!byKey.has(variable.key)) {
      byKey.set(variable.key, variable);
    }
  });
  return Array.from(byKey.values());
}

export function createEndpointLaw(
  variables: EndpointLawVariable[],
  evaluate: EndpointLaw["evaluate"],
  options: EndpointLawOptions = {},
): EndpointLaw {
  const mergedVariables = dedupeVariables(variables);
  const support = normalizeSupport(options.support);
  let cachedSamples: WeightedSamples | null | undefined;
  let cachedExpectation: number | undefined;

  const getSamples = () => {
    if (cachedSamples !== undefined) {
      return cachedSamples;
    }
    cachedSamples = materializeWeightedSamples({
      variables: mergedVariables,
      support,
      evaluate,
      expectation: () => 0,
      density: () => [],
    });
    return cachedSamples;
  };

  return {
    variables: mergedVariables,
    support,
    evaluate,
    expectation: () => {
      if (cachedExpectation !== undefined) {
        return cachedExpectation;
      }
      const samples = getSamples();
      if (!samples) {
        return Number.NaN;
      }
      cachedExpectation = samples.values.reduce(
        (sum, value, index) => sum + value * samples.weights[index],
        0,
      );
      return cachedExpectation;
    },
    density: (yGrid) => {
      const samples = getSamples();
      if (!samples) {
        return yGrid.map(() => 0);
      }
      return densityFromWeightedSamples(samples, yGrid, support);
    },
  };
}

export function constantEndpointLaw(value: number) {
  return createEndpointLaw([], () => value, {
    support: {
      min: value,
      max: value,
    },
  });
}

export function normalEndpointLaw(
  key: string,
  meanValue: number,
  varianceValue: number,
  label = key,
) {
  if (varianceValue <= 1e-12) {
    return constantEndpointLaw(meanValue);
  }

  const stdDev = Math.sqrt(Math.max(varianceValue, 1e-12));
  const values = linspace(
    meanValue - 6 * stdDev,
    meanValue + 6 * stdDev,
    CONTINUOUS_POINTS,
  );
  const step = values[1] - values[0];
  const weights = values.map((value) => normalPdf(value, meanValue, stdDev) * step);

  const variable = createVariable(key, label, values, weights);
  return createEndpointLaw([variable], (environment) => environment[key]);
}

export function logNormalEndpointLaw(
  key: string,
  logMean: number,
  logStd: number,
  label = key,
) {
  if (logStd <= 1e-12) {
    return constantEndpointLaw(Math.exp(logMean));
  }

  const low = Math.exp(logMean - 6 * logStd);
  const high = Math.exp(logMean + 6 * logStd);
  const values = linspace(Math.max(low, 1e-9), Math.max(high, low + 1e-9), CONTINUOUS_POINTS);
  const step = values[1] - values[0];
  const weights = values.map((value) => logNormalPdf(value, logMean, logStd) * step);

  const variable = createVariable(key, label, values, weights);
  return createEndpointLaw([variable], (environment) => environment[key], {
    support: { min: 0 },
  });
}

export function poissonEndpointLaw(key: string, lambda: number, label = key) {
  const maxValue = Math.max(12, Math.ceil(lambda + 8 * Math.sqrt(lambda + 1)));
  let probability = Math.exp(-lambda);
  const values: number[] = [];
  const weights: number[] = [];

  for (let k = 0; k <= maxValue; k += 1) {
    if (k === 0) {
      probability = Math.exp(-lambda);
    } else {
      probability *= lambda / k;
    }
    values.push(k);
    weights.push(probability);
  }

  const variable = createVariable(key, label, values, weights);
  return createEndpointLaw([variable], (environment) => environment[key], {
    support: { min: 0 },
  });
}

export function combineEndpointLaws(
  left: EndpointLaw,
  right: EndpointLaw,
  combiner: (leftValue: number, rightValue: number) => number,
  options: EndpointLawOptions = {},
) {
  return createEndpointLaw(
    [...left.variables, ...right.variables],
    (environment) => combiner(left.evaluate(environment), right.evaluate(environment)),
    options,
  );
}

export function transformEndpointLaw(
  law: EndpointLaw,
  transform: (value: number) => number,
  options: EndpointLawOptions = {},
) {
  return createEndpointLaw(
    law.variables,
    (environment) => transform(law.evaluate(environment)),
    options,
  );
}

export function affineEndpointLaw(
  law: EndpointLaw,
  scale: number,
  offset: number,
) {
  return transformEndpointLaw(law, (value) => offset + scale * value, {
    support: affineSupport(law.support, scale, offset),
  });
}

export function addEndpointLaws(left: EndpointLaw, right: EndpointLaw) {
  return combineEndpointLaws(left, right, (leftValue, rightValue) => leftValue + rightValue, {
    support: addSupports(left.support, right.support),
  });
}

export function subtractEndpointLaws(left: EndpointLaw, right: EndpointLaw) {
  return combineEndpointLaws(left, right, (leftValue, rightValue) => leftValue - rightValue, {
    support: subtractSupports(left.support, right.support),
  });
}

export function powerEndpointLaw(law: EndpointLaw, exponent: number) {
  if (Math.abs(exponent) < 1e-12) {
    return constantEndpointLaw(1);
  }

  const roundedExponent = Math.round(exponent);
  const isIntegerExponent = Math.abs(exponent - roundedExponent) < 1e-9;

  return transformEndpointLaw(law, (value) => value ** exponent, {
    support: isIntegerExponent
      ? integerPowerSupport(law.support, roundedExponent)
      : undefined,
  });
}

export function endpointLawExpectation(law?: EndpointLaw) {
  if (!law) {
    return undefined;
  }

  const expectation = law.expectation();
  return Number.isFinite(expectation) ? expectation : undefined;
}
