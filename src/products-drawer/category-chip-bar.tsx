

import { cn } from "./utils"

// Mobile category chip row, ported from create-omat's CategoryChipBar (kit
// Chip, primary variant): horizontally scrollable pills — selected = black
// fill, disabled = grey fill, non-selectable.

type ChipCategory = { id: string; label: string; disabled?: boolean }

type CategoryChipBarProps = {
  categories: ChipCategory[]
  selectedId?: string
  onSelect: (id: string) => void
}

export default function CategoryChipBar({ categories, selectedId, onSelect }: CategoryChipBarProps) {
  return (
    <div className="flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {categories.map(c => (
        <button
          key={c.id}
          type="button"
          disabled={c.disabled}
          onClick={() => onSelect(c.id)}
          className={cn(
            "size-fit shrink-0 cursor-pointer rounded-full border-2 px-4 py-2 text-sm font-semibold whitespace-nowrap transition-colors duration-200 ease-in-out",
            selectedId === c.id
              ? "border-black bg-black text-white"
              : "border-neutral-300 bg-white text-black",
            c.disabled && "pointer-events-none border-neutral-200 bg-neutral-200 text-neutral-600"
          )}
        >
          {c.label}
        </button>
      ))}
    </div>
  )
}
