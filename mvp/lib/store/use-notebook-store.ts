"use client";

import { create } from "zustand";

import { evaluateNotebook } from "@/lib/runtime/evaluator";
import { createRngContext } from "@/lib/runtime/rng";
import type {
  CellDisplayOptions,
  NotebookCell,
  NotebookEvaluation,
  SliderConfig,
  ToolbarState,
  Viewport,
} from "@/lib/runtime/types";
import { computeDefaultViewport } from "@/lib/utils/plotting";

const STORAGE_KEY = "stochastic-plotter-state-v1";

const defaultDisplay = (color: string): CellDisplayOptions => ({
  visible: true,
  showPaths: true,
  showMean: false,
  showVariance: false,
  sampleCount: 24,
  color,
  colorMode: "viridis",
});

const defaultSlider = (value = 1): SliderConfig => ({
  enabled: true,
  min: Math.floor(value - 2),
  max: Math.ceil(value + 2),
  step: 0.1,
});

function makeCell(id: string, source: string, color: string, slider = defaultSlider()) {
  return {
    id,
    source,
    display: defaultDisplay(color),
    slider,
  } satisfies NotebookCell;
}

export const PRESET_CELLS = [
  { label: "Brownian motion", source: "B_t = Brownian()", color: "#2563eb" },
  {
    label: "Geometric Brownian",
    source: "S_t = GeometricBrownian(mu, sigma, x0)",
    color: "#f97316",
  },
  {
    label: "Ornstein-Uhlenbeck",
    source: "X_t = OrnsteinUhlenbeck(theta, m, sigma, x0)",
    color: "#14b8a6",
  },
  { label: "Poisson", source: "N_t = Poisson(lambda)", color: "#a855f7" },
];

function initialCells() {
  return [
    makeCell("cell-mu", "mu = 0.12", "#1d4ed8", defaultSlider(0.12)),
    makeCell("cell-sigma", "sigma = 0.3", "#7c3aed", defaultSlider(0.3)),
    makeCell("cell-x0", "x0 = 1", "#f97316", defaultSlider(1)),
    makeCell("cell-f", "f(t) = t^2", "#16a34a", {
      enabled: false,
      min: 0,
      max: 1,
      step: 0.1,
    }),
    makeCell("cell-b", "B_t = Brownian()", "#2563eb", {
      enabled: false,
      min: 0,
      max: 1,
      step: 0.1,
    }),
    makeCell("cell-y", "Y_t = exp(mu * t + sigma * B_t)", "#ea580c", {
      enabled: false,
      min: 0,
      max: 1,
      step: 0.1,
    }),
  ];
}

function initialToolbar(): ToolbarState {
  return {
    seed: 7,
    tMin: 0,
    tMax: 1,
    points: 160,
    distributionPanel: true,
  };
}

type NotebookState = {
  cells: NotebookCell[];
  toolbar: ToolbarState;
  viewport: Viewport;
  hoveredCellId: string | null;
  rngVersion: number;
  evaluation: NotebookEvaluation;
  hydrate: () => void;
  recompute: () => void;
  resample: () => void;
  setSeed: (seed: number) => void;
  setGridValue: (key: keyof ToolbarState, value: number | boolean) => void;
  setViewport: (viewport: Viewport | ((current: Viewport) => Viewport)) => void;
  setHoveredCellId: (cellId: string | null) => void;
  resetViewport: () => void;
  updateCellSource: (cellId: string, source: string) => void;
  updateDisplay: (cellId: string, patch: Partial<CellDisplayOptions>) => void;
  updateSlider: (cellId: string, patch: Partial<SliderConfig>) => void;
  addCell: (source?: string) => void;
  addPreset: (source: string, color: string) => void;
  moveCell: (activeId: string, overId: string) => void;
  removeCell: (cellId: string) => void;
};

function computeEvaluation(cells: NotebookCell[], toolbar: ToolbarState, rngVersion: number) {
  return evaluateNotebook(
    cells,
    {
      tMin: toolbar.tMin,
      tMax: toolbar.tMax,
      points: toolbar.points,
    },
    createRngContext(toolbar.seed, rngVersion),
  );
}

function persist(
  cells: NotebookCell[],
  toolbar: ToolbarState,
  rngVersion: number,
  viewport: Viewport,
) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      cells,
      toolbar,
      viewport,
      rngVersion,
    }),
  );
}

const fallbackCells = initialCells();
const fallbackToolbar = initialToolbar();
const fallbackEvaluation = computeEvaluation(fallbackCells, fallbackToolbar, 0);
const fallbackViewport = computeDefaultViewport(
  fallbackCells,
  fallbackEvaluation,
  fallbackToolbar,
);

function moveItem<T extends { id: string }>(items: T[], activeId: string, overId: string) {
  const fromIndex = items.findIndex((item) => item.id === activeId);
  const toIndex = items.findIndex((item) => item.id === overId);

  if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
    return items;
  }

  const next = [...items];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

