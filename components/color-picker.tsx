"use client"

import { useState } from "react"
import { Pipette } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { ColorMode } from "@/lib/runtime/types"
import {
  COLOR_MODE_OPTIONS,
  paletteForMode,
  representativeColor,
} from "@/lib/utils/color"

const SOLID_COLORS = [
  "#10b981", // emerald
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#f59e0b", // amber
  "#ef4444", // red
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#84cc16", // lime
]

interface ColorPickerProps {
  color: string
  colorMode: ColorMode
  onSelectSolid?: (color: string) => void
  onSelectScheme?: (mode: Exclude<ColorMode, "solid">) => void
}

export function ColorPicker({
  color,
  colorMode,
  onSelectSolid,
  onSelectScheme,
}: ColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const schemeOptions = COLOR_MODE_OPTIONS.filter(
    (option): option is { label: string; value: Exclude<ColorMode, "solid"> } =>
      option.value !== "solid",
  )

  const activePalette = paletteForMode(color, colorMode)
  const activeColor = representativeColor(colorMode, color)

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <button 
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          className="size-5 rounded-full border border-border/50 cursor-pointer hover:ring-2 hover:ring-ring hover:ring-offset-1 transition-shadow focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
          style={{ 
            background:
              colorMode === "solid"
                ? activeColor
                : `linear-gradient(90deg, ${activePalette.join(", ")})`,
          }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        {SOLID_COLORS.map((solidColor) => (
          <DropdownMenuItem
            key={solidColor}
            className="gap-2 cursor-pointer"
            onClick={() => {
              onSelectSolid?.(solidColor)
              setIsOpen(false)
            }}
          >
            <div
              className="size-5 rounded-full border border-border/50"
              style={{ backgroundColor: solidColor }}
            />
            <span>{solidColor.toUpperCase()}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem
          className="gap-2 cursor-default"
          onSelect={(event) => event.preventDefault()}
        >
          <Pipette className="size-4" />
          <label className="flex w-full items-center justify-between gap-2 cursor-pointer">
            <span>Custom</span>
            <input
              type="color"
              value={color}
              onPointerDown={(event) => event.stopPropagation()}
              onChange={(e) => {
                onSelectSolid?.(e.target.value)
                setIsOpen(false)
              }}
              className="size-5 rounded border-0 cursor-pointer bg-transparent"
            />
          </label>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        
        {schemeOptions.map((option) => (
          <DropdownMenuItem
            key={option.value}
            className="gap-2 cursor-pointer"
            onClick={() => {
              onSelectScheme?.(option.value)
              setIsOpen(false)
            }}
          >
            <div 
              className="size-5 rounded-full border border-border/50"
              style={{ 
                background: `linear-gradient(90deg, ${paletteForMode(color, option.value).join(", ")})`
              }}
            />
            <span>{option.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
