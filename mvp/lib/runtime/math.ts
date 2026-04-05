export const SCALAR_FUNCTIONS: Record<string, (...args: number[]) => number> = {
  abs: Math.abs,
  cos: Math.cos,
  exp: Math.exp,
  log: Math.log,
  sin: Math.sin,
  sqrt: Math.sqrt,
};

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function linspace(start: number, end: number, count: number) {
  if (count <= 1) {
    return [start];
  }

  const step = (end - start) / (count - 1);
  return Array.from({ length: count }, (_, index) => start + step * index);
}

export function mean(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function variance(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  const average = mean(values);
  return (
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length
  );
}

export function meanByIndex(paths: number[][]) {
  if (paths.length === 0) {
    return [];
  }

  return paths[0].map((_, index) => mean(paths.map((path) => path[index] ?? 0)));
}

export function varianceByIndex(paths: number[][]) {
  if (paths.length === 0) {
    return [];
  }

  return paths[0].map((_, index) => variance(paths.map((path) => path[index] ?? 0)));
}

export function stdByIndex(paths: number[][]) {
  return varianceByIndex(paths).map((value) => Math.sqrt(value));
}

export function normalPdf(x: number, meanValue: number, stdDev: number) {
  if (stdDev <= 0) {
    return 0;
  }

  const z = (x - meanValue) / stdDev;
  return Math.exp(-0.5 * z * z) / (stdDev * Math.sqrt(2 * Math.PI));
}

export function erf(value: number) {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * x);
  const polynomial =
    (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t);
  const approximation = 1 - polynomial * Math.exp(-x * x);
  return sign * approximation;
}

export function normalCdf(x: number, meanValue = 0, stdDev = 1) {
  if (stdDev <= 0) {
    return x < meanValue ? 0 : 1;
  }

  return 0.5 * (1 + erf((x - meanValue) / (stdDev * Math.SQRT2)));
}

export function logNormalPdf(x: number, mu: number, sigma: number) {
  if (x <= 0 || sigma <= 0) {
    return 0;
  }

  const z = (Math.log(x) - mu) / sigma;
  return Math.exp(-0.5 * z * z) / (x * sigma * Math.sqrt(2 * Math.PI));
}

export function safeDivide(value: number, divisor: number) {
  return divisor === 0 ? 0 : value / divisor;
}
