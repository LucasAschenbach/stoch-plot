"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useNotebookStore } from "@/lib/store/use-notebook-store";
import type { EvaluationRecord, NotebookCell } from "@/lib/runtime/types";
import {
  clampZoomFactor,
  configureCanvas,
  generateTicks,
  getPlotArea,
  MAIN_PLOT_PADDING,
  panViewport,
  scaleViewportAxis,
  screenToWorldX,
  screenToWorldY,
  worldToScreenX,
  worldToScreenY,
  zoomViewport,
} from "@/lib/utils/plotting";
import { useElementSize } from "@/lib/utils/use-element-size";
import { colorForIndex, withAlpha } from "@/lib/utils/color";

type PlotItem = {
  cell: NotebookCell;
  record?: EvaluationRecord;
};

type InteractionMode = "none" | "pan" | "scale-x" | "scale-y";

function formatTick(value: number) {
  if (Math.abs(value) >= 1000 || (Math.abs(value) > 0 && Math.abs(value) < 0.01)) {
    return value.toExponential(1);
  }
  return value.toFixed(2).replace(/\.?0+$/, "");
}

function labelForItem(item: PlotItem) {
  return item.record?.name ?? item.cell.source.split("=")[0]?.trim() ?? item.cell.id;
}

function interactionModeForPoint(
  x: number,
  y: number,
  width: number,
  height: number,
): InteractionMode {
  const plot = getPlotArea({ width, height }, MAIN_PLOT_PADDING);
  const insidePlot =
    x >= plot.x &&
    x <= plot.x + plot.width &&
    y >= plot.y &&
    y <= plot.y + plot.height;

  if (insidePlot) {
    return "pan";
  }

  const insideXAxisStrip =
    x >= plot.x &&
    x <= plot.x + plot.width &&
    y > plot.y + plot.height &&
    y <= height;

  if (insideXAxisStrip) {
    return "scale-x";
  }

  const insideYAxisStrip =
    x >= 0 &&
    x < plot.x &&
    y >= plot.y &&
    y <= plot.y + plot.height;

  if (insideYAxisStrip) {
    return "scale-y";
  }

  return "none";
}

function drawPath(
  context: CanvasRenderingContext2D,
  xs: number[],
  ys: number[],
  viewport: ReturnType<typeof useNotebookStore.getState>["viewport"],
  width: number,
  height: number,
) {
  context.beginPath();
  xs.forEach((xValue, index) => {
    const x = worldToScreenX(xValue, viewport, { width, height }, MAIN_PLOT_PADDING);
    const y = worldToScreenY(ys[index], viewport, { width, height }, MAIN_PLOT_PADDING);
    if (index === 0) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  });
  context.stroke();
}

function drawVarianceBand(
  context: CanvasRenderingContext2D,
  times: number[],
  mean: number[],
  variance: number[],
  color: string,
  viewport: ReturnType<typeof useNotebookStore.getState>["viewport"],
  width: number,
  height: number,
) {
  context.beginPath();
  times.forEach((time, index) => {
    const x = worldToScreenX(time, viewport, { width, height }, MAIN_PLOT_PADDING);
    const y = worldToScreenY(
      mean[index] + Math.sqrt(variance[index] ?? 0),
      viewport,
      { width, height },
      MAIN_PLOT_PADDING,
    );
    if (index === 0) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  });

  [...times].reverse().forEach((time, reverseIndex) => {
    const index = times.length - 1 - reverseIndex;
    const x = worldToScreenX(time, viewport, { width, height }, MAIN_PLOT_PADDING);
    const y = worldToScreenY(
      mean[index] - Math.sqrt(variance[index] ?? 0),
      viewport,
      { width, height },
      MAIN_PLOT_PADDING,
    );
    context.lineTo(x, y);
  });

  context.closePath();
  context.fillStyle = withAlpha(color, 0.12);
  context.fill();
}

