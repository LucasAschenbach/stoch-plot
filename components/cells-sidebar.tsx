"use client"

import { useLayoutEffect, useMemo, useRef, useState } from "react"
import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { HelpCircle, Plus } from "lucide-react"

import { FunctionCell } from "@/components/function-cell"
import { ParameterCell } from "@/components/parameter-cell"
import { SDECell } from "@/components/sde-cell"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { SCALAR_FUNCTIONS } from "@/lib/runtime/math"
import { PROCESS_DEFINITIONS } from "@/lib/runtime/processes"
import type { NotebookCell, RuntimeValue } from "@/lib/runtime/types"
import { useNotebookStore } from "@/lib/store/use-notebook-store"
import { representativeColor } from "@/lib/utils/color"

function formatNumber(value: number) {
  if (Number.isInteger(value)) {
    return String(value)
  }

  return value.toFixed(3).replace(/\.?0+$/, "")
}

function inferName(source: string) {
  return source.split("=")[0]?.trim() || "value"
}

function sliderValueFromCell(recordValue?: RuntimeValue) {
  return recordValue?.type === "number" ? recordValue.value : undefined
}

function fallbackKindForSource(source: string) {
  const leftSide = source.split("=")[0]?.trim() ?? ""
  if (leftSide.endsWith("_t")) {
    return "process"
  }
  if (leftSide.includes("(") && leftSide.includes(")")) {
    return "function"
  }
  return "constant"
}

function processColorPatch(mode: NotebookCell["display"]["colorMode"], fallback: string) {
  return {
    colorMode: mode,
    color: representativeColor(mode, fallback),
  }
}

