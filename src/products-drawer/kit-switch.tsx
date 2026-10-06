

import { cn } from "./utils"

// Mirrors @sprd/sprd-component-kit v2 Switch, variant="success"
// labelPosition="left" — size "s" as used inside the desktop toggle filter
// chips, size "m" as used in the mobile filter drawer rows.

type KitSwitchProps = {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  size?: "s" | "m"
  className?: string
}

export default function KitSwitch({
  checked,
  onChange,
  label,
  size = "s",
  className,
}: KitSwitchProps) {
  return (
    <label
      className={cn(
        // The kit uses a (broken) `align-center` class here; production centers
        // the track via a `[&>span:nth-child(2)]:m-auto` override — items-center
        // achieves the same, actually vertically centering label and track.
        "inline-flex cursor-pointer items-center font-semibold",
        size === "s" ? "gap-1.5 text-sm" : "gap-2 text-base",
        className
      )}
    >
      <span>{label}</span>
      <span className={cn("relative block shrink-0", size === "s" ? "h-4 w-[26px]" : "h-6 w-10")}>
        <input
          className="peer sr-only"
          type="checkbox"
          role="switch"
          checked={checked}
          onChange={e => onChange(e.target.checked)}
        />
        <span
          aria-hidden
          className={cn(
            "flex h-full items-center rounded-full bg-neutral-200 inset-ring-1 inset-ring-neutral-600 duration-200 ease-in-out peer-checked:bg-[#2EBB6E] peer-checked:inset-ring-black motion-safe:transition-[background-color]",
            size === "s"
              ? "peer-checked:*:translate-x-[10px]"
              : "peer-checked:*:translate-x-4"
          )}
        >
          <span
            className={cn(
              "block rounded-full border-black bg-white transition-transform",
              size === "s" ? "size-4 border" : "size-6 border-2"
            )}
          />
        </span>
      </span>
    </label>
  )
}
