import type {
  NotebookCell,
  NotebookEvaluation,
  RuntimeValue,
  ToolbarState,
  Viewport,
} from "@/lib/runtime/types";

export type PlotPadding = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type CanvasBounds = {
  width: number;
  height: number;
};

export const MAIN_PLOT_PADDING: PlotPadding = {
  top: 10,
  right: 0,
  bottom: 24,
  left: 28,
};

export const DIST_PLOT_PADDING: PlotPadding = {
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
};

function rangeWithPadding(minValue: number, maxValue: number, ratio = 0.12) {
  if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
    return { min: -1, max: 1 };
  }

  if (minValue === maxValue) {
    return { min: minValue - 1, max: maxValue + 1 };
  }

  const padding = (maxValue - minValue) * ratio;
  return {
    min: minValue - padding,
    max: maxValue + padding,
  };
}

function updateExtrema(value: number, current: { min: number; max: number }) {
  if (!Number.isFinite(value)) {
    return;
  }

  if (value < current.min) {
    current.min = value;
  }

  if (value > current.max) {
    current.max = value;
  }
}

function functionSampleValues(value: Extract<RuntimeValue, { type: "function" }>, toolbar: ToolbarState) {
  return Array.from({ length: toolbar.points }, (_, index) => {
    const x =
      toolbar.tMin +
      ((toolbar.tMax - toolbar.tMin) / Math.max(toolbar.points - 1, 1)) * index;
    return value.evaluate(x);
  });
}

export function computeDefaultViewport(
  cells: NotebookCell[],
  evaluation: NotebookEvaluation,
  toolbar: ToolbarState,
): Viewport {
  const visibleRecords = cells
    .filter((cell) => cell.display.visible)
    .map((cell) => evaluation.records[cell.id])
    .filter(Boolean);

  const extrema = { min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY };

  visibleRecords.forEach((record) => {
    const value = record?.value;
    if (!value) {
      return;
    }

    if (value.type === "process") {
      value.paths.forEach((path) => {
        path.forEach((point) => updateExtrema(point, extrema));
      });
      if (record && cells.find((cell) => cell.id === record.cellId)?.display.showMean) {
        value.mean.forEach((point) => updateExtrema(point, extrema));
      }
      if (record && cells.find((cell) => cell.id === record.cellId)?.display.showVariance) {
        value.mean.forEach((center, index) => {
          const std = Math.sqrt(value.variance[index] ?? 0);
          updateExtrema(center - std, extrema);
          updateExtrema(center + std, extrema);
        });
      }
      return;
    }

    if (value.type === "function") {
      functionSampleValues(value, toolbar).forEach((point) => updateExtrema(point, extrema));
    }
  });

  const { min, max } = rangeWithPadding(
    Number.isFinite(extrema.min) ? extrema.min : -1,
    Number.isFinite(extrema.max) ? extrema.max : 1,
  );

  return {
    xMin: toolbar.tMin,
    xMax: toolbar.tMax,
    yMin: min,
    yMax: max,
  };
}

export function getPlotArea(bounds: CanvasBounds, padding: PlotPadding) {
  return {
    x: padding.left,
    y: padding.top,
    width: Math.max(bounds.width - padding.left - padding.right, 1),
    height: Math.max(bounds.height - padding.top - padding.bottom, 1),
  };
}

export function worldToScreenX(value: number, viewport: Viewport, bounds: CanvasBounds, padding: PlotPadding) {
  const plot = getPlotArea(bounds, padding);
  return plot.x + ((value - viewport.xMin) / Math.max(viewport.xMax - viewport.xMin, 1e-9)) * plot.width;
}

export function worldToScreenY(value: number, viewport: Viewport, bounds: CanvasBounds, padding: PlotPadding) {
  const plot = getPlotArea(bounds, padding);
  return (
    plot.y +
    plot.height -
    ((value - viewport.yMin) / Math.max(viewport.yMax - viewport.yMin, 1e-9)) * plot.height
  );
}

export function screenToWorldX(value: number, viewport: Viewport, bounds: CanvasBounds, padding: PlotPadding) {
  const plot = getPlotArea(bounds, padding);
  return viewport.xMin + ((value - plot.x) / plot.width) * (viewport.xMax - viewport.xMin);
}

export function screenToWorldY(value: number, viewport: Viewport, bounds: CanvasBounds, padding: PlotPadding) {
  const plot = getPlotArea(bounds, padding);
  return viewport.yMin + ((plot.y + plot.height - value) / plot.height) * (viewport.yMax - viewport.yMin);
}

