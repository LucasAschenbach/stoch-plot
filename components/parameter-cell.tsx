"use client"

import { useEffect, useState, type Ref } from "react"
import { SlidersHorizontal, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"

interface ParameterCellProps {
  source: string
  sourceInputRef?: Ref<HTMLInputElement>
  error?: string
  min: number
  max: number
  step: number
  sliderValue: number
  onDelete?: () => void
  onSourceChange?: (value: string) => void
  onSourceCommit?: () => void
  onSliderValueChange?: (value: number[]) => void
  onMinChange?: (value: number) => void
  onMaxChange?: (value: number) => void
  onStepChange?: (value: number) => void
}

function SmallNumberInput({
  value,
  align = "left",
  onChange,
  className = "",
}: {
  value: number
  align?: "left" | "right" | "center"
  onChange?: (value: number) => void
  className?: string
}) {
  const [draft, setDraft] = useState(String(value))

  useEffect(() => {
    setDraft(String(value))
  }, [value])

  const commit = () => {
    const parsed = Number(draft)
    if (Number.isFinite(parsed)) {
      onChange?.(parsed)
      setDraft(String(parsed))
      return
    }

    setDraft(String(value))
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      value={draft}
      onPointerDown={(event) => event.stopPropagation()}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur()
        }
      }}
      className={`bg-transparent text-xs text-muted-foreground outline-none ${
        align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"
      } ${className}`}
    />
  )
}

export function ParameterCell({
  source,
  sourceInputRef,
  error,
  min,
  max,
  step,
  sliderValue,
  onDelete,
  onSourceChange,
  onSourceCommit,
  onSliderValueChange,
  onMinChange,
  onMaxChange,
  onStepChange,
}: ParameterCellProps) {
  return (
    <div className="border border-border rounded-lg p-3 bg-card">
      <div className="flex items-start justify-between gap-2">
        <input
          ref={sourceInputRef}
          value={source}
          onPointerDown={(event) => event.stopPropagation()}
          onChange={(event) => onSourceChange?.(event.target.value)}
          onBlur={() => onSourceCommit?.()}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur()
            }
          }}
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent font-serif text-sm italic text-foreground outline-none"
        />
        <Button
          variant="ghost"
          size="icon"
          className="size-6 shrink-0 text-muted-foreground hover:text-foreground"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onDelete}
        >
          <X className="size-4" />
        </Button>
      </div>
      {error ? <div className="mt-1 text-xs text-destructive">{error}</div> : null}
      <div className="mt-3 flex items-center gap-3">
        <SmallNumberInput value={min} onChange={onMinChange} className="w-7" />
        <div className="flex-1" onPointerDown={(event) => event.stopPropagation()}>
          <Slider
            value={[sliderValue]}
            min={min}
            max={max}
            step={step}
            onValueChange={onSliderValueChange}
            className="flex-1"
          />
        </div>
        <SmallNumberInput value={max} align="right" onChange={onMaxChange} className="w-7" />
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <SlidersHorizontal className="size-3" />
          <SmallNumberInput value={step} align="center" onChange={onStepChange} className="w-7" />
        </div>
      </div>
    </div>
  )
}
