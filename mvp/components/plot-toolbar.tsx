"use client";

import { useNotebookStore } from "@/lib/store/use-notebook-store";

export function PlotToolbar() {
  const toolbar = useNotebookStore((state) => state.toolbar);
  const resample = useNotebookStore((state) => state.resample);
  const setSeed = useNotebookStore((state) => state.setSeed);
  const setGridValue = useNotebookStore((state) => state.setGridValue);
  const resetViewport = useNotebookStore((state) => state.resetViewport);

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-stone-200 px-3 py-2 text-sm">
      <button
        type="button"
        onClick={resample}
        className="border border-stone-300 px-3 py-1.5 text-stone-900"
      >
        Resample
      </button>
      <button
        type="button"
        onClick={resetViewport}
        className="border border-stone-300 px-3 py-1.5 text-stone-900"
      >
        Reset view
      </button>
      <button
        type="button"
        onClick={() => setGridValue("distributionPanel", !toolbar.distributionPanel)}
        className="border border-stone-300 px-3 py-1.5 text-stone-900"
      >
        {toolbar.distributionPanel ? "Hide distribution" : "Show distribution"}
      </button>

      <label className="ml-2 flex items-center gap-2 border border-stone-300 px-2 py-1.5">
        <span className="text-stone-600">Seed</span>
        <input
          type="number"
          value={toolbar.seed}
          onChange={(event) => setSeed(Number(event.target.value) || 0)}
          className="w-20 bg-transparent outline-none"
        />
      </label>
      <label className="flex items-center gap-2 border border-stone-300 px-2 py-1.5">
        <span className="text-stone-600">t min</span>
        <input
          type="number"
          step={0.1}
          value={toolbar.tMin}
          onChange={(event) => setGridValue("tMin", Number(event.target.value))}
          className="w-16 bg-transparent outline-none"
        />
      </label>
      <label className="flex items-center gap-2 border border-stone-300 px-2 py-1.5">
        <span className="text-stone-600">t max</span>
        <input
          type="number"
          step={0.1}
          value={toolbar.tMax}
          onChange={(event) => setGridValue("tMax", Number(event.target.value))}
          className="w-16 bg-transparent outline-none"
        />
      </label>
      <label className="flex items-center gap-2 border border-stone-300 px-2 py-1.5">
        <span className="text-stone-600">Points</span>
        <input
          type="number"
          min={40}
          max={500}
          value={toolbar.points}
          onChange={(event) => setGridValue("points", Number(event.target.value) || 160)}
          className="w-16 bg-transparent outline-none"
        />
      </label>
    </div>
  );
}
