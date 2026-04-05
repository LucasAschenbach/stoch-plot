import { evaluateNotebook } from "@/lib/runtime/evaluator";
import { linspace } from "@/lib/runtime/math";
import { createRngContext } from "@/lib/runtime/rng";
import type {
  CellDisplayOptions,
  EndpointLaw,
  GridConfig,
  NotebookCell,
  NotebookEvaluation,
} from "@/lib/runtime/types";

const defaultDisplay: CellDisplayOptions = {
  visible: true,
  showPaths: true,
  showMean: false,
  showVariance: false,
  sampleCount: 256,
  color: "#2563eb",
  colorMode: "solid",
};

export function createCell(
  id: string,
  source: string,
  overrides?: Partial<NotebookCell>,
): NotebookCell {
  const baseCell: NotebookCell = {
    id,
    source,
    display: defaultDisplay,
    slider: {
      enabled: false,
      min: 0,
      max: 1,
      step: 0.1,
    },
  };

  return {
    ...baseCell,
    ...overrides,
    display: {
      ...defaultDisplay,
      ...overrides?.display,
    },
    slider: {
      enabled: false,
      min: 0,
      max: 1,
      step: 0.1,
      ...overrides?.slider,
    },
  };
}

export function evaluateTestNotebook(
  cells: NotebookCell[],
  grid: GridConfig = {
    tMin: 0,
    tMax: 1,
    points: 801,
  },
  seed = 7,
): NotebookEvaluation {
  return evaluateNotebook(cells, grid, createRngContext(seed));
}

export function integrateTrapezoid(x: number[], y: number[]) {
  let area = 0;

  for (let index = 1; index < x.length; index += 1) {
    const dx = x[index] - x[index - 1];
    area += 0.5 * (y[index - 1] + y[index]) * dx;
  }

  return area;
}

export function densityGrid(minValue: number, maxValue: number, count = 4001) {
  return linspace(minValue, maxValue, count);
}

export function estimateLawRange(
  law: EndpointLaw,
  fallback: { min: number; max: number },
) {
  if (law.variables.length === 0) {
    const value = law.evaluate({});
    return { min: value, max: value };
  }

  const combinationCount = law.variables.reduce(
    (product, variable) => product * variable.values.length,
    1,
  );

  if (combinationCount > 100_000) {
    return fallback;
  }

  const environment: Record<string, number> = {};
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  const walk = (index: number) => {
    if (index >= law.variables.length) {
      const value = law.evaluate(environment);
      min = Math.min(min, value);
      max = Math.max(max, value);
      return;
    }

    const variable = law.variables[index];
    variable.values.forEach((value) => {
      environment[variable.key] = value;
      walk(index + 1);
    });
  };

  walk(0);

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return fallback;
  }

  return { min, max };
}