function DocsModalContent() {
  const processes = useMemo(
    () =>
      Array.from(PROCESS_DEFINITIONS.values()).sort((left, right) =>
        left.name.localeCompare(right.name),
      ),
    [],
  )

  return (
    <>
      <DialogHeader>
        <DialogTitle>Notebook Reference</DialogTitle>
        <DialogDescription>
          Supported syntax for constants, scalar functions, stochastic processes, and Itô-style SDEs.
        </DialogDescription>
      </DialogHeader>
      <ScrollArea className="h-[50vh] pr-4">
        <div className="space-y-6 text-sm">
          <section>
            <h3 className="font-semibold mb-2">Assignments</h3>
            <div className="space-y-1 text-muted-foreground">
              <p><code className="bg-muted px-1 rounded">mu = 0.12</code> defines a numeric constant.</p>
              <p><code className="bg-muted px-1 rounded">X_0 = 1</code> defines an initial condition for <code className="bg-muted px-1 rounded">X_t</code>.</p>
              <p><code className="bg-muted px-1 rounded">f(t) = t^2</code> defines a scalar function of one variable.</p>
              <p><code className="bg-muted px-1 rounded">B_t = Brownian()</code> defines a stochastic process.</p>
              <p><code className="bg-muted px-1 rounded">Y_t = exp(mu * t + sigma * B_t)</code> defines a derived process.</p>
              <p><code className="bg-muted px-1 rounded">dX_t = mu(t, X_t) * dt + sigma(t, X_t) * dB_t</code> defines an Itô SDE.</p>
            </div>
          </section>

          <section>
            <h3 className="font-semibold mb-2">Built-in Processes</h3>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              {processes.map((definition) => (
                <li key={definition.name}>
                  <code className="bg-muted px-1 rounded">
                    {definition.name}({definition.parameters.join(", ")})
                  </code>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h3 className="font-semibold mb-2">Scalar Functions</h3>
            <p className="text-muted-foreground">
              {Object.keys(SCALAR_FUNCTIONS).join(", ")}
            </p>
          </section>

          <section>
            <h3 className="font-semibold mb-2">Operators</h3>
            <p className="text-muted-foreground">
              Supported operators: <code className="bg-muted px-1 rounded">+</code>,{" "}
              <code className="bg-muted px-1 rounded">-</code>,{" "}
              <code className="bg-muted px-1 rounded">*</code>,{" "}
              <code className="bg-muted px-1 rounded">/</code>,{" "}
              <code className="bg-muted px-1 rounded">^</code>, and parentheses.
            </p>
          </section>

          <section>
            <h3 className="font-semibold mb-2">Stochastic Calculus</h3>
            <div className="space-y-1 text-muted-foreground">
              <p><code className="bg-muted px-1 rounded">integral(X_t * dt)</code> builds a cumulative time integral.</p>
              <p><code className="bg-muted px-1 rounded">integral(sigma(t, X_t) * dB_t)</code> builds an Itô integral on the current grid.</p>
              <p><code className="bg-muted px-1 rounded">qv(B_t)</code> and <code className="bg-muted px-1 rounded">qv(X_t, Y_t)</code> build quadratic variation and covariation.</p>
              <p><code className="bg-muted px-1 rounded">B_t[f(t)]</code> and <code className="bg-muted px-1 rounded">{"B_{f(t)}"}</code> apply monotone time changes.</p>
            </div>
          </section>

          <section>
            <h3 className="font-semibold mb-2">Notes</h3>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>Process cells should use names ending in <code className="bg-muted px-1 rounded">_t</code>.</li>
              <li><code className="bg-muted px-1 rounded">dt</code> and <code className="bg-muted px-1 rounded">dX_t</code> are only valid inside <code className="bg-muted px-1 rounded">integral(...)</code> or on the right-hand side of <code className="bg-muted px-1 rounded">dY_t = ...</code>.</li>
              <li>Constants can be adjusted with the inline slider controls shown on constant cells.</li>
              <li>The histogram panel shows endpoint histograms and analytic endpoint densities when available.</li>
            </ul>
          </section>
        </div>
      </ScrollArea>
    </>
  )
}

function SortableCellRow({ cell }: { cell: NotebookCell }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: cell.id })
  const record = useNotebookStore((state) => state.evaluation.records[cell.id])
  const hoveredCellId = useNotebookStore((state) => state.hoveredCellId)
  const setHoveredCellId = useNotebookStore((state) => state.setHoveredCellId)
  const updateCellSource = useNotebookStore((state) => state.updateCellSource)
  const updateDisplay = useNotebookStore((state) => state.updateDisplay)
  const updateSlider = useNotebookStore((state) => state.updateSlider)
  const removeCell = useNotebookStore((state) => state.removeCell)
  const sourceInputRef = useRef<HTMLInputElement>(null)
  const pendingSelectionRef = useRef<{ start: number; end: number } | null>(null)

  const fallbackKind = fallbackKindForSource(cell.source)
  const resolvedKind = record?.kind ?? fallbackKind
  const sliderValue = sliderValueFromCell(record?.value)
  const effectiveSliderValue = Math.min(
    cell.slider.max,
    Math.max(cell.slider.min, sliderValue ?? cell.slider.min),
  )
  const isConstant = resolvedKind === "constant"
  const isFunction = resolvedKind === "function"
  const isProcess =
    resolvedKind === "process" ||
    resolvedKind === "derived" ||
    record?.value?.type === "process"
  const canHover = isFunction || isProcess

  useLayoutEffect(() => {
    const pendingSelection = pendingSelectionRef.current
    const input = sourceInputRef.current
    if (!pendingSelection || !input) {
      return
    }

    input.focus()
    const nextStart = Math.min(pendingSelection.start, input.value.length)
    const nextEnd = Math.min(pendingSelection.end, input.value.length)
    input.setSelectionRange(nextStart, nextEnd)
    pendingSelectionRef.current = null
  }, [cell.source, resolvedKind])

  const handleSourceChange = (value: string) => {
    const input = sourceInputRef.current
    if (input && document.activeElement === input) {
      pendingSelectionRef.current = {
        start: input.selectionStart ?? value.length,
        end: input.selectionEnd ?? value.length,
      }
    } else {
      pendingSelectionRef.current = null
    }

    updateCellSource(cell.id, value)
  }

  const wrapperProps = {
    ref: setNodeRef,
    style: {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.7 : 1,
    },
    className: "cursor-grab",
    ...attributes,
    ...listeners,
  }

  const hoverHandlers = canHover
    ? {
        onPointerEnter: () => setHoveredCellId(cell.id),
        onPointerLeave: () => setHoveredCellId(null),
      }
    : {}

  const baseClassName = "rounded-lg"

  if (isConstant) {
    return (
      <div {...wrapperProps} {...hoverHandlers} className={`${wrapperProps.className} ${baseClassName}`}>
        <ParameterCell
          source={cell.source}
          sourceInputRef={sourceInputRef}
          error={record?.error}
          min={cell.slider.min}
          max={cell.slider.max}
          step={cell.slider.step}
          sliderValue={effectiveSliderValue}
          onDelete={() => removeCell(cell.id)}
          onSourceChange={handleSourceChange}
          onSliderValueChange={(value) =>
            updateCellSource(
              cell.id,
              `${inferName(cell.source)} = ${formatNumber(value[0] ?? effectiveSliderValue)}`,
            )
          }
          onMinChange={(value) => updateSlider(cell.id, { min: value })}
          onMaxChange={(value) => updateSlider(cell.id, { max: value })}
          onStepChange={(value) =>
            updateSlider(cell.id, { step: Number.isFinite(value) && value > 0 ? value : 0.1 })
          }
        />
      </div>
    )
  }

  if (isFunction) {
    return (
      <div {...wrapperProps} {...hoverHandlers} className={`${wrapperProps.className} ${baseClassName}`}>
        <FunctionCell
          source={cell.source}
          sourceInputRef={sourceInputRef}
          error={record?.error}
          color={cell.display.color}
          colorMode={cell.display.colorMode}
          visible={cell.display.visible}
          onDelete={() => removeCell(cell.id)}
          onToggleVisibility={() => updateDisplay(cell.id, { visible: !cell.display.visible })}
          onSourceChange={handleSourceChange}
          onSelectSolid={(color) => updateDisplay(cell.id, { color, colorMode: "solid" })}
          onSelectScheme={(mode) => updateDisplay(cell.id, processColorPatch(mode, cell.display.color))}
        />
      </div>
    )
  }

  return (
    <div {...wrapperProps} {...hoverHandlers} className={`${wrapperProps.className} ${baseClassName}`}>
      <SDECell
        source={cell.source}
        sourceInputRef={sourceInputRef}
        error={record?.error}
        color={cell.display.color}
        colorMode={cell.display.colorMode}
        visible={cell.display.visible}
        showMean={cell.display.showMean}
        showVariance={cell.display.showVariance}
        showPaths={cell.display.showPaths}
        sampleCount={cell.display.sampleCount}
        onDelete={() => removeCell(cell.id)}
        onToggleVisibility={() => updateDisplay(cell.id, { visible: !cell.display.visible })}
        onToggleMean={() => updateDisplay(cell.id, { showMean: !cell.display.showMean })}
        onToggleVariance={() =>
          updateDisplay(cell.id, { showVariance: !cell.display.showVariance })
        }
        onTogglePaths={() => updateDisplay(cell.id, { showPaths: !cell.display.showPaths })}
        onSampleCountChange={(value) =>
          updateDisplay(cell.id, {
            sampleCount: Math.max(1, Math.min(512, Math.round(value))),
          })
        }
        onSourceChange={handleSourceChange}
        onSelectSolid={(color) => updateDisplay(cell.id, { color, colorMode: "solid" })}
        onSelectScheme={(mode) => updateDisplay(cell.id, processColorPatch(mode, cell.display.color))}
      />
    </div>
  )
}

export function CellsSidebar() {
  const [helpOpen, setHelpOpen] = useState(false)
  const cells = useNotebookStore((state) => state.cells)
  const addCell = useNotebookStore((state) => state.addCell)
  const moveCell = useNotebookStore((state) => state.moveCell)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  )

  const handleDragEnd = (event: DragEndEvent) => {
    if (!event.over || event.active.id === event.over.id) {
      return
    }

    moveCell(String(event.active.id), String(event.over.id))
  }

  return (
    <div className="relative flex h-full min-h-0 w-80 flex-col overflow-hidden border-r border-border bg-card">
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-3 pb-28 flex flex-col gap-2">
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

          <Button
            variant="ghost"
            className="w-full justify-center gap-2 text-muted-foreground hover:text-foreground border border-dashed border-border"
            onClick={() => addCell("X_t = Brownian()")}
          >
            <Plus className="size-4" />
            Add Cell
          </Button>
        </div>
      </ScrollArea>

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className="absolute bottom-4 right-4 z-20 size-10 rounded-full shadow-lg bg-card hover:bg-accent"
          >
            <HelpCircle className="size-5" />
            <span className="sr-only">Help</span>
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DocsModalContent />
        </DialogContent>
      </Dialog>
    </div>
  )
}
