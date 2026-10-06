

import { useEffect, useState } from "react"

import { Minus, Plus } from "lucide-react"

import { cn } from "./utils"
import { DiscountIcon } from "./kit-icons"
import { KitButton } from "./kit-button"
import { VOLUME_DISCOUNT_MAX_QUANTITY } from "./volume-discount"

// Replica of create-omat's DesktopVolumeDiscountPanel + VolumeDiscountQuantityField
// (size m): light-purple brand-blue-contrast box with headline, quantity
// stepper and an "Update prices" kit button. The live stepper value only takes
// effect when the button is pressed, like production.

const QUANTITY_FIELD_ID = "volume-discount-order-quantity"
const MIN_QUANTITY = 1

// Entrance of the split panel, 500ms end to end, in two steps: the artwork
// column starts at zero width with the calculator using the full panel and
// expands to its half, pushing the calculator across; only once that has landed
// does the illustration scale up, with a slight bounce.
const PUSH_MS = 300
const ART_MS = 200

// Volume-discount red, matching every other discount surface in the proto
// (the rail banner, the size sheet's tier line, the basket). Was the kit's
// --brand-blue-contrast purple (#bfb9fd), which read as unrelated to the
// discount it announces. Ground only — the type on it stays black.
const PANEL_BG = "#FFEEEB"

type QuantityFieldProps = {
  id?: string
  quantity: number
  onQuantityChange: (value: number) => void
  /** kit sizes: m = h-10/w-12 buttons (desktop panel), l = h-12/w-18 (mobile drawer) */
  size?: "m" | "l"
  /** Picks up the panel's red frame plus a segment travelling around it, to draw
      the eye to the field. Opt-in: the mobile drawer and the tier dialog use the
      plain neutral field. */
  attention?: boolean
}

// The field's borders are neutral on both surfaces — the red frame around the
// desktop panel is the discount signal, the control inside it reads as an
// ordinary input.
const FIELD_BORDER = "border-neutral-200"

// The travelling-border nudge is a one-off per page session, and both copies of
// the panel (in-grid and sidebar) have to stop together — hence a module-level
// flag with listeners rather than per-component state, which would leave the
// other copy still spinning and would restart every time the drawer reopens.
let attentionDismissed = false
const attentionListeners = new Set<() => void>()

function dismissAttention() {
  if (attentionDismissed) return
  attentionDismissed = true
  attentionListeners.forEach(notify => notify())
}