function niceStep(rawStep: number) {
  const exponent = Math.floor(Math.log10(rawStep || 1));
  const fraction = rawStep / 10 ** exponent;

  if (fraction <= 1) {
    return 1 * 10 ** exponent;
  }
  if (fraction <= 2) {
    return 2 * 10 ** exponent;
  }
  if (fraction <= 5) {
    return 5 * 10 ** exponent;
  }
  return 10 * 10 ** exponent;
}

export function generateTicks(minValue: number, maxValue: number, desiredCount = 6) {
  const span = Math.max(maxValue - minValue, 1e-9);
  const step = niceStep(span / Math.max(desiredCount - 1, 1));
  const first = Math.ceil(minValue / step) * step;
  const ticks: number[] = [];

  for (let value = first; value <= maxValue + step * 0.5; value += step) {
    ticks.push(Number(value.toFixed(10)));
  }

  return ticks;
}

export function panViewport(viewport: Viewport, deltaX: number, deltaY: number, bounds: CanvasBounds, padding: PlotPadding): Viewport {
  const plot = getPlotArea(bounds, padding);
  const xShift = (deltaX / plot.width) * (viewport.xMax - viewport.xMin);
  const yShift = (deltaY / plot.height) * (viewport.yMax - viewport.yMin);

  return {
    xMin: viewport.xMin - xShift,
    xMax: viewport.xMax - xShift,
    yMin: viewport.yMin + yShift,
    yMax: viewport.yMax + yShift,
  };
}

export function zoomViewport(
  viewport: Viewport,
  factor: number,
  anchorX: number,
  anchorY: number,
): Viewport {
  const nextWidth = Math.max((viewport.xMax - viewport.xMin) * factor, 1e-6);
  const nextHeight = Math.max((viewport.yMax - viewport.yMin) * factor, 1e-6);

  return {
    xMin: anchorX - ((anchorX - viewport.xMin) / (viewport.xMax - viewport.xMin)) * nextWidth,
    xMax: anchorX + ((viewport.xMax - anchorX) / (viewport.xMax - viewport.xMin)) * nextWidth,
    yMin: anchorY - ((anchorY - viewport.yMin) / (viewport.yMax - viewport.yMin)) * nextHeight,
    yMax: anchorY + ((viewport.yMax - anchorY) / (viewport.yMax - viewport.yMin)) * nextHeight,
  };
}

export function clampZoomFactor(deltaY: number) {
  const factor = Math.exp(deltaY * 0.0015);
  return Math.min(Math.max(factor, 0.5), 2);
}

export function scaleViewportAxis(
  viewport: Viewport,
  axis: "x" | "y",
  factor: number,
) {
  if (axis === "x") {
    const center = (viewport.xMin + viewport.xMax) / 2;
    const nextHalfSpan = Math.max(((viewport.xMax - viewport.xMin) * factor) / 2, 1e-6);
    return {
      ...viewport,
      xMin: center - nextHalfSpan,
      xMax: center + nextHalfSpan,
    };
  }

  const center = (viewport.yMin + viewport.yMax) / 2;
  const nextHalfSpan = Math.max(((viewport.yMax - viewport.yMin) * factor) / 2, 1e-6);
  return {
    ...viewport,
    yMin: center - nextHalfSpan,
    yMax: center + nextHalfSpan,
  };
}

export function configureCanvas(canvas: HTMLCanvasElement, width: number, height: number) {
  const pixelRatio = window.devicePixelRatio || 1;
  const displayWidth = Math.max(Math.floor(width), 1);
  const displayHeight = Math.max(Math.floor(height), 1);

  if (canvas.width !== Math.floor(displayWidth * pixelRatio) || canvas.height !== Math.floor(displayHeight * pixelRatio)) {
    canvas.width = Math.floor(displayWidth * pixelRatio);
    canvas.height = Math.floor(displayHeight * pixelRatio);
    canvas.style.width = `${displayWidth}px`;
    canvas.style.height = `${displayHeight}px`;
  }

  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }

  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  return context;
}

export function buildHistogram(values: number[], yMin: number, yMax: number, binCount = 18) {
  const span = Math.max(yMax - yMin, 1e-9);
  const binWidth = span / binCount;
  const bins = Array.from({ length: binCount }, () => 0);
  let includedCount = 0;

  values.forEach((value) => {
    if (value < yMin || value > yMax) {
      return;
    }

    const normalized = (value - yMin) / span;
    const index =
      value === yMax
        ? binCount - 1
        : Math.max(0, Math.min(binCount - 1, Math.floor(normalized * binCount)));
    bins[index] += 1;
    includedCount += 1;
  });

  return bins.map((count, index) => {
    const start = yMin + (index / binCount) * span;
    const end = yMin + ((index + 1) / binCount) * span;
    return {
      count,
      density: includedCount > 0 ? count / (includedCount * binWidth) : 0,
      start,
      end,
    };
  });
}
