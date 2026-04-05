"use client";

import { useMemo, useState } from "react";
import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { PROCESS_DEFINITIONS } from "@/lib/runtime/processes";
import type { NotebookCell, RuntimeValue } from "@/lib/runtime/types";
import { useNotebookStore } from "@/lib/store/use-notebook-store";
import { COLOR_MODES } from "@/lib/utils/color";

function formatNumber(value: number) {
  if (Number.isInteger(value)) {
    return String(value);
  }

  return value.toFixed(3).replace(/\.?0+$/, "");
}

function inferName(source: string) {
  return source.split("=")[0]?.trim() || "value";
}

function sliderValueFromCell(recordValue?: RuntimeValue) {
  return recordValue?.type === "number" ? recordValue.value : undefined;
}

function EyeIcon({ hidden = false }: { hidden?: boolean }) {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M1.5 10s3-5.5 8.5-5.5S18.5 10 18.5 10 15.5 15.5 10 15.5 1.5 10 1.5 10Z" />
      <circle cx="10" cy="10" r="2.5" />
      {hidden ? <path d="M3 17 17 3" /> : null}
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4.5 6.5h11" />
      <path d="M7.5 6.5V4.8c0-.7.6-1.3 1.3-1.3h2.4c.7 0 1.3.6 1.3 1.3v1.7" />
      <path d="M6.5 6.5l.7 9c.1.6.5 1 1.1 1h3.4c.6 0 1-.4 1.1-1l.7-9" />
    </svg>
  );
}

function MoreIcon({ open = false }: { open?: boolean }) {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d={open ? "m5 12 5-5 5 5" : "m5 8 5 5 5-5"} />
    </svg>
  );
}

function PathsIcon({ hidden = false }: { hidden?: boolean }) {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2.5 13.5c2-6 4.5-6 7-3s4.5 3 8-3" />
      {hidden ? <path d="M3 17 17 3" /> : null}
    </svg>
  );
}

function SwatchIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3.5" y="3.5" width="13" height="13" rx="2" />
      <path d="M6.5 13.5 9 11l2 2 3.5-4.5" />
    </svg>
  );
}

function IconButton({
  label,
  active = false,
  children,
  onClick,
}: {
  label: string;
  active?: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
      className={`flex h-7 w-7 items-center justify-center border ${
        active ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 text-stone-700"
      }`}
    >
      {children}
    </button>
  );
}

