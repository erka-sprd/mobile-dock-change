

import * as React from "react"
import { useRef, useState, type ReactNode } from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"

import { cn } from "./utils"
import { FilterButton, KitButton } from "./kit-button"
import KitSwitch from "./kit-switch"
import { CaretIcon } from "./kit-icons"
import { Popover, PopoverTrigger } from "./popover"

// Filter chips + dropdown, replicating create-omat's FilterButton /
// FilterDropdownWithFooter (kit v2 buttons, square corners): selections are
// pending while the dropdown is open and committed on "Show products", on
// outside click, or on Escape.

// Raw Radix popover content matching production's dropdown surface exactly:
// no enter/exit animation, no border/radius, and create-omat's .shadow-dropdown
// (0 6px 8px + upward 0 -12px 20px) instead of the shadcn popover styling.
export function FilterPopoverContent({
  className,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align="start"
        sideOffset={4}
        // z above the vaul drawer (z-9999).
        className={cn(
          "z-[10000] mt-1 w-[327px] bg-white shadow-[0_6px_8px_#0000001f,0_-12px_20px_#25211f1f] outline-none",
          className
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
}

export function ChipLabel({ label, count }: { label: ReactNode; count?: number }) {
  return (
    <div className="flex items-center justify-center gap-1">
      {label}{" "}
      {count ? (
        <div className="flex size-5 items-center justify-center bg-black text-[10px] font-semibold text-white">
          {count}
        </div>
      ) : null}
    </div>
  )
}

/** Chip with an inline kit switch — applies immediately, no dropdown. */
export function ToggleChip({
  label,
  checked,
  onCheckedChange,
}: {
  label: string
  checked: boolean
  onCheckedChange: (on: boolean) => void
}) {
  // The switch's own label handles the click (like production's FilterButton +
  // kit Switch) — no onClick on the chip itself, or it would double-toggle.
  return (
    <FilterButton>
      <KitSwitch label={label} checked={checked} onChange={onCheckedChange} />
    </FilterButton>
  )
}

type FilterDropdownProps = {
  label: ReactNode
  count?: number
  /** committed selection, copied into pending state each time the dropdown opens */
  committedIds: string[]
  /** what "Reset" applies (production: defaultIds) */
  defaultIds?: string[]
  onApply: (ids: string[]) => void
  /** renders the dropdown body with the pending selection */
  children: (pending: string[], setPending: (ids: string[]) => void) => ReactNode
  contentClassName?: string
}

export function FilterDropdown({
  label,
  count = 0,
  committedIds,
  defaultIds = [],
  onApply,
  children,
  contentClassName,
}: FilterDropdownProps) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState<string[]>([])
  // Clicking the chip while open: the pointerdown dismisses (outside), then the
  // click would re-toggle it open. Swallow that reopen so the chip toggles off.
  const lastClosedAt = useRef(0)

  const changeOpen = (next: boolean) => {
    if (next && Date.now() - lastClosedAt.current < 300) return
    if (next) {
      setPending(committedIds)
    } else {
      onApply(pending) // outside click / Escape commit, like production
      lastClosedAt.current = Date.now()
    }
    setOpen(next)
  }

  return (
    // modal: the vaul drawer is a modal Radix dialog; a non-modal popover
    // portalled to body would inherit its pointer-events lock.
    <Popover open={open} onOpenChange={changeOpen} modal>
      <PopoverTrigger asChild>
        <FilterButton endIcon={<CaretIcon className="size-6" />}>
          <ChipLabel label={label} count={count} />
        </FilterButton>
      </PopoverTrigger>
      <FilterPopoverContent className={contentClassName}>
        <div className="p-4">{children(pending, setPending)}</div>
        <div className="flex gap-2 border-t border-neutral-200 p-3">
          <KitButton
            variant="ghost"
            className="flex-1"
            disabled={!count && !pending.length}
            onClick={() => {
              onApply(defaultIds)
              setOpen(false)
            }}
          >
            Reset
          </KitButton>
          <KitButton
            variant="primary"
            className="flex-1"
            disabled={pending.length === 0}
            onClick={() => {
              onApply(pending)
              setOpen(false)
            }}
          >
            Show products
          </KitButton>
        </div>
      </FilterPopoverContent>
    </Popover>
  )
}
