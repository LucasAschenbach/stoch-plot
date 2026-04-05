"use client";

import { useEffect, useMemo } from "react";

import { CellSidebar } from "@/components/sidebar";
import { DistributionPanel } from "@/components/distribution-panel";
import { PlotToolbar } from "@/components/plot-toolbar";
import { MainPlot } from "@/components/main-plot";
import { useNotebookStore } from "@/lib/store/use-notebook-store";

export function NotebookApp() {
  const hydrate = useNotebookStore((state) => state.hydrate);
  const toolbar = useNotebookStore((state) => state.toolbar);
  const cells = useNotebookStore((state) => state.cells);
  const evaluation = useNotebookStore((state) => state.evaluation);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const visibleValues = useMemo(
    () =>
      cells
        .filter((cell) => cell.display.visible)
        .map((cell) => ({
          cell,
          record: evaluation.records[cell.id],
        })),
    [cells, evaluation.records],
  );

  return (
    <div className="h-screen bg-white text-stone-900">
      <div className="flex h-full">
        <CellSidebar />
        <main className="flex min-w-0 flex-1 flex-col">
          <PlotToolbar />
          <div className="flex min-h-0 flex-1">
            <MainPlot items={visibleValues} />
            {toolbar.distributionPanel ? <DistributionPanel items={visibleValues} /> : null}
          </div>
        </main>
      </div>
    </div>
  );
}
