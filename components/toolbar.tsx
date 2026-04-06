"use client"

import { useEffect, useMemo, useState } from "react"
import { AlignJustify, Dices, Maximize } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface ToolbarProps {
  seed: number
  tMin: number
  tMax: number
  points: number
  histogramEnabled?: boolean
  onResample?: () => void
  onSeedChange?: (seed: number) => void
  onTMinChange?: (value: number) => void
  onTMaxChange?: (value: number) => void
  onDtChange?: (dt: number) => void
  onResetView?: () => void
  onToggleHistogram?: () => void
}

function formatCompactNumber(value: number) {
  if (!Number.isFinite(value)) {
    return "0"
  }
  if (Math.abs(value) >= 1000 || (Math.abs(value) > 0 && Math.abs(value) < 0.01)) {
    return value.toExponential(1)
  }
  return value.toFixed(3).replace(/\.?0+$/, "")
}

export function Toolbar({
  seed,
  tMin,
  tMax,
  points,
  histogramEnabled = false,
  onResample,
  onSeedChange,
  onTMinChange,
  onTMaxChange,
  onDtChange,
  onResetView,
  onToggleHistogram,
}: ToolbarProps) {
  const dtValue = useMemo(() => {
    if (points <= 1) {
      return 0
    }
    return (tMax - tMin) / (points - 1)
  }, [points, tMax, tMin])

  const [tMinDraft, setTMinDraft] = useState(formatCompactNumber(tMin))
  const [tMaxDraft, setTMaxDraft] = useState(formatCompactNumber(tMax))
  const [dtDraft, setDtDraft] = useState(formatCompactNumber(dtValue))

  useEffect(() => {
    setTMinDraft(formatCompactNumber(tMin))
  }, [tMin])

  useEffect(() => {
    setTMaxDraft(formatCompactNumber(tMax))
  }, [tMax])

  useEffect(() => {
    setDtDraft(formatCompactNumber(dtValue))
  }, [dtValue])

  const commitNumber = (
    raw: string,
    fallback: number,
    onCommit?: (value: number) => void,
  ) => {
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) {
      return fallback
    }
    onCommit?.(parsed)
    return parsed
  }

  return (
    <div className="flex items-center gap-3 p-3 border-b border-border bg-card">
      <div className="flex items-center">
        <Button
          variant="outline"
          size="sm"
          className="rounded-r-none gap-2"
          onClick={onResample}
        >
          <Dices className="size-4" />
          Resample
        </Button>
        <div className="flex items-center border border-l-0 border-input rounded-r-md px-2 h-8 bg-background">
          <span className="text-sm text-muted-foreground mr-1">Seed</span>
          <Input
            type="number"
            value={seed}
            onChange={(e) => onSeedChange?.(Number(e.target.value) || 0)}
            className="input-no-spinner h-6 w-10 border-0 p-0 text-sm text-center shadow-none focus-visible:ring-0"
          />
        </div>
      </div>

      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={onResetView}
      >
        <Maximize className="size-4" />
        Reset View
      </Button>

      <div className="flex items-center">
        <div className="flex items-center border border-input rounded-l-md px-2 h-8 bg-background text-sm">
          <input
            type="text"
            value={tMinDraft}
            onChange={(event) => setTMinDraft(event.target.value)}
            onBlur={() => {
              const next = commitNumber(tMinDraft, tMin, onTMinChange)
              setTMinDraft(formatCompactNumber(next))
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur()
              }
            }}
            className="w-9 bg-transparent text-center outline-none"
          />
          <span className="mx-1 text-muted-foreground">≤</span>
          <span className="font-serif italic">t</span>
          <span className="mx-1 text-muted-foreground">≤</span>
          <input
            type="text"
            value={tMaxDraft}
            onChange={(event) => setTMaxDraft(event.target.value)}
            onBlur={() => {
              const next = commitNumber(tMaxDraft, tMax, onTMaxChange)
              setTMaxDraft(formatCompactNumber(next))
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur()
              }
            }}
            className="w-9 bg-transparent text-center outline-none"
          />
        </div>
        <div className="flex items-center border border-l-0 border-input rounded-r-md px-3 h-8 bg-background text-sm">
          <span className="font-serif italic mr-2">dt</span>
          <input
            type="text"
            value={dtDraft}
            onChange={(event) => setDtDraft(event.target.value)}
            onBlur={() => {
              const next = commitNumber(dtDraft, dtValue, onDtChange)
              setDtDraft(formatCompactNumber(next))
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur()
              }
            }}
            className="w-12 bg-transparent text-center outline-none"
          />
        </div>
      </div>

      <Button
        variant={histogramEnabled ? "default" : "outline"}
        size="sm"
        className="gap-2 ml-auto"
        onClick={onToggleHistogram}
      >
        <AlignJustify className="size-4" />
        Histogram
      </Button>
    </div>
  )
}