export const useNotebookStore = create<NotebookState>((set, get) => ({
  cells: fallbackCells,
  toolbar: fallbackToolbar,
  viewport: fallbackViewport,
  hoveredCellId: null,
  rngVersion: 0,
  evaluation: fallbackEvaluation,
  hydrate: () => {
    if (typeof window === "undefined") {
      return;
    }

    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw) as {
        cells?: NotebookCell[];
        toolbar?: ToolbarState;
        viewport?: Viewport;
        rngVersion?: number;
      };
      const cells = parsed.cells?.length
        ? parsed.cells.map((cell) => ({
            ...cell,
            display: {
              ...defaultDisplay(cell.display?.color ?? "#2563eb"),
              ...cell.display,
            },
            slider: {
              ...defaultSlider(),
              ...cell.slider,
            },
          }))
        : fallbackCells;
      const toolbar = parsed.toolbar ?? fallbackToolbar;
      const rngVersion = parsed.rngVersion ?? 0;
      const evaluation = computeEvaluation(cells, toolbar, rngVersion);
      set({
        cells,
        toolbar,
        viewport:
          parsed.viewport ?? computeDefaultViewport(cells, evaluation, toolbar),
        rngVersion,
        evaluation,
      });
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  },
  recompute: () => {
    const { cells, toolbar, rngVersion, viewport } = get();
    const evaluation = computeEvaluation(cells, toolbar, rngVersion);
    persist(cells, toolbar, rngVersion, viewport);
    set({ evaluation });
  },
  resample: () => {
    const { cells, toolbar, rngVersion, viewport } = get();
    const nextVersion = rngVersion + 1;
    const evaluation = computeEvaluation(cells, toolbar, nextVersion);
    persist(cells, toolbar, nextVersion, viewport);
    set({
      rngVersion: nextVersion,
      evaluation,
      viewport,
    });
  },
  setSeed: (seed) => {
    const { cells, toolbar, rngVersion, viewport } = get();
    const nextToolbar = { ...toolbar, seed };
    const evaluation = computeEvaluation(cells, nextToolbar, rngVersion);
    persist(cells, nextToolbar, rngVersion, viewport);
    set({
      toolbar: nextToolbar,
      evaluation,
      viewport,
    });
  },
  setGridValue: (key, value) => {
    const { cells, toolbar, rngVersion, viewport } = get();
    const nextToolbar = { ...toolbar, [key]: value };
    const evaluation = computeEvaluation(cells, nextToolbar, rngVersion);
    const nextViewport =
      key === "distributionPanel"
        ? viewport
        : computeDefaultViewport(cells, evaluation, nextToolbar);
    persist(cells, nextToolbar, rngVersion, nextViewport);
    set({
      toolbar: nextToolbar,
      evaluation,
      viewport: nextViewport,
    });
  },
  setViewport: (viewport) => {
    const nextViewport =
      typeof viewport === "function" ? viewport(get().viewport) : viewport;
    set({ viewport: nextViewport });
    const { cells, toolbar, rngVersion } = get();
    persist(cells, toolbar, rngVersion, nextViewport);
  },
  setHoveredCellId: (cellId) => {
    set({ hoveredCellId: cellId });
  },
  resetViewport: () => {
    const { cells, toolbar, rngVersion, evaluation } = get();
    const viewport = computeDefaultViewport(cells, evaluation, toolbar);
    persist(cells, toolbar, rngVersion, viewport);
    set({ viewport });
  },
  updateCellSource: (cellId, source) => {
    const { cells, toolbar, rngVersion, viewport } = get();
    const nextCells = cells.map((cell) => (cell.id === cellId ? { ...cell, source } : cell));
    const evaluation = computeEvaluation(nextCells, toolbar, rngVersion);
    persist(nextCells, toolbar, rngVersion, viewport);
    set({
      cells: nextCells,
      evaluation,
      viewport,
    });
  },
  updateDisplay: (cellId, patch) => {
    const { cells, toolbar, rngVersion, viewport } = get();
    const nextCells = cells.map((cell) =>
      cell.id === cellId ? { ...cell, display: { ...cell.display, ...patch } } : cell,
    );
    const evaluation = computeEvaluation(nextCells, toolbar, rngVersion);
    persist(nextCells, toolbar, rngVersion, viewport);
    set({ cells: nextCells, evaluation, viewport });
  },
  updateSlider: (cellId, patch) => {
    const { cells, toolbar, rngVersion, viewport } = get();
    const nextCells = cells.map((cell) =>
      cell.id === cellId ? { ...cell, slider: { ...cell.slider, ...patch } } : cell,
    );
    persist(nextCells, toolbar, rngVersion, viewport);
    set({ cells: nextCells });
  },
  addCell: (source = "X_t = Brownian()") => {
    const { cells, toolbar, rngVersion, viewport } = get();
    const id = `cell-${Math.random().toString(36).slice(2, 8)}`;
    const palette = ["#2563eb", "#f97316", "#16a34a", "#a855f7", "#0891b2"];
    const nextCells = [...cells, makeCell(id, source, palette[cells.length % palette.length])];
    const evaluation = computeEvaluation(nextCells, toolbar, rngVersion);
    persist(nextCells, toolbar, rngVersion, viewport);
    set({
      cells: nextCells,
      evaluation,
      viewport,
    });
  },
  addPreset: (source, color) => {
    const { cells, toolbar, rngVersion, viewport } = get();
    const id = `cell-${Math.random().toString(36).slice(2, 8)}`;
    const nextCells = [...cells, makeCell(id, source, color)];
    const evaluation = computeEvaluation(nextCells, toolbar, rngVersion);
    persist(nextCells, toolbar, rngVersion, viewport);
    set({
      cells: nextCells,
      evaluation,
      viewport,
    });
  },
  moveCell: (activeId, overId) => {
    const { cells, toolbar, rngVersion, viewport } = get();
    const nextCells = moveItem(cells, activeId, overId);
    const evaluation = computeEvaluation(nextCells, toolbar, rngVersion);
    persist(nextCells, toolbar, rngVersion, viewport);
    set({ cells: nextCells, evaluation, viewport });
  },
  removeCell: (cellId) => {
    const { cells, toolbar, rngVersion } = get();
    const nextCells = cells.filter((cell) => cell.id !== cellId);
    const evaluation = computeEvaluation(nextCells, toolbar, rngVersion);
    const viewport = computeDefaultViewport(nextCells, evaluation, toolbar);
    persist(nextCells, toolbar, rngVersion, viewport);
    set({
      cells: nextCells,
      evaluation,
      viewport,
    });
  },
}));