export function MainPlot({ items }: { items: PlotItem[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; mode: InteractionMode } | null>(null);
  const [hoverMode, setHoverMode] = useState<InteractionMode>("none");
  const [activeMode, setActiveMode] = useState<InteractionMode>("none");
  const viewport = useNotebookStore((state) => state.viewport);
  const hoveredCellId = useNotebookStore((state) => state.hoveredCellId);
  const setHoveredCellId = useNotebookStore((state) => state.setHoveredCellId);
  const setViewport = useNotebookStore((state) => state.setViewport);
  const size = useElementSize(containerRef);

  const chartData = useMemo(
    () =>
      items.filter((item) => {
        const value = item.record?.value;
        return value?.type === "process" || value?.type === "function";
      }),
    [items],
  );

  const cursor =
    activeMode === "scale-x" || hoverMode === "scale-x"
      ? "ew-resize"
      : activeMode === "scale-y" || hoverMode === "scale-y"
        ? "ns-resize"
        : activeMode === "pan"
          ? "grabbing"
          : hoverMode === "pan"
            ? "grab"
            : "default";

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();

      if (!containerRef.current) {
        return;
      }

      const rect = containerRef.current.getBoundingClientRect();
      const localX = event.clientX - rect.left;
      const localY = event.clientY - rect.top;
      const anchorX = screenToWorldX(
        localX,
        useNotebookStore.getState().viewport,
        { width: size.width, height: size.height },
        MAIN_PLOT_PADDING,
      );
      const anchorY = screenToWorldY(
        localY,
        useNotebookStore.getState().viewport,
        { width: size.width, height: size.height },
        MAIN_PLOT_PADDING,
      );

      setViewport((current) =>
        zoomViewport(current, clampZoomFactor(event.deltaY), anchorX, anchorY),
      );
    };

    const preventGesture = (event: Event) => {
      event.preventDefault();
    };

    canvas.addEventListener("wheel", handleWheel, { passive: false });
    canvas.addEventListener("gesturestart", preventGesture);
    canvas.addEventListener("gesturechange", preventGesture);
    canvas.addEventListener("gestureend", preventGesture);

    return () => {
      canvas.removeEventListener("wheel", handleWheel);
      canvas.removeEventListener("gesturestart", preventGesture);
      canvas.removeEventListener("gesturechange", preventGesture);
      canvas.removeEventListener("gestureend", preventGesture);
    };
  }, [setViewport, size.height, size.width]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.width < 10 || size.height < 10) {
      return;
    }

    const context = configureCanvas(canvas, size.width, size.height);
    if (!context) {
      return;
    }

    context.clearRect(0, 0, size.width, size.height);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, size.width, size.height);

    const plot = getPlotArea({ width: size.width, height: size.height }, MAIN_PLOT_PADDING);
    const xTicks = generateTicks(viewport.xMin, viewport.xMax);
    const yTicks = generateTicks(viewport.yMin, viewport.yMax);

    context.strokeStyle = "#e5e7eb";
    context.lineWidth = 1;
    xTicks.forEach((tick) => {
      const x = worldToScreenX(tick, viewport, { width: size.width, height: size.height }, MAIN_PLOT_PADDING);
      context.beginPath();
      context.moveTo(x, plot.y);
      context.lineTo(x, plot.y + plot.height);
      context.stroke();
    });
    yTicks.forEach((tick) => {
      const y = worldToScreenY(tick, viewport, { width: size.width, height: size.height }, MAIN_PLOT_PADDING);
      context.beginPath();
      context.moveTo(plot.x, y);
      context.lineTo(plot.x + plot.width, y);
      context.stroke();
    });

    context.save();
    context.beginPath();
    context.rect(plot.x, plot.y, plot.width, plot.height);
    context.clip();

    chartData.forEach(({ cell, record }) => {
      const value = record?.value;
      if (!value) {
        return;
      }

      const dimmed = hoveredCellId !== null && hoveredCellId !== cell.id;
      const emphasis = hoveredCellId === cell.id;

      if (value.type === "process") {
        if (cell.display.showVariance) {
          context.save();
          context.globalAlpha = dimmed ? 0.06 : emphasis ? 0.2 : 1;
          drawVarianceBand(
            context,
            value.times,
            value.mean,
            value.variance,
            cell.display.color,
            viewport,
            size.width,
            size.height,
          );
          context.restore();
        }

        if (cell.display.showPaths) {
          value.paths.forEach((path, index) => {
            context.strokeStyle = colorForIndex(
              cell.display.color,
              cell.display.colorMode,
              index,
              value.paths.length,
            );
            context.lineWidth = emphasis ? 1.8 : 1.2;
            context.globalAlpha = dimmed ? 0.14 : 0.9;
            drawPath(context, value.times, path, viewport, size.width, size.height);
          });
        }

        if (cell.display.showMean) {
          context.save();
          context.setLineDash([6, 6]);
          context.strokeStyle = cell.display.color;
          context.lineWidth = emphasis ? 2.8 : 2;
          context.globalAlpha = dimmed ? 0.24 : 1;
          drawPath(context, value.times, value.mean, viewport, size.width, size.height);
          context.restore();
        }
        return;
      }

      if (value.type === "function") {
        const xs = Array.from({ length: 240 }, (_, index) => {
          return viewport.xMin + ((viewport.xMax - viewport.xMin) / 239) * index;
        });
        const ys = xs.map((x) => value.evaluate(x));
        context.strokeStyle = cell.display.color;
        context.lineWidth = emphasis ? 2.8 : 2;
        context.globalAlpha = dimmed ? 0.2 : 1;
        drawPath(context, xs, ys, viewport, size.width, size.height);
      }
    });

    context.restore();
    context.globalAlpha = 1;

    context.strokeStyle = hoverMode === "scale-x" ? "#111827" : "#9ca3af";
    context.lineWidth = hoverMode === "scale-x" ? 2 : 1;
    context.beginPath();
    context.moveTo(plot.x, plot.y + plot.height);
    context.lineTo(plot.x + plot.width, plot.y + plot.height);
    context.stroke();

    context.strokeStyle = hoverMode === "scale-y" ? "#111827" : "#9ca3af";
    context.lineWidth = hoverMode === "scale-y" ? 2 : 1;
    context.beginPath();
    context.moveTo(plot.x, plot.y);
    context.lineTo(plot.x, plot.y + plot.height);
    context.stroke();

    context.strokeStyle = "#111827";
    context.lineWidth = 1;
    context.strokeRect(plot.x, plot.y, plot.width, plot.height);

    context.fillStyle = "#4b5563";
    context.font = "12px sans-serif";
    context.textAlign = "center";
    xTicks.forEach((tick) => {
      const x = worldToScreenX(tick, viewport, { width: size.width, height: size.height }, MAIN_PLOT_PADDING);
      context.fillText(formatTick(tick), x, size.height - 8);
    });

    context.textAlign = "right";
    yTicks.forEach((tick) => {
      const y = worldToScreenY(tick, viewport, { width: size.width, height: size.height }, MAIN_PLOT_PADDING);
      context.fillText(formatTick(tick), plot.x - 8, y + 4);
    });
  }, [chartData, hoveredCellId, hoverMode, size.height, size.width, viewport]);

  return (
    <section className="flex min-w-0 flex-1 border-r border-stone-200">
      <div ref={containerRef} className="relative h-full w-full bg-white">
        {chartData.length > 0 ? (
          <div className="pointer-events-none absolute left-4 top-4 z-10 flex max-w-[70%] flex-wrap gap-2">
            {chartData.map((item) => {
              const active = hoveredCellId === item.cell.id;
              const dimmed = hoveredCellId !== null && hoveredCellId !== item.cell.id;
              return (
                <button
                  key={item.cell.id}
                  type="button"
                  onPointerEnter={() => setHoveredCellId(item.cell.id)}
                  onPointerLeave={() => setHoveredCellId(null)}
                  className={`pointer-events-auto flex items-center gap-2 border px-2 py-1 text-xs ${
                    active
                      ? "border-stone-900 bg-stone-900 text-white"
                      : dimmed
                        ? "border-stone-200 bg-white text-stone-400"
                        : "border-stone-300 bg-white text-stone-700"
                  }`}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: item.cell.display.color }}
                  />
                  <span>{labelForItem(item)}</span>
                </button>
              );
            })}
          </div>
        ) : null}

        <canvas
          ref={canvasRef}
          className="h-full w-full touch-none"
          style={{ cursor }}
          onPointerDown={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const localX = event.clientX - rect.left;
            const localY = event.clientY - rect.top;
            const mode = interactionModeForPoint(localX, localY, size.width, size.height);
            if (mode === "none") {
              return;
            }

            dragRef.current = { x: event.clientX, y: event.clientY, mode };
            setActiveMode(mode);
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const localX = event.clientX - rect.left;
            const localY = event.clientY - rect.top;

            if (!dragRef.current) {
              setHoverMode(interactionModeForPoint(localX, localY, size.width, size.height));
              return;
            }

            const drag = dragRef.current;
            const deltaX = event.clientX - drag.x;
            const deltaY = event.clientY - drag.y;
            dragRef.current = { ...drag, x: event.clientX, y: event.clientY };

            if (drag.mode === "pan") {
              setViewport((current) =>
                panViewport(
                  current,
                  deltaX,
                  deltaY,
                  { width: size.width, height: size.height },
                  MAIN_PLOT_PADDING,
                ),
              );
              return;
            }

            if (drag.mode === "scale-x") {
              setViewport((current) => scaleViewportAxis(current, "x", Math.exp(deltaX * 0.01)));
              return;
            }

            if (drag.mode === "scale-y") {
              setViewport((current) => scaleViewportAxis(current, "y", Math.exp(deltaY * 0.01)));
            }
          }}
          onPointerUp={(event) => {
            dragRef.current = null;
            setActiveMode("none");
            setHoverMode("none");
            event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerLeave={() => {
            dragRef.current = null;
            setActiveMode("none");
            setHoverMode("none");
          }}
        />
      </div>
    </section>
  );
}
