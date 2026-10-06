

import { useState, type ReactNode } from "react"

import { cn } from "./utils"
import { KitButton } from "./kit-button"
import KitSwitch from "./kit-switch"
import MobileDrawer from "./mobile-drawer"
import type { FilterSection } from "./assortment"
import type { ProductFiltersState } from "./use-product-filters"

import { PriceContent } from "./filter-lists"

// Second-level mobile filter drawer, ported from create-omat's
// MobileFilterDrawer: toggle rows, accordions with horizontally scrollable
// chips (color: large swatches with labels), price accordion — everything
// applies immediately; "Show products" just closes.

const isColorLight = (hex: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return true
  const int = parseInt(m[1], 16)
  return (((int >> 16) & 255) * 299 + ((int >> 8) & 255) * 587 + (int & 255) * 114) / 1000 > 150
}

function HScroll({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "flex overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className
      )}
    >
      {children}
    </div>
  )
}

function FilterAccordion({
  title,
  count,
  open,
  onToggle,
  headerClassName,
  children,
}: {
  title: string
  count?: number
  open: boolean
  onToggle: () => void
  headerClassName?: string
  children: ReactNode
}) {
  return (
    <div className="border-b border-neutral-200 py-6">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={cn(
          "flex w-full cursor-pointer items-center justify-between gap-4 pr-4 pl-4 text-left",
          headerClassName
        )}
      >
        <span className="flex items-center gap-2 font-semibold">
          {title}
          {count ? (
            <span className="bg-black px-2 py-0.5 text-xs text-white">{count}</span>
          ) : null}
        </span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden
          className={cn("size-5 shrink-0 transition-transform duration-200", open && "rotate-180")}
        >
          <path
            d="M6 9l6 6 6-6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && <div className="pt-4">{children}</div>}
    </div>
  )
}

type MobileFilterDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  filters: ProductFiltersState
}

export default function MobileFilterDrawer({
  open,
  onOpenChange,
  filters,
}: MobileFilterDrawerProps) {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({})
  const toggleSection = (id: string) =>
    setOpenSections(prev => ({ ...prev, [id]: !prev[id] }))

  const isAvailable = (section: FilterSection, optionId: string) =>
    filters.optionAvailability.get(`${section.id}:${optionId}`) ?? true

  const renderSectionContent = (section: FilterSection) => {
    const selectedIds = filters.selections[section.id] ?? []
    const options = section.options ?? []

    if (section.type === "color") {
      return (
        <HScroll className="gap-3 py-0.5 pl-4">
          {options.map(option => {
            const selected = selectedIds.includes(option.id)
            const disabled = !isAvailable(section, option.id) && !selected
            return (
              <div
                key={option.id}
                className={cn(
                  "flex flex-col items-center gap-1",
                  disabled && "pointer-events-none opacity-40"
                )}
              >
                {/* kit AppearanceColor, size lg */}
                <button
                  type="button"
                  onClick={() => filters.toggleOption(section.id, option.id)}
                  className={cn(
                    "flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full ring-1",
                    selected ? "ring-black" : "ring-neutral-300"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-8 w-8 items-center justify-center overflow-hidden rounded-full",
                      isColorLight(option.color ?? "#fff") ? "text-black" : "text-white"
                    )}
                    style={{ background: option.color }}
                  >
                    {selected && (
                      <svg viewBox="0 0 24 24" fill="none" className="size-6" aria-hidden>
                        <path
                          d="M19.2929 6.29289C19.6834 5.90237 20.3166 5.90237 20.7071 6.29289C21.0676 6.65338 21.0953 7.22061 20.7903 7.6129L20.7071 7.70711L10.7071 17.7071C10.3466 18.0676 9.77939 18.0953 9.3871 17.7903L9.29289 17.7071L4.29289 12.7071C3.90237 12.3166 3.90237 11.6834 4.29289 11.2929C4.65338 10.9324 5.22061 10.9047 5.6129 11.2097L5.70711 11.2929L10 15.585L19.2929 6.29289Z"
                          fill="currentColor"
                        />
                      </svg>
                    )}
                  </span>
                </button>
                <span className="text-xs text-nowrap">{option.label}</span>
              </div>
            )
          })}
        </HScroll>
      )
    }

    // All other types: horizontally scrollable chips (kit Chip primary).
    return (
      <HScroll className="gap-2 pl-4">
        {options.map(option => {
          const selected = selectedIds.includes(option.id)
          const disabled = !isAvailable(section, option.id) && !selected
          return (
            <button
              key={option.id}
              type="button"
              disabled={disabled}
              onClick={() => filters.toggleOption(section.id, option.id)}
              className={cn(
                "size-fit shrink-0 cursor-pointer rounded-full border-2 px-4 py-2 text-sm font-semibold whitespace-nowrap transition-colors duration-200 ease-in-out",
                selected ? "border-black bg-black text-white" : "border-neutral-300 bg-white text-black",
                disabled && "pointer-events-none border-neutral-200 bg-neutral-200 text-neutral-600"
              )}
            >
              {option.label}
            </button>
          )
        })}
      </HScroll>
    )
  }

  const hasActive = filters.activeFilterCount > 0

  return (
    <MobileDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="Filters"
      closeLabel="Close"
      heightClassName="h-auto max-h-[calc(100%-6rem)]"
    >
      {/* The section list is its own scroll area so the footer stays pinned
          below it and its up-shadow (kit shadow-up-s) always renders over the
          list edge, like production. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {filters.sections.map(section => {
          if (section.type === "toggle") {
            return (
              <KitSwitch
                key={section.id}
                size="m"
                label={section.label}
                checked={!!filters.toggles[section.id]}
                onChange={on => filters.setToggle(section.id, on)}
                className="flex w-full justify-between border-b border-neutral-200 px-4 py-6"
              />
            )
          }

          if (section.type === "price") {
            const active = filters.countFor(section) > 0
            return (
              <FilterAccordion
                key={section.id}
                title={section.label}
                count={active ? 1 : 0}
                open={openSections[section.id] ?? false}
                onToggle={() => toggleSection(section.id)}
              >
                <div className="px-4 py-0.5">
                  <PriceContent
                    min={section.priceMin ?? 0}
                    max={section.priceMax ?? 0}
                    value={filters.priceValue}
                    onChange={filters.setPriceValue}
                  />
                </div>
              </FilterAccordion>
            )
          }

          return (
            <FilterAccordion
              key={section.id}
              title={section.label}
              count={filters.countFor(section)}
              open={openSections[section.id] ?? false}
              onToggle={() => toggleSection(section.id)}
            >
              {renderSectionContent(section)}
            </FilterAccordion>
          )
        })}
      </div>
      <div className="relative z-10 flex shrink-0 items-center justify-between gap-4 bg-white px-4 py-4 shadow-[0_-4px_8px_0_#25211f0d]">
        <KitButton
          variant="plain"
          className="flex flex-1 items-center gap-1.5 text-sm"
          disabled={!hasActive}
          onClick={filters.resetFilters}
        >
          Reset all filters
        </KitButton>
        <KitButton className="flex-1 font-semibold" onClick={() => onOpenChange(false)}>
          Show products
        </KitButton>
      </div>
    </MobileDrawer>
  )
}
