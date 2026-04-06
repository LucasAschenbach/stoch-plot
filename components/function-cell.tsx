"use client"

import type { Ref } from "react"

import { Eye, EyeOff, X } from "lucide-react"

import { ColorPicker } from "@/components/color-picker"
import { Button } from "@/components/ui/button"
import type { ColorMode } from "@/lib/runtime/types"

interface FunctionCellProps {
  source: string
  sourceInputRef?: Ref<HTMLInputElement>
  error?: string
  color: string
  colorMode: ColorMode
  visible: boolean
  onDelete?: () => void
  onToggleVisibility?: () => void
  onSourceChange?: (value: string) => void
  onSelectSolid?: (color: string) => void
  onSelectScheme?: (mode: Exclude<ColorMode, "solid">) => void
}

export function FunctionCell({
  source,
  sourceInputRef,
  error,
  color,
  colorMode,
  visible,
  onDelete,
  onToggleVisibility,
  onSourceChange,
  onSelectSolid,
  onSelectScheme,
}: FunctionCellProps) {
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
      <div className="mt-2 flex items-center justify-between">
        <ColorPicker
          color={color}
          colorMode={colorMode}
          onSelectSolid={onSelectSolid}
          onSelectScheme={onSelectScheme}
        />
        <Button
          variant="ghost"
          size="icon"
          className="size-6 text-muted-foreground hover:text-foreground"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onToggleVisibility}
        >
          {visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
        </Button>
      </div>
    </div>
  )
}