function DocsModal({ onClose }: { onClose: () => void }) {
  const definitions = useMemo(
    () => Array.from(PROCESS_DEFINITIONS.values()).sort((left, right) => left.name.localeCompare(right.name)),
    [],
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/25 p-6">
      <div className="w-full max-w-xl border border-stone-300 bg-white">
        <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
          <h2 className="text-sm font-medium">Supported stochastic processes</h2>
          <button
            type="button"
            onClick={onClose}
            className="border border-stone-300 px-2 py-1 text-xs"
          >
            Close
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto">
          {definitions.map((definition) => {
            const signature = `${definition.name}(${definition.parameters.join(", ")})`;
            return (
              <div key={definition.name} className="border-b border-stone-200 px-4 py-3 text-sm">
                <div className="font-medium text-stone-900">{definition.name}</div>
                <div className="mt-1 font-mono text-xs text-stone-600">{signature}</div>
                <div className="mt-1 text-xs text-stone-500">
                  Example: X_t = {signature}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SortableCellRow({ cell }: { cell: NotebookCell }) {
  const [expanded, setExpanded] = useState(false);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: cell.id });
  const record = useNotebookStore((state) => state.evaluation.records[cell.id]);
  const updateCellSource = useNotebookStore((state) => state.updateCellSource);
  const updateDisplay = useNotebookStore((state) => state.updateDisplay);
  const updateSlider = useNotebookStore((state) => state.updateSlider);
  const removeCell = useNotebookStore((state) => state.removeCell);

  const sliderValue = sliderValueFromCell(record?.value);
  const isConstant = record?.kind === "constant" && sliderValue !== undefined;
  const canPlot =
    record?.kind === "function" || record?.kind === "process" || record?.kind === "derived";
  const isProcess = record?.value?.type === "process";

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.7 : 1,
      }}
      className={`border-b border-stone-200 px-2 py-2 ${
        cell.display.visible ? "bg-white" : "bg-stone-50"
      } ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
      {...attributes}
      {...listeners}
    >
      <input
        value={cell.source}
        onChange={(event) => updateCellSource(cell.id, event.target.value)}
        className="w-full cursor-text bg-transparent text-sm outline-none"
        spellCheck={false}
        onPointerDown={(event) => {
          event.stopPropagation();
        }}
      />

      {record?.error ? (
        <div className="mt-1 text-xs text-rose-700">{record.error}</div>
      ) : null}

      {record?.value?.type === "number" ? (
        <div className="mt-1 text-xs text-stone-500">{formatNumber(record.value.value)}</div>
      ) : null}

      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-1">
          {canPlot ? (
            <IconButton
              label={cell.display.visible ? "Hide from plot" : "Show on plot"}
              onClick={() => updateDisplay(cell.id, { visible: !cell.display.visible })}
            >
              <EyeIcon hidden={!cell.display.visible} />
            </IconButton>
          ) : null}
          <IconButton
            label={expanded ? "Collapse options" : "Expand options"}
            onClick={() => setExpanded((current) => !current)}
          >
            <MoreIcon open={expanded} />
          </IconButton>
          <IconButton label="Delete cell" onClick={() => removeCell(cell.id)}>
            <TrashIcon />
          </IconButton>
        </div>

        {isProcess ? (
          <div className="flex items-center gap-1">
            <IconButton
              label="Toggle mean"
              active={cell.display.showMean}
              onClick={() => updateDisplay(cell.id, { showMean: !cell.display.showMean })}
            >
              <span className="text-[11px] font-medium">μ</span>
            </IconButton>
            <IconButton
              label="Toggle variance"
              active={cell.display.showVariance}
              onClick={() =>
                updateDisplay(cell.id, { showVariance: !cell.display.showVariance })
              }
            >
              <span className="text-[10px] font-medium">σ²</span>
            </IconButton>
            <div className="flex h-7 items-center border border-stone-300 text-stone-700">
              <button
                type="button"
                title={cell.display.showPaths ? "Hide sampled paths" : "Show sampled paths"}
                aria-label={cell.display.showPaths ? "Hide sampled paths" : "Show sampled paths"}
                onClick={() =>
                  updateDisplay(cell.id, { showPaths: !cell.display.showPaths })
                }
                onPointerDown={(event) => {
                  event.stopPropagation();
                }}
                className={`flex h-full w-7 items-center justify-center border-r ${
                  cell.display.showPaths ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300"
                }`}
              >
                <PathsIcon hidden={!cell.display.showPaths} />
              </button>
              <input
                type="number"
                min={1}
                max={120}
                value={cell.display.sampleCount}
                onChange={(event) =>
                  updateDisplay(cell.id, {
                    sampleCount: Number(event.target.value) || 1,
                  })
                }
                onPointerDown={(event) => {
                  event.stopPropagation();
                }}
                className="w-10 bg-transparent px-1 text-center text-[11px] outline-none"
                title="Sample count"
                aria-label="Sample count"
              />
            </div>
          </div>
        ) : null}
      </div>

      {expanded ? (
        <div className="mt-2 space-y-2 border-t border-stone-200 pt-2">
          {isProcess ? (
            <div
              className="flex flex-wrap items-center gap-2 text-xs"
              onPointerDown={(event) => {
                event.stopPropagation();
              }}
            >
              <label className="flex items-center gap-1 border border-stone-300 px-2 py-1">
                <SwatchIcon />
                <input
                  type="color"
                  value={cell.display.color}
                  onChange={(event) => updateDisplay(cell.id, { color: event.target.value })}
                  className="h-4 w-4 border-0 bg-transparent p-0"
                />
              </label>
              <label className="flex items-center gap-1 border border-stone-300 px-2 py-1">
                <select
                  value={cell.display.colorMode}
                  onChange={(event) =>
                    updateDisplay(cell.id, {
                      colorMode: event.target.value as NotebookCell["display"]["colorMode"],
                    })
                  }
                  className="bg-transparent outline-none"
                >
                  {COLOR_MODES.map((mode) => (
                    <option key={mode.value} value={mode.value}>
                      {mode.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}

          {isConstant ? (
            <div
              className="space-y-2"
              onPointerDown={(event) => {
                event.stopPropagation();
              }}
            >
              <input
                type="range"
                min={cell.slider.min}
                max={cell.slider.max}
                step={cell.slider.step}
                value={sliderValue}
                onChange={(event) =>
                  updateCellSource(
                    cell.id,
                    `${inferName(cell.source)} = ${formatNumber(Number(event.target.value))}`,
                  )
                }
                className="w-full accent-stone-900"
              />
              <div className="grid grid-cols-3 gap-2 text-xs">
                <label className="border border-stone-300 px-2 py-1">
                  <span className="block text-[10px] text-stone-500">Min</span>
                  <input
                    type="number"
                    value={cell.slider.min}
                    onChange={(event) =>
                      updateSlider(cell.id, { min: Number(event.target.value) })
                    }
                    className="w-full bg-transparent outline-none"
                  />
                </label>
                <label className="border border-stone-300 px-2 py-1">
                  <span className="block text-[10px] text-stone-500">Max</span>
                  <input
                    type="number"
                    value={cell.slider.max}
                    onChange={(event) =>
                      updateSlider(cell.id, { max: Number(event.target.value) })
                    }
                    className="w-full bg-transparent outline-none"
                  />
                </label>
                <label className="border border-stone-300 px-2 py-1">
                  <span className="block text-[10px] text-stone-500">Step</span>
                  <input
                    type="number"
                    value={cell.slider.step}
                    onChange={(event) =>
                      updateSlider(cell.id, {
                        step: Number(event.target.value) || 0.1,
                      })
                    }
                    className="w-full bg-transparent outline-none"
                  />
                </label>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function CellSidebar() {
  const [showDocs, setShowDocs] = useState(false);
  const cells = useNotebookStore((state) => state.cells);
  const addCell = useNotebookStore((state) => state.addCell);
  const moveCell = useNotebookStore((state) => state.moveCell);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    if (!event.over || event.active.id === event.over.id) {
      return;
    }

    moveCell(String(event.active.id), String(event.over.id));
  };

  return (
    <>
      <aside className="relative flex h-full w-[360px] shrink-0 flex-col border-r border-stone-200 bg-white">
        <div className="border-b border-stone-200 p-2">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => addCell("X_t = Brownian()")}
              className="border border-stone-300 px-3 py-1.5 text-sm"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => setShowDocs(true)}
              className="border border-stone-300 px-3 py-1.5 text-sm"
            >
              Docs
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={cells.map((cell) => cell.id)}
              strategy={verticalListSortingStrategy}
            >
              {cells.map((cell) => (
                <SortableCellRow key={cell.id} cell={cell} />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      </aside>
      {showDocs ? <DocsModal onClose={() => setShowDocs(false)} /> : null}
    </>
  );
}
