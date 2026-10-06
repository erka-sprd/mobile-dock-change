

import { useEffect, useRef, useState } from "react"

import { cn } from "./utils"
import Checkbox from "./checkbox"
import { CheckmarkIcon } from "./kit-icons"
import type { FilterOption } from "./assortment"

// Dropdown bodies replicating create-omat's CheckboxFilterList,
// RadioFilterList, ColorFilterGrid (kit AppearanceColor swatch),
// SizeFilterGrid and PriceFilterContent (kit Input + RangeSlider). All operate
// on a pending selection owned by FilterDropdown.

type ListProps = {
  options: FilterOption[]
  pending: string[]
  setPending: (ids: string[]) => void
  isAvailable?: (optionId: string) => boolean
}

export function CheckboxList({
  options,
  pending,
  setPending,
  isAvailable,
  searchable,
}: ListProps & { searchable?: boolean }) {
  const [search, setSearch] = useState("")
  const filtered =
    searchable && search
      ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
      : options
  const toggle = (id: string) =>
    setPending(pending.includes(id) ? pending.filter(p => p !== id) : [...pending, id])
  return (
    <div className="flex flex-col gap-3">
      {searchable && (
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search"
          className="w-full border border-neutral-300 px-3 py-1.5 text-sm outline-none focus:border-neutral-800"
        />
      )}
      <div className="flex max-h-[240px] flex-col gap-3 overflow-y-auto">
        {filtered
          // Like production: options with no matches are hidden, not disabled.
          .filter(o => (isAvailable ? isAvailable(o.id) : true) || pending.includes(o.id))
          .map(o => (
            <Checkbox
              key={o.id}
              label={o.label}
              showLabel
              checked={pending.includes(o.id)}
              onChange={() => toggle(o.id)}
            />
          ))}
      </div>
    </div>
  )
}

export function RadioList({ options, pending, setPending, isAvailable }: ListProps) {
  return (
    <div className="flex flex-col gap-3">
      {options.map(o => {
        const selected = pending.includes(o.id)
        const disabled = (isAvailable ? !isAvailable(o.id) : false) && !selected
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => setPending([o.id])}
            disabled={disabled}
            className="flex cursor-pointer items-center gap-3 text-left disabled:cursor-not-allowed disabled:opacity-40"
          >
            <div
              className={cn(
                "flex size-5 shrink-0 items-center justify-center rounded-full border",
                selected ? "border-neutral-800" : "border-neutral-400"
              )}
            >
              {selected && <div className="size-3 rounded-full bg-neutral-800" />}
            </div>
            <span className="text-sm">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}

const isColorLight = (hex: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return true
  const int = parseInt(m[1], 16)
  return (((int >> 16) & 255) * 299 + ((int >> 8) & 255) * 587 + (int & 255) * 114) / 1000 > 150
}

export function ColorGrid({ options, pending, setPending, isAvailable }: ListProps) {
  const toggle = (id: string) =>
    setPending(pending.includes(id) ? pending.filter(p => p !== id) : [...pending, id])
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-3">
      {options.map(o => {
        const selected = pending.includes(o.id)
        const disabled = (isAvailable ? !isAvailable(o.id) : false) && !selected
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => toggle(o.id)}
            disabled={disabled}
            className="flex cursor-pointer items-center gap-2 text-left disabled:cursor-not-allowed disabled:opacity-40"
          >
            {/* kit AppearanceColor, size md */}
            <div
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full ring-1 hover:ring-black",
                selected ? "ring-black" : "ring-neutral-300"
              )}
            >
              <div
                className={cn(
                  "relative flex h-5 w-5 items-center justify-center overflow-hidden rounded-full",
                  isColorLight(o.color ?? "#fff") ? "text-black" : "text-white"
                )}
                style={{ background: o.color }}
              >
                {selected && <CheckmarkIcon className="size-4" />}
              </div>
            </div>
            <span className="text-sm">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}

export function SizeGrid({ options, pending, setPending, isAvailable }: ListProps) {
  const toggle = (id: string) =>
    setPending(pending.includes(id) ? pending.filter(p => p !== id) : [...pending, id])
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(o => {
        const selected = pending.includes(o.id)
        const disabled = (isAvailable ? !isAvailable(o.id) : false) && !selected
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => toggle(o.id)}
            disabled={disabled}
            className={cn(
              "cursor-pointer px-4 py-2 text-center text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40",
              selected ? "bg-black text-white" : "bg-neutral-100 hover:bg-neutral-900 hover:text-white"
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

// kit SingleRangeSlider replica: bordered 1.5-track with black fill and a
// round white thumb (native range input, styled).
const THUMB =
  "[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:size-6 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-solid [&::-webkit-slider-thumb]:border-black [&::-webkit-slider-thumb]:bg-white [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:size-6 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-solid [&::-moz-range-thumb]:border-black [&::-moz-range-thumb]:bg-white"

export function PriceContent({
  min,
  max,
  value,
  onChange,
}: {
  min: number
  max: number
  /** current "up to" value; undefined = max (no filter) */
  value: number | undefined
  onChange: (value: number | undefined) => void
}) {
  const current = value ?? max
  const [inputText, setInputText] = useState(current.toFixed(2))
  const prevRef = useRef(current)
  useEffect(() => {
    if (prevRef.current !== current) {
      prevRef.current = current
      setInputText(current.toFixed(2))
    }
  }, [current])

  const change = (v: number) => {
    prevRef.current = v
    onChange(v >= max ? undefined : v)
  }
  const commitInput = () => {
    const parsed = parseFloat(inputText.replace(",", "."))
    const clamped = isNaN(parsed) ? current : Math.min(max, Math.max(min, parsed))
    setInputText(clamped.toFixed(2))
    change(clamped)
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm font-semibold">Show products up to</span>
        {/* kit Input replica */}
        <label className="flex w-fit items-center gap-3 border border-neutral-700 p-3 text-sm focus-within:border-black">
          <input
            size={6}
            value={inputText}
            onChange={e => {
              const next = e.target.value
              setInputText(next)
              const parsed = parseFloat(next.replace(",", "."))
              if (!isNaN(parsed) && parsed >= min && parsed <= max) change(parsed)
            }}
            onBlur={commitInput}
            onKeyDown={e => {
              if (e.key === "Enter") commitInput()
            }}
            aria-label="Maximum price"
            className="flex-1 border-none bg-transparent text-sm outline-none"
          />
          <span className="text-neutral-500">€</span>
        </label>
      </div>
      <div className="py-2">
        <div className="relative h-1.5 w-full rounded-sm border border-neutral-700 bg-white">
          <span
            aria-hidden
            className="absolute h-full rounded-l-sm bg-black will-change-[right]"
            style={{ left: 0, right: `${100 - ((current - min) / (max - min)) * 100}%` }}
          />
          <input
            type="range"
            min={min}
            max={max}
            step={1}
            value={current}
            aria-label="Price"
            onChange={e => {
              const v = Number(e.target.value)
              setInputText(v.toFixed(2))
              change(v)
            }}
            className={cn(
              "absolute m-0 size-full cursor-pointer appearance-none bg-transparent p-0 outline-none",
              THUMB
            )}
          />
        </div>
      </div>
    </>
  )
}
