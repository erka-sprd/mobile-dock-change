

import { useState, type CSSProperties, type ReactNode } from "react"

import { cn } from "./utils"
import { SpreadLogoIcon } from "./kit-icons"
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
  CarouselDots,
} from "./carousel"

export type ProductTileData = {
  id: string
  image: string
  /** appearance (colour) id shown as the tile preview */
  appearanceId: string
  /** model / mood images shown in the hover carousel (absolute URLs). */
  modelImages?: string[]
  price: string
  priceValue: number
  brand: string
  name: string
  colors: string[]
  /** Swatches with per-colour preview images — hovering one swaps the tile
      image to that colour, like create-omat's onAppearanceHover. Falls back
      to plain `colors` when absent. */
  swatches?: { color: string; image: string }[]
}

type ProductTileProps = {
  t: ProductTileData
  selected?: boolean
  quantity?: number
  topLeft?: ReactNode
  bottomCenter?: ReactNode
  /** Volume-discount display (create-omat sale styling): red price, struck
      original, muted caption. `price`/`original` are preformatted strings. */
  sale?: { price?: string; original?: string; caption?: string }
  /** Skeleton the price row (and caption) while bulk prices update. */
  priceLoading?: boolean
}

const eur = (n: number) => n.toFixed(2).replace(".", ",") + " €"

// Kit Appearance borders only bright swatches (border-neutral-400); rough
// luminance check standing in for the kit's isBrightColor.
const isBrightColor = (hex: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return true
  const int = parseInt(m[1], 16)
  return (((int >> 16) & 255) * 299 + ((int >> 8) & 255) * 587 + (int & 255) * 114) / 1000 > 200
}

// The kit chevron SVGs are fill="black"; mask them so the shape paints in the
// button's currentColor (white on the black arrow buttons) instead.
const chevronMask = (icon: string): CSSProperties => ({
  maskImage: `url(${icon})`,
  WebkitMaskImage: `url(${icon})`,
  maskRepeat: "no-repeat",
  WebkitMaskRepeat: "no-repeat",
  maskPosition: "center",
  WebkitMaskPosition: "center",
  maskSize: "contain",
  WebkitMaskSize: "contain",
})

