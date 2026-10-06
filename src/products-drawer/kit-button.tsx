

import type { ButtonHTMLAttributes, ReactNode } from "react"

import { cn } from "./utils"

// Mirrors @sprd/sprd-component-kit v2 Button (square corners, semibold):
// primary = black fill, ghost = 2px black border, plain = borderless text.
// Same base/variant/size classes as the kit, minus its focus-ring tokens.

type KitButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "plain"
  size?: "s" | "m" | "l"
  startIcon?: ReactNode
  endIcon?: ReactNode
}

const VARIANT_CLASSES: Record<NonNullable<KitButtonProps["variant"]>, string> = {
  primary: "bg-black text-white hover:bg-neutral-900 active:bg-black",
  ghost:
    "border-2 border-black bg-transparent text-black hover:border-transparent hover:bg-neutral-900 hover:text-white active:border-black active:bg-transparent active:text-black",
  plain: "min-h-fit text-black hover:text-neutral-800 active:text-black",
}

const SIZE_CLASSES: Record<NonNullable<KitButtonProps["size"]>, string> = {
  s: "min-h-8 px-2 py-2 text-xs",
  m: "min-h-10 px-4 py-2 text-sm",
  l: "min-h-12 px-6 py-3 text-sm",
}

export function KitButton({
  variant = "primary",
  size = "m",
  startIcon,
  endIcon,
  className,
  type = "button",
  children,
  ...props
}: KitButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex h-fit w-fit cursor-pointer items-center justify-center gap-2 font-semibold disabled:pointer-events-none disabled:opacity-50",
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className
      )}
      {...props}
    >
      {startIcon}
      {children}
      {endIcon}
    </button>
  )
}

// Mirrors create-omat's FilterButton (product-type dialog): kit ghost Button
// with tighter padding — used for every filter chip in the filter bar.
export function FilterButton({ className, ...props }: KitButtonProps) {
  return (
    <KitButton
      variant="ghost"
      size="m"
      className={cn(
        "box-border flex items-center gap-1 p-[6px] pl-[10px] font-semibold hover:border-neutral-800 hover:bg-white hover:text-neutral-800",
        className
      )}
      {...props}
    />
  )
}