export function QuantityField({
  id,
  quantity,
  onQuantityChange,
  size = "m",
  attention = false,
}: QuantityFieldProps) {
  // What the user is typing, while they are typing. null means "show the
  // committed quantity". Without this the field could never be cleared: every
  // keystroke was clamped to the minimum, so deleting "1" put "1" straight
  // back and typing "30" was impossible.
  const [draft, setDraft] = useState<string | null>(null)

  // Mounts already-stopped if the nudge was dismissed earlier this session.
  const [spinning, setSpinning] = useState(!attentionDismissed)
  useEffect(() => {
    if (!attention || attentionDismissed) return
    const stop = () => setSpinning(false)
    attentionListeners.add(stop)
    return () => {
      attentionListeners.delete(stop)
    }
  }, [attention])

  const handleInputChange = (raw: string) => {
    const digits = raw.replace(/\D/g, "")
    if (digits === "") {
      // Allowed to stand empty while editing; blur decides what it means.
      setDraft("")
      return
    }
    const next = Math.min(VOLUME_DISCOUNT_MAX_QUANTITY, Number(digits))
    setDraft(String(next))
    // 0 is only ever an intermediate state (e.g. before typing "0" + "5"), so
    // it is not committed — blur resolves it.
    if (next >= MIN_QUANTITY) onQuantityChange(next)
  }

  // Empty or 0 on the way out reverts to the minimum; anything else is already
  // committed.
  const handleBlur = () => {
    if (draft !== null && (draft === "" || Number(draft) < MIN_QUANTITY)) {
      onQuantityChange(MIN_QUANTITY)
    }
    setDraft(null)
  }

  const stepButton = (dir: -1 | 1) => (
    <button
      type="button"
      onClick={() => {
        // Stepping abandons whatever was half-typed.
        setDraft(null)
        onQuantityChange(
          Math.min(VOLUME_DISCOUNT_MAX_QUANTITY, Math.max(MIN_QUANTITY, quantity + dir))
        )
      }}
      disabled={dir === -1 ? quantity <= MIN_QUANTITY : quantity >= VOLUME_DISCOUNT_MAX_QUANTITY}
      aria-label={dir === -1 ? "Decrease quantity" : "Increase quantity"}
      className={cn(
        "flex h-full cursor-pointer items-center justify-center hover:bg-neutral-100 disabled:pointer-events-none disabled:opacity-40",
        size === "m" ? "w-12" : "w-18",
        dir === -1 ? "border-r" : "border-l",
        FIELD_BORDER
      )}
    >
      {dir === -1 ? <Minus className="size-4" /> : <Plus className="size-4" />}
    </button>
  )

  return (
    <div
      className={cn(
        "flex w-full items-stretch border bg-white",
        size === "m" ? "h-10" : "h-12",
        // relative so the travelling segment can be positioned against the box.
        // While nudging: 2px in the panel's red, matching the moving segment's
        // thickness. Once dismissed it settles back to the ordinary neutral
        // field, fading over the same 400ms as the segment.
        attention
          ? cn(
              "sprd-spin-border relative transition-[border-color,border-width] duration-[400ms]",
              spinning ? "border-2 border-[#F8C6C4]" : `border ${FIELD_BORDER}`
            )
          : FIELD_BORDER
      )}
      {...(attention
        ? {
            "data-spin": spinning ? "on" : "off",
            // Capture, so stepping or typing counts as interaction too — the
            // events reach this box before the buttons and the input handle them.
            onPointerDownCapture: dismissAttention,
            onFocusCapture: dismissAttention,
          }
        : {})}
    >
      {stepButton(-1)}
      <div className="flex flex-1 items-stretch border-2 border-transparent focus-within:border-black">
        <input
          id={id}
          name={id}
          type="text"
          inputMode="numeric"
          value={draft ?? String(quantity)}
          onChange={e => handleInputChange(e.target.value)}
          onBlur={handleBlur}
          aria-label="Order quantity"
          className="w-full min-w-0 border-0 bg-transparent px-2 text-center font-bold focus:outline-none"
        />
      </div>
      {stepButton(1)}
    </div>
  )
}

type VolumeDiscountPanelProps = {
  quantity: number
  onQuantityChange: (value: number) => void
  onUpdatePrices: () => void
  isUpdating?: boolean
  /** override when the panel renders twice on one screen — ids must stay unique */
  fieldId?: string
  /** two-column layout for the wide in-grid copy: illustration in one half,
      title and calculator together in the other */
  split?: boolean
  className?: string
}

