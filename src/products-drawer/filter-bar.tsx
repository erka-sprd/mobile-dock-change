

import { useRef, useState } from "react"

import { cn } from "./utils"
import { FilterButton, KitButton } from "./kit-button"
import { ArrowBackIcon, CaretIcon, CloseIcon, SearchIcon, SortIcon } from "./kit-icons"
import { Popover, PopoverTrigger } from "./popover"
import { SORT_OPTIONS, type FilterSection, type SortId } from "./assortment"
import type { ProductFiltersState } from "./use-product-filters"

import { ChipLabel, FilterDropdown, FilterPopoverContent, ToggleChip } from "./filter-dropdown"
import { CheckboxList, ColorGrid, PriceContent, RadioList, SizeGrid } from "./filter-lists"

// Desktop filter row, replicating create-omat's ProductTypeFilterBar: search +
// sort + the first 4 filter chips, the rest behind "More filters", plus
// "Reset filters" when anything is active. All controls are kit v2 replicas.

const DEFAULT_VISIBLE_COUNT = 4

function SectionControl({
  section,
  filters,
}: {
  section: FilterSection
  filters: ProductFiltersState
}) {
  const isAvailable = (optionId: string) =>
    filters.optionAvailability.get(`${section.id}:${optionId}`) ?? true

  if (section.type === "toggle")
    return (
      <ToggleChip
        label={section.label}
        checked={!!filters.toggles[section.id]}
        onCheckedChange={on => filters.setToggle(section.id, on)}
      />
    )

  if (section.type === "price") return <PriceDropdown section={section} filters={filters} />

  const committed = filters.selections[section.id] ?? []
  return (
    <FilterDropdown
      label={section.label}
      count={filters.countFor(section)}
      committedIds={committed}
      onApply={ids => filters.applySelection(section.id, ids)}
    >
      {(pending, setPending) => {
        const listProps = { options: section.options ?? [], pending, setPending, isAvailable }
        if (section.type === "radio") return <RadioList {...listProps} />
        if (section.type === "color") return <ColorGrid {...listProps} />
        if (section.type === "size") return <SizeGrid {...listProps} />
        return <CheckboxList {...listProps} searchable={section.searchable} />
      }}
    </FilterDropdown>
  )
}

// Price keeps its own pending value (like production's PriceRangeDropdownFilter)
// but shares the chip + footer styling with FilterDropdown.
function PriceDropdown({
  section,
  filters,
}: {
  section: FilterSection
  filters: ProductFiltersState
}) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState<number | undefined>()
  // Same chip toggle-off guard as FilterDropdown.
  const lastClosedAt = useRef(0)
  const min = section.priceMin ?? 0
  const max = section.priceMax ?? 0
  const count = filters.countFor(section)

  const changeOpen = (next: boolean) => {
    if (next && Date.now() - lastClosedAt.current < 300) return
    if (next) {
      setPending(filters.priceValue)
    } else {
      filters.setPriceValue(pending)
      lastClosedAt.current = Date.now()
    }
    setOpen(next)
  }

  return (
    // modal for the same reason as FilterDropdown (popover inside vaul drawer).
    <Popover open={open} onOpenChange={changeOpen} modal>
      <PopoverTrigger asChild>
        <FilterButton endIcon={<CaretIcon className="size-6" />}>
          <ChipLabel label={section.label} count={count} />
        </FilterButton>
      </PopoverTrigger>
      <FilterPopoverContent>
        <div className="p-4">
          <PriceContent min={min} max={max} value={pending} onChange={setPending} />
        </div>
        <div className="flex gap-2 border-t border-neutral-200 p-3">
          <KitButton
            variant="ghost"
            className="flex-1"
            onClick={() => {
              setPending(undefined)
              filters.setPriceValue(undefined)
              setOpen(false)
            }}
          >
            Reset
          </KitButton>
          <KitButton
            variant="primary"
            className="flex-1"
            onClick={() => {
              filters.setPriceValue(pending)
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

// create-omat SearchInput replica (kit Input with Search prefix + clear).
// Exported for the mobile panel, which renders it full-width above the chips.
export function SearchField({
  value,
  onChange,
  className,
}: {
  value: string
  onChange: (v: string) => void
  className?: string
}) {
  return (
    // Natural kit-Input height (p-3) — the desktop filter bar squeezes it to
    // h-10 via className, mobile keeps it tall, like production.
    <label
      className={cn(
        "group flex w-full items-center gap-3 border border-neutral-700 bg-white p-3 focus-within:border-black",
        className
      )}
    >
      <SearchIcon className="size-5 shrink-0 text-neutral-700 group-focus-within:text-black" />
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Search products..."
        className="min-w-0 flex-1 border-none bg-transparent text-base outline-none placeholder:text-neutral-700"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full bg-neutral-200 hover:bg-neutral-300"
        >
          <CloseIcon className="size-3" />
        </button>
      )}
    </label>
  )
}

export default function FilterBar({ filters }: { filters: ProductFiltersState }) {
  const [showAll, setShowAll] = useState(false)
  const visibleSections = showAll
    ? filters.sections
    : filters.sections.slice(0, DEFAULT_VISIBLE_COUNT)
  const hasHiddenFilters = !showAll && filters.sections.length > DEFAULT_VISIBLE_COUNT

  return (
    <div className={cn("relative pb-6")}>
      <div className="flex flex-wrap items-center gap-2">
        {/* Client-side name search, ported from create-omat (2+ chars, 400ms debounce). */}
        <SearchField
          value={filters.searchQuery}
          onChange={filters.setSearchQuery}
          className="h-10 max-w-[320px]"
        />

        {/* Sort */}
        <FilterDropdown
          label={
            <>
              <SortIcon className="size-5" />
              Sort by{" "}
            </>
          }
          count={filters.sortId !== SORT_OPTIONS[0].id ? 1 : 0}
          committedIds={[filters.sortId]}
          defaultIds={[SORT_OPTIONS[0].id]}
          onApply={ids => filters.setSortId((ids[0] as SortId) ?? "popular")}
        >
          {(pending, setPending) => (
            <RadioList
              options={SORT_OPTIONS.map(o => ({ ...o, productIds: [] }))}
              pending={pending}
              setPending={setPending}
            />
          )}
        </FilterDropdown>

        {visibleSections.map(section => (
          <SectionControl key={section.id} section={section} filters={filters} />
        ))}

        {hasHiddenFilters && (
          <KitButton
            variant="plain"
            endIcon={<CaretIcon className="size-6" />}
            onClick={() => setShowAll(true)}
          >
            More filters
          </KitButton>
        )}

        {/* Like production's hasActiveFilters, an active search also shows Reset. */}
        {(filters.activeFilterCount > 0 || filters.hasActiveSearch) && (
          <KitButton
            variant="plain"
            startIcon={<ArrowBackIcon className="size-5" />}
            onClick={filters.resetFilters}
            className="bg-neutral-100"
          >
            Reset filters
          </KitButton>
        )}
      </div>
    </div>
  )
}
