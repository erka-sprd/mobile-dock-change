

import { cn } from "./utils"
import MobileDrawer from "./mobile-drawer"
import { SORT_OPTIONS, type SortId } from "./assortment"

// Mobile sort drawer, ported from create-omat's MobileSortDrawer: radio rows,
// selecting applies immediately and closes.

type MobileSortDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedSortId: SortId
  onSortChange: (id: SortId) => void
}

export default function MobileSortDrawer({
  open,
  onOpenChange,
  selectedSortId,
  onSortChange,
}: MobileSortDrawerProps) {
  return (
    <MobileDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={<span className="text-base font-bold">Sort by</span>}
      closeLabel="Close"
    >
      <div>
        {SORT_OPTIONS.map((option, i) => (
          <button
            key={option.id}
            type="button"
            onClick={() => {
              onSortChange(option.id)
              onOpenChange(false)
            }}
            className={cn(
              "flex w-full cursor-pointer items-center gap-3 px-4 py-4 text-left text-sm",
              i < SORT_OPTIONS.length - 1 && "border-b border-neutral-200"
            )}
          >
            <div
              className={cn(
                "flex size-5 shrink-0 items-center justify-center rounded-full border",
                option.id === selectedSortId ? "border-neutral-800" : "border-neutral-400"
              )}
            >
              {option.id === selectedSortId && <div className="size-3 rounded-full bg-neutral-800" />}
            </div>
            {option.label}
          </button>
        ))}
      </div>
    </MobileDrawer>
  )
}