// Shared product tile (kit ProductCard style): gray image area, price,
// brand + name, and a row of colour swatches (+N). Width is controlled by
// the parent so it works in both the carousel and the drawers' grids.
// Optional overlays render inside the gray image box.
export default function ProductTile({
  t,
  selected = false,
  quantity,
  topLeft,
  bottomCenter,
  sale,
  priceLoading = false,
}: ProductTileProps) {
  // Kit Appearances: up to 7 swatches, then "+N".
  const swatchItems: { color: string; image?: string }[] = t.swatches ?? t.colors.map(color => ({ color }))
  const shown = swatchItems.slice(0, 7)
  const extra = swatchItems.length - shown.length
  const models = t.modelImages ?? []
  const [hovered, setHovered] = useState(false)
  // Hovering a swatch previews that colour in the image area (production's
  // onAppearanceHover / activeAppearanceImage behaviour).
  const [hoverImage, setHoverImage] = useState<string | null>(null)
  return (
    <div className="w-full">
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={cn(
          "group relative flex aspect-[4/5] items-center justify-center overflow-hidden bg-neutral-100",
          selected && "border-2 border-black"
        )}
      >
        <img src={hoverImage ?? t.image} alt={t.name} className="h-full w-full object-contain" />
        {models.length > 0 && (
          <div
            className={cn(
              "absolute inset-0 transition-opacity duration-200",
              hovered ? "opacity-100" : "pointer-events-none opacity-0"
            )}
          >
            {hovered &&
              (models.length === 1 ? (
                <img src={models[0]} alt="" className="h-full w-full object-cover" />
              ) : (
                <Carousel
                  className="h-full [&_[data-slot=carousel-content]]:h-full"
                  opts={{ loop: true }}
                >
                  <CarouselContent className="ml-0 h-full">
                    {models.map((src, i) => (
                      <CarouselItem key={i} className="h-full pl-0">
                        <img src={src} alt="" className="h-full w-full object-cover" />
                      </CarouselItem>
                    ))}
                  </CarouselContent>
                  {/* Controls layer: clicks here don't select the product. */}
                  <div
                    className="pointer-events-none absolute inset-0"
                    onClick={e => e.stopPropagation()}
                  >
                    <CarouselPrevious className="pointer-events-auto left-2 size-10 cursor-pointer border-none bg-black text-white shadow-md hover:bg-neutral-800 hover:text-white">
                      <span
                        aria-hidden
                        className="size-6 bg-current"
                        style={chevronMask("/icons/icon-chevron-left.svg")}
                      />
                    </CarouselPrevious>
                    <CarouselNext className="pointer-events-auto right-2 size-10 cursor-pointer border-none bg-black text-white shadow-md hover:bg-neutral-800 hover:text-white">
                      <span
                        aria-hidden
                        className="size-6 bg-current"
                        style={chevronMask("/icons/icon-chevron-right.svg")}
                      />
                    </CarouselNext>
                    <CarouselDots className="pointer-events-auto" />
                  </div>
                </Carousel>
              ))}
          </div>
        )}
        {topLeft && <div className="absolute top-2 left-2 z-10">{topLeft}</div>}
        {bottomCenter && <div className="absolute inset-x-0 bottom-0 z-10">{bottomCenter}</div>}
      </div>
      {/* Info rows per create-omat's ProductTile: color swatches → brand +
          name → price block ("from" + bold price, sale red + struck original,
          caption) in a gap-2 column. */}
      <div className="mt-2 flex flex-col gap-2 text-left">
        <ul className="flex h-4 items-center gap-0.5">
          {shown.map((s, i) => (
            <li
              key={i}
              onMouseEnter={s.image ? () => setHoverImage(s.image!) : undefined}
              onMouseLeave={s.image ? () => setHoverImage(null) : undefined}
              className={cn(s.image && "cursor-pointer")}
            >
              <span
                className={cn(
                  "block size-2.5 rounded-full",
                  isBrightColor(s.color) && "border border-neutral-400"
                )}
                style={{ backgroundColor: s.color }}
              />
            </li>
          ))}
          {extra > 0 && <li className="text-xs">+{extra}</li>}
        </ul>
        <div>
          <div className="mb-0.5 flex h-4 items-center">
            {t.brand.trim().toLowerCase() === "spread" ? (
              <SpreadLogoIcon />
            ) : (
              <p className="text-sm font-bold text-black">{t.brand}</p>
            )}
          </div>
          <p className="truncate text-sm text-black">{t.name}</p>
        </div>
        <div className="mt-0.5 text-sm">
          {priceLoading ? (
            // Production's price skeleton (h-5 row, h-3 w-24 pulse bar).
            <>
              <div className="flex h-5 items-center">
                <div className="h-3 w-24 animate-pulse rounded bg-neutral-200" />
              </div>
              {sale?.caption && (
                <div className="flex h-4 items-center">
                  <div className="h-2.5 w-36 animate-pulse rounded bg-neutral-200" />
                </div>
              )}
            </>
          ) : (
            <>
              <p>
                <span className={cn("font-medium", sale?.price && "text-red-600")}>from </span>
                <span className={cn("font-bold", sale?.price && "text-red-600")}>
                  {sale?.price ?? t.price}
                </span>
                {sale?.price && (
                  <span className="ml-2 font-medium text-neutral-700 line-through">
                    {sale.original ?? t.price}
                  </span>
                )}
                {quantity && quantity > 1 ? (
                  <span className="text-neutral-400">
                    {" "}
                    x {quantity} = {eur(t.priceValue * quantity)}
                  </span>
                ) : null}
              </p>
              {sale?.caption && <p className="text-xs text-neutral-600">{sale.caption}</p>}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
