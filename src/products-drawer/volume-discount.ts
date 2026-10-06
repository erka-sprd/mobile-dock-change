// Volume discounts — the single source of truth for the whole prototype.
//
// These are the REAL tiers, not invented ones, and they are PER PRODUCT TYPE.
// create-omat fetches them from
// GET /api/v1/shops/{shopId}/discountScales?fullData=true&productTypeId={id}
// (src/services/Shop.ts → getDiscounts, consumed by src/hooks/useDiscount.ts,
// which puts productTypeId in the query key so switching product refetches),
// keeps the entries with credit.value > 0 and sorts them by valueRange.from.
//
// That endpoint returns a DIFFERENT scale per product type: in shop 1133169 the
// 32 catalogue products resolve to 7 distinct scales — a T-shirt tops out at
// 60% from 500+, the polo at 50% from 100+, a Stanley/Stella tote at 40% from
// 100+. The tables live in ./volume-discount-scales.generated.ts, captured from
// the public API by scripts/fetch-discount-scales.mjs (re-run it to refresh).
//
// The applicable tier is the one whose range contains the quantity (`to: null`
// means open-ended), exactly as useDiscount resolves it.

import {
    DEFAULT_VOLUME_DISCOUNT_TIERS,
    VOLUME_DISCOUNT_TIERS_BY_PRODUCT,
} from "./volume-discount-scales.generated"

export const VOLUME_DISCOUNT_MAX_QUANTITY = 100_000

export type VolumeDiscountTier = {
    from: number
    /** Inclusive upper bound; null for the open-ended top tier. */
    to: number | null
    percentage: number
}

export { DEFAULT_VOLUME_DISCOUNT_TIERS }

/**
 * The scale for a product type id. Unknown/omitted id falls back to the shop's
 * default scale — the same thing the API returns without a productTypeId.
 */
export function volumeDiscountTiers(productId?: string | null): VolumeDiscountTier[] {
    return (productId && VOLUME_DISCOUNT_TIERS_BY_PRODUCT[productId]) || DEFAULT_VOLUME_DISCOUNT_TIERS
}

/** Integer discount percentage for an order quantity (0 below the first tier). */
export function volumeDiscountPercentage(quantity: number, productId?: string | null): number {
    return (
        volumeDiscountTiers(productId).find(
            t => t.from <= quantity && (t.to ?? Infinity) >= quantity
        )?.percentage ?? 0
    )
}

/** The next tier a buyer could reach, or null once on the top one. */
export function nextVolumeDiscountTier(
    quantity: number,
    productId?: string | null
): VolumeDiscountTier | null {
    return volumeDiscountTiers(productId).find(t => t.from > quantity) ?? null
}

/** Quantity at which this product's discount starts. */
export function volumeDiscountMinQuantity(productId?: string | null): number {
    return volumeDiscountTiers(productId)[0].from
}

/** Best percentage this product can reach (its top tier). */
export function volumeDiscountMaxPercentage(productId?: string | null): number {
    const tiers = volumeDiscountTiers(productId)
    return tiers[tiers.length - 1].percentage
}

/**
 * Best percentage ANY product in the catalogue reaches — for surfaces that
 * front a whole product grid rather than one product (the "Up to X%" teaser in
 * the products drawer's calculator), where no single scale applies.
 */
export const VOLUME_DISCOUNT_BEST_MAX_PERCENTAGE = Object.values(
    VOLUME_DISCOUNT_TIERS_BY_PRODUCT
).reduce(
    (best, tiers) => Math.max(best, tiers[tiers.length - 1].percentage),
    DEFAULT_VOLUME_DISCOUNT_TIERS[DEFAULT_VOLUME_DISCOUNT_TIERS.length - 1].percentage
)

/**
 * The five rows create-omat shows in its volume-discount dialog: first, last and
 * three evenly spaced in between. Port of getMajorThresholds in
 * src/components/ui/volume-discount/VolumeDiscountContent.tsx — a real scale has
 * far too many tiers (up to 11) to list them all.
 */
export function majorVolumeDiscountTiers(
    tiers: VolumeDiscountTier[] = DEFAULT_VOLUME_DISCOUNT_TIERS
): VolumeDiscountTier[] {
    if (tiers.length <= 5) return tiers
    const step = Math.floor((tiers.length - 2) / 3)
    return [
        tiers[0],
        ...Array.from({ length: 3 }, (_, i) => tiers[1 + i * step]),
        tiers[tiers.length - 1],
    ]
}

/** The five dialog rows for a product type id. */
export function majorVolumeDiscountTiersForProduct(
    productId?: string | null
): VolumeDiscountTier[] {
    return majorVolumeDiscountTiers(volumeDiscountTiers(productId))
}

/**
 * Applies a whole-percentage discount, rounding the discount to whole cents —
 * port of create-omat's getDiscountedPrice.
 */
export function discountedPrice(price: number, percentage: number): number {
    const discount = percentage ? Math.round(price * percentage) / 100 : 0
    return price - discount
}
