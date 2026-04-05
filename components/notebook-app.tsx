"use client"

import { useEffect, useMemo } from "react"

import { CellsSidebar } from "@/components/cells-sidebar"
import { DistributionPanel } from "@/components/distribution-panel"
import { MainPlot } from "@/components/main-plot"
import { Toolbar } from "@/components/toolbar"
import { useNotebookStore } from "@/lib/store/use-notebook-store"

function nextPointsForDt(tMin: number, tMax: number, dt: number) {
  if (!Number.isFinite(dt) || dt <= 0) {
    return null
  }

  const span = Math.max(tMax - tMin, dt)
  const points = Math.round(span / dt) + 1
  return Math.max(2, Math.min(5001, points))
}

export function NotebookApp() {
  const hydrate = useNotebookStore((state) => state.hydrate)
  const toolbar = useNotebookStore((state) => state.toolbar)
  const cells = useNotebookStore((state) => state.cells)
  const evaluation = useNotebookStore((state) => state.evaluation)
  const resample = useNotebookStore((state) => state.resample)
  const setSeed = useNotebookStore((state) => state.setSeed)
  const setGridValue = useNotebookStore((state) => state.setGridValue)
  const resetViewport = useNotebookStore((state) => state.resetViewport)

  useEffect(() => {
    hydrate()
  }, [hydrate])

  const visibleValues = useMemo(
    () =>
      cells
        .filter((cell) => cell.display.visible)
        .map((cell) => ({
          cell,
          record: evaluation.records[cell.id],
        })),
    [cells, evaluation.records],
  )

  const updateTMin = (value: number) => {
    if (!Number.isFinite(value)) {
      return
    }
    const nextTMin = Math.min(value, toolbar.tMax - 1e-6)
    setGridValue("tMin", nextTMin)
  }

  const updateTMax = (value: number) => {
    if (!Number.isFinite(value)) {
      return
    }
    const nextTMax = Math.max(value, toolbar.tMin + 1e-6)
    setGridValue("tMax", nextTMax)
  }

  const updateDt = (dt: number) => {
    const nextPoints = nextPointsForDt(toolbar.tMin, toolbar.tMax, dt)
    if (!nextPoints) {
      return
    }
    setGridValue("points", nextPoints)
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <CellsSidebar />
      <div className="flex-1 flex min-w-0 min-h-0 flex-col overflow-hidden">
        <Toolbar
          seed={toolbar.seed}
          tMin={toolbar.tMin}
          tMax={toolbar.tMax}
          points={toolbar.points}
          histogramEnabled={toolbar.distributionPanel}
          onResample={resample}
          onSeedChange={setSeed}
          onTMinChange={updateTMin}
          onTMaxChange={updateTMax}
          onDtChange={updateDt}
          onResetView={resetViewport}
          onToggleHistogram={() =>
            setGridValue("distributionPanel", !toolbar.distributionPanel)
          }
        />
        <div className={`flex min-h-0 flex-1 ${toolbar.distributionPanel ? "gap-3" : ""}`}>
          <MainPlot
            items={visibleValues}
            showRightSeparator={toolbar.distributionPanel}
          />
          {toolbar.distributionPanel ? <DistributionPanel items={visibleValues} /> : null}
        </div>
      </div>
    </div>
  )
}
