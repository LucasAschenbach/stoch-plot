"use client"

import type { Ref } from "react"

import { Eye, EyeOff, X } from "lucide-react"

import { ColorPicker } from "@/components/color-picker"
import { Button } from "@/components/ui/button"
import type { ColorMode } from "@/lib/runtime/types"

interface SDECellProps {
  source: string
  sourceInputRef?: Ref<HTMLInputElement>
  error?: string
  color: string
  colorMode: ColorMode
  visible: boolean
  showMean: boolean
  showVariance: boolean
  showPaths: boolean
  sampleCount: number
  onDelete?: () => void
  onToggleVisibility?: () => void
  onToggleMean?: () => void
  onToggleVariance?: () => void
  onTogglePaths?: () => void
  onSampleCountChange?: (value: number) => void
  onSourceChange?: (value: string) => void
  onSelectSolid?: (color: string) => void
  onSelectScheme?: (mode: Exclude<ColorMode, "solid">) => void
}

function TogglePill({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick?: () => void
}) {
  return (
    <Button
      type="button"
      variant={active ? "outline" : "ghost"}
      size="sm"
      className="h-6 px-2 text-xs font-serif italic"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={onClick}
    >
      {label}
    </Button>
  )
}

export function SDECell({
  source,
  sourceInputRef,
  error,
  color,
  colorMode,
  visible,
  showMean,
  showVariance,
  showPaths,
  sampleCount,
  onDelete,
  onToggleVisibility,
  onToggleMean,
  onToggleVariance,
  onTogglePaths,
  onSampleCountChange,
  onSourceChange,
  onSelectSolid,
  onSelectScheme,
}: SDECellProps) {
  return (
    <div className="border border-border rounded-lg p-3 bg-card">
      <div className="flex items-start justify-between gap-2">
        <input
          ref={sourceInputRef}
          value={source}
          onPointerDown={(event) => event.stopPropagation()}
          onChange={(event) => onSourceChange?.(event.target.value)}
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
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <ColorPicker
            color={color}
            colorMode={colorMode}
            onSelectSolid={onSelectSolid}
            onSelectScheme={onSelectScheme}
          />
          <div className="flex items-center gap-0.5">
            <TogglePill label="μ" active={showMean} onClick={onToggleMean} />
            <TogglePill label="σ" active={showVariance} onClick={onToggleVariance} />
            <TogglePill label="λ" active={showPaths} onClick={onTogglePaths} />
            <input
              type="number"
              min={1}
              max={512}
              value={sampleCount}
              onPointerDown={(event) => event.stopPropagation()}
              onChange={(event) => onSampleCountChange?.(Number(event.target.value) || 1)}
              className="input-no-spinner ml-1 w-8 bg-transparent text-xs text-muted-foreground outline-none"
            />
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-6 shrink-0 text-muted-foreground hover:text-foreground"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onToggleVisibility}
        >
          {visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
        </Button>
      </div>
    </div>
  )
}