export default function VolumeDiscountPanel({
  quantity,
  onQuantityChange,
  onUpdatePrices,
  isUpdating = false,
  fieldId = QUANTITY_FIELD_ID,
  split = false,
  className,
}: VolumeDiscountPanelProps) {
  // The split panel mounts with the artwork column collapsed and expands it on
  // the next frame, so the drawer opening plays the reveal. Two frames, because
  // the collapsed state has to be painted before the transition can run from it.
  const [revealed, setRevealed] = useState(false)
  useEffect(() => {
    if (!split) return
    let inner = 0
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setRevealed(true))
    })
    return () => {
      cancelAnimationFrame(outer)
      cancelAnimationFrame(inner)
    }
  }, [split])

  // Icon and headline share one red so the glyph reads as part of the title
  // rather than a separate mark. Both lines of the title share one type
  // treatment, so the block reads as a single headline.
  const headline = (
    // 16px below the title before the calculator starts.
    <div className={cn(split ? "mb-6" : "mb-8")}>
      {/* Kit Discount glyph above the title, left aligned. Sized in px rather
          than a size-* utility because 52px is off the spacing scale. */}
      <DiscountIcon className="mb-3 h-[52px] w-[52px] text-[var(--sprd-red-800)]" />
      <div className="font-display text-xl font-bold text-[var(--sprd-red-800)]">
        <p>Calculate</p>
        <p>volume discounts</p>
      </div>
    </div>
  )

  const calculator = (
    <>
      <div className="mb-3 flex flex-col">
        <label htmlFor={fieldId} className="mb-2 text-sm">
          Order quantity
        </label>
        <QuantityField
          id={fieldId}
          quantity={quantity}
          onQuantityChange={onQuantityChange}
          attention
        />
      </div>
      <KitButton
        size="l"
        className="w-full font-semibold"
        onClick={onUpdatePrices}
        disabled={isUpdating}
      >
        {isUpdating ? (
          <span className="flex items-center justify-center">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-700" />
          </span>
        ) : (
          "Update prices"
        )}
      </KitButton>
      {/* Stacked layout: the panel stretches to the tile row, so mt-auto drops
          this to the bottom edge instead of leaving a gap under it. pt-4 keeps
          minimum air above it when the panel is short enough to have none to
          spare. The split column centres its content, so it keeps a fixed
          margin — mt-auto would fight justify-center there. */}
      <p
        className={cn(
          "text-xs font-medium text-[var(--sprd-neutral-800)]",
          split ? "mt-4" : "mt-auto pt-4"
        )}
      >
        Prices are per item for an order of {quantity} {quantity === 1 ? "product" : "products"}.
        Excl. printing.
      </p>
    </>
  )

  return (
    <div
      // #F8C6C4 is #DC2626 at 20% already composited over the #FFEEEB ground.
      // Using the flat value rather than an alpha keeps the frame and the
      // stepper identical — with alpha the stepper blends into its white fill
      // instead and renders visibly lighter.
      className={cn(
        "flex border border-[#F8C6C4]",
        // Split: both columns stretch to the panel height so the calculator can
        // centre. No left padding — the artwork column runs to the panel edge,
        // so the padding lives on the other three sides only.
        split ? "flex-row items-stretch py-6 pr-6" : "flex-col p-6",
        className
      )}
      style={{
        // #FFEEEB is already the light tint, so it is used as-is rather than
        // mixed down the way the purple was.
        backgroundColor: PANEL_BG,
      }}
    >
      {split ? (
        <>
          {/* Artwork column: the illustration sits centred in both axes and is
              capped so it never outgrows the column or the panel height. It
              carries its own 24px side padding — the panel drops its left
              padding for this column, and keeping the inset symmetric here
              leaves the image centred. Width and padding animate together, so
              the collapsed column takes up no space at all on the way in. */}
          <div
            className={cn(
              "flex shrink-0 items-center justify-center transition-[width,padding] ease-out motion-reduce:transition-none",
              revealed ? "w-1/2 px-8" : "w-0 px-0"
            )}
            style={{ transitionDuration: `${PUSH_MS}ms` }}
          >
            {/* Scales up only after the push has landed, so the overshoot plays
                against a column that has stopped moving and stays inside its
                padding — the bounce never laps the calculator. */}
            <img
              src="/images/volume-discount-illustration.png"
              alt=""
              className={cn(
                // Tailwind v4's scale-* utilities set the standalone `scale`
                // property, not `transform` — transition-transform would never
                // fire on them.
                "max-h-full max-w-full object-contain transition-[scale] motion-reduce:transition-none",
                revealed ? "scale-100" : "scale-0"
              )}
              style={{
                transitionDuration: `${ART_MS}ms`,
                transitionDelay: `${PUSH_MS}ms`,
                transitionTimingFunction: "cubic-bezier(0.34,1.56,0.64,1)",
              }}
            />
          </div>
          <div className="flex min-w-0 flex-1 flex-col justify-center">
            {headline}
            {calculator}
          </div>
        </>
      ) : (
        <>
          {headline}
          {calculator}
        </>
      )}
    </div>
  )
}
