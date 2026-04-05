"use client";

import { useEffect, useMemo, useRef } from "react";

import { defaultEndpointDensityRange } from "@/lib/runtime/processes";
import { endpointLawExpectation } from "@/lib/runtime/endpoint-laws";
import type { EvaluationRecord, NotebookCell, RuntimeValue } from "@/lib/runtime/types";
import {
  buildHistogram,
  configureCanvas,
  DIST_PLOT_PADDING,
  generateTicks,
  getPlotArea,
  worldToScreenY,
} from "@/lib/utils/plotting";
import { useElementSize } from "@/lib/utils/use-element-size";
import { useNotebookStore } from "@/lib/store/use-notebook-store";
import { withAlpha } from "@/lib/utils/color";

type PlotItem = {
  cell: NotebookCell;
  record?: EvaluationRecord;
};

export function DistributionPanel({ items }: { items: PlotItem[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewport = useNotebookStore((state) => state.viewport);
  const hoveredCellId = useNotebookStore((state) => state.hoveredCellId);
  const size = useElementSize(containerRef);

  const chartData = useMemo(
    () => {
      const mapped = items.map(({ cell, record }) => ({
        cell,
        record,
        process: record?.value?.type === "process" ? record.value : null,
      }));

      return mapped.filter(
        (
          item,
        ): item is {
          cell: NotebookCell;
          record: EvaluationRecord | undefined;
          process: Extract<RuntimeValue, { type: "process" }>;
        } => Boolean(item.process),
      );
    },
    [items],
  );

  const densityY = useMemo(
    () => defaultEndpointDensityRange(viewport.yMin, viewport.yMax),
    [viewport.yMax, viewport.yMin],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.width < 10 || size.height < 10) {
      return;
    }

    const context = configureCanvas(canvas, size.width, size.height);
    if (!context) {
      return;
    }

    const styles = getComputedStyle(document.documentElement);
    const background = styles.getPropertyValue("--background").trim() || "#ffffff";
    const border = styles.getPropertyValue("--border").trim() || "#e5e7eb";
    const foreground = styles.getPropertyValue("--foreground").trim() || "#111827";

    context.clearRect(0, 0, size.width, size.height);
    context.fillStyle = background;
    context.fillRect(0, 0, size.width, size.height);

    const plot = getPlotArea({ width: size.width, height: size.height }, DIST_PLOT_PADDING);
    const yTicks = generateTicks(viewport.yMin, viewport.yMax);

    context.strokeStyle = border;
    context.lineWidth = 1;
    yTicks.forEach((tick) => {
      const y = worldToScreenY(
        tick,
        viewport,
        { width: size.width, height: size.height },
        DIST_PLOT_PADDING,
      );
      context.beginPath();
      context.moveTo(plot.x, y);
      context.lineTo(plot.x + plot.width, y);
      context.stroke();
    });

    const histograms = chartData.map(({ process }) =>
      buildHistogram(process.endpoints, viewport.yMin, viewport.yMax, 18),
    );
    const densities = chartData.map(({ process, record }) =>
      record?.kind === "derived" || !process.stats?.endpointDensity
        ? process.endpointLaw?.density(densityY) ?? []
        : process.stats.endpointDensity(densityY, process.times.at(-1) ?? 1),
    );
    const maxPanelDensity = Math.max(
      1e-9,
      ...histograms.flatMap((bins) => bins.map((bin) => bin.density)),
      ...densities.flatMap((density) => density),
    );

    chartData.forEach(({ cell, process }, seriesIndex) => {
      const histogram = histograms[seriesIndex];
      const density = densities[seriesIndex];
      const dimmed = hoveredCellId !== null && hoveredCellId !== cell.id;
      const emphasis = hoveredCellId === cell.id;

      histogram.forEach((bin) => {
        const y0 = worldToScreenY(
          bin.start,
          viewport,
          { width: size.width, height: size.height },
          DIST_PLOT_PADDING,
        );
        const y1 = worldToScreenY(
          bin.end,
          viewport,
          { width: size.width, height: size.height },
          DIST_PLOT_PADDING,
        );
        const width = (bin.density / maxPanelDensity) * plot.width;
        context.fillStyle = withAlpha(cell.display.color, dimmed ? 0.12 : emphasis ? 0.55 : 0.35);
        context.fillRect(plot.x, y1, width, Math.max(y0 - y1 - 1, 1));
      });

      if (density?.length) {
        context.beginPath();
        density.forEach((value, index) => {
          const x = plot.x + (value / maxPanelDensity) * plot.width;
          const y = worldToScreenY(
            densityY[index],
            viewport,
            { width: size.width, height: size.height },
            DIST_PLOT_PADDING,
          );
          if (index === 0) {
            context.moveTo(x, y);
          } else {
            context.lineTo(x, y);
          }
        });
        context.strokeStyle = cell.display.color;
        context.lineWidth = emphasis ? 2.2 : 1.5;
        context.globalAlpha = dimmed ? 0.2 : 1;
        context.stroke();
        context.globalAlpha = 1;
      }

      const expectation =
        process.stats?.endpointExpectation?.(process.times.at(-1) ?? 1) ??
        endpointLawExpectation(process.endpointLaw);
      if (expectation !== undefined) {
        const y = worldToScreenY(
          expectation,
          viewport,
          { width: size.width, height: size.height },
          DIST_PLOT_PADDING,
        );
        context.save();
        context.setLineDash([6, 4]);
        context.beginPath();
        context.moveTo(plot.x, y);
        context.lineTo(plot.x + plot.width, y);
        context.strokeStyle = cell.display.color;
        context.lineWidth = emphasis ? 1.8 : 1.2;
        context.globalAlpha = dimmed ? 0.24 : 1;
        context.stroke();
        context.restore();
      }
    });

    context.strokeStyle = foreground;
    context.lineWidth = 1;
    context.strokeRect(plot.x, plot.y, plot.width, plot.height);
  }, [chartData, densityY, hoveredCellId, size.height, size.width, viewport]);

  return (
    <aside className="h-full w-[320px] shrink-0 border-l border-border bg-background">
      <div ref={containerRef} className="h-full w-full">
        <canvas ref={canvasRef} className="h-full w-full" />
      </div>
    </aside>
  );
}
