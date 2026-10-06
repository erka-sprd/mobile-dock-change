

import { useId } from "react"

import { cn } from "./utils"

// Mirrors @sprd/sprd-component-kit v2 Checkbox: black-bordered square that
// fills black with a white checkmark when checked.
type CheckboxProps = {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  showLabel?: boolean
  className?: string
}

export default function Checkbox({
  checked,
  onChange,
  label,
  showLabel = false,
  className,
}: CheckboxProps) {
  const id = useId()
  return (
    <label
      htmlFor={id}
      className={cn("relative inline-flex cursor-pointer items-center gap-2 p-0.5", className)}
    >
      <input
        id={id}
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        aria-label={label}
      />
      <span className="flex size-[22px] shrink-0 items-center border-2 border-black bg-white peer-checked:bg-black" />
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className="pointer-events-none absolute left-0.5 ml-px hidden size-5 text-white peer-checked:block"
        aria-hidden
      >
        <path
          d="M19.2929 6.29289C19.6834 5.90237 20.3166 5.90237 20.7071 6.29289C21.0676 6.65338 21.0953 7.22061 20.7903 7.6129L20.7071 7.70711L10.7071 17.7071C10.3466 18.0676 9.77939 18.0953 9.3871 17.7903L9.29289 17.7071L4.29289 12.7071C3.90237 12.3166 3.90237 11.6834 4.29289 11.2929C4.65338 10.9324 5.22061 10.9047 5.6129 11.2097L5.70711 11.2929L10 15.585L19.2929 6.29289Z"
          fill="currentColor"
        />
      </svg>
      {showLabel && <span className="text-sm md:text-base">{label}</span>}
    </label>
  )
}
