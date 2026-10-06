

import { cn } from "./utils"
import { KitButton } from "./kit-button"
import MobileDrawer from "./mobile-drawer"

import { QuantityField } from "./volume-discount-panel"

// Mobile price calculator, ported from create-omat's MobileVolumeDiscountDrawer:
// headline, size-L stepper, quick-select quantity pills, "Update prices".
// Like production, the quantity is applied by the parent when the drawer
// closes — the button just closes it.

const QUICK_SELECT_QUANTITIES = [1, 5, 20, 50, 100]

type MobileVolumeDiscountDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  quantity: number
  onQuantityChange: (value: number) => void
  maxDiscountPercentage: number
}

export default function MobileVolumeDiscountDrawer({
  open,
  onOpenChange,
  quantity,
  onQuantityChange,
  maxDiscountPercentage,
}: MobileVolumeDiscountDrawerProps) {
  return (
    <MobileDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={<span className="text-base font-medium">Calculate Volume Discount</span>}
      closeLabel="Close"
    >
      <div className="flex flex-col gap-4 px-4 pb-6">
        <p className="font-display text-2xl font-bold">Up to {maxDiscountPercentage}%</p>
        <p className="text-sm">Show prices for:</p>
        <QuantityField size="l" quantity={quantity} onQuantityChange={onQuantityChange} />
        <div className="flex w-full flex-wrap gap-2">
          {QUICK_SELECT_QUANTITIES.map(value => (
            <button
              key={value}
              type="button"
              onClick={() => onQuantityChange(value)}
              className={cn(
                "flex h-9 min-w-15.5 flex-1 cursor-pointer items-center justify-center rounded-full border text-sm",
                quantity === value
                  ? "border-black font-semibold ring-1 ring-black ring-inset"
                  : "border-neutral-300 hover:border-neutral-400 hover:bg-neutral-50"
              )}
            >
              {value === 100 ? "100+" : value}
            </button>
          ))}
        </div>
        <KitButton size="l" className="mt-6 w-full font-semibold" onClick={() => onOpenChange(false)}>
          Update prices
        </KitButton>
      </div>
    </MobileDrawer>
  )
}
