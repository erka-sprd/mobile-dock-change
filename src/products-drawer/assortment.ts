import type { StaticProduct } from "product-catalog-client"

// ============================================================================
// Derived assortment data for the products drawer (categories + filters).
//
// The static catalogue carries no category/gender/color-group fields, so this
// module derives them from what the 32 products DO have: name, description,
// sizes, brand, fit hint, appearance hexes and print-type ids. The shapes
// mirror create-omat's assortment types (FilterSection / CategoryNode) so the
// UI can later be rewired to the real assortment API without changing shape.
// ============================================================================

export type FilterOption = {
    id: string
    label: string
    /** swatch hex — color filter only */
    color?: string
    productIds: string[]
}

export type FilterSection = {
    id: string
    label: string
    type: "radio" | "checkbox" | "color" | "size" | "toggle" | "price"
    options?: FilterOption[]
    /** toggle sections: the products the toggle narrows to */
    productIds?: string[]
    /** brand: show an inline search input */
    searchable?: boolean
    priceMin?: number
    priceMax?: number
}

export type CategoryNode = {
    id: string
    label: string
    productIds: string[]
    children?: CategoryNode[]
}

export const SORT_OPTIONS = [
    { id: "popular", label: "Most popular" },
    { id: "price", label: "Price: low to high" },
    { id: "priceReverse", label: "Price: high to low" },
] as const
export type SortId = (typeof SORT_OPTIONS)[number]["id"]

// --- Facet derivation --------------------------------------------------------

type Garment =
    | "tshirt"
    | "longsleeve"
    | "tank"
    | "hoodie"
    | "polo"
    | "pants"
    | "bodysuit"
    | "cap"
    | "socks"
    | "bag"
    | "mug"
    | "sticker"
    | "poster"
    | "pillow"
    | "other"

type Gender = "men" | "women" | "kids" | "unisex" | "none"

type Facets = {
    garment: Garment
    gender: Gender
    apparel: boolean
    sustainable: boolean
    colorFamilies: Set<string>
    sizeGroups: Set<string>
}

function deriveGarment(name: string): Garment {
    const n = name.toLowerCase()
    if (/bodysuit/.test(n)) return "bodysuit"
    if (/shorts|sweatpants|jogger|jogging|trousers|leggings/.test(n)) return "pants"
    if (/polo/.test(n)) return "polo"
    if (/hoodie|sweatshirt|sweater|zip/.test(n)) return "hoodie"
    if (/tank|top\b/.test(n)) return "tank"
    if (/longsleeve|long sleeve|long-sleeve/.test(n)) return "longsleeve"
    if (/t-shirt|tee\b|shirt/.test(n)) return "tshirt"
    if (/cap|hat|beanie/.test(n)) return "cap"
    if (/sock/.test(n)) return "socks"
    if (/bag|backpack|tote/.test(n)) return "bag"
    if (/mug|bottle|cup/.test(n)) return "mug"
    if (/sticker/.test(n)) return "sticker"
    if (/poster|print\b/.test(n)) return "poster"
    if (/pillow/.test(n)) return "pillow"
    return "other"
}

function deriveGender(name: string, garment: Garment): Gender {
    const n = name.toLowerCase()
    if (/kids|kid'|kid’|baby|babies|toddler/.test(n)) return "kids"
    if (/women|ladies/.test(n)) return "women"
    if (/\bmen\b|men'|men’|\bmens\b/.test(n)) return "men"
    // Wearables without an explicit gender are unisex; home & living has none.
    if (garment === "mug" || garment === "sticker" || garment === "poster" || garment === "pillow")
        return "none"
    return "unisex"
}

const APPAREL: Garment[] = ["tshirt", "longsleeve", "tank", "hoodie", "polo", "pants", "bodysuit"]

const ADULT_SIZE_TOKENS = ["XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL", "5XL"]

function deriveSizeGroups(sizes: string[]): Set<string> {
    const groups = new Set<string>()
    for (const raw of sizes) {
        const s = raw.trim()
        if (/one size/i.test(s)) groups.add("One Size")
        else if (ADULT_SIZE_TOKENS.includes(s.toUpperCase())) groups.add(s.toUpperCase())
    }
    return groups
}

// --- Color families (hex → family) ------------------------------------------

export const COLOR_FAMILIES: { id: string; label: string; hex: string }[] = [
    { id: "black", label: "Black", hex: "#000000" },
    { id: "grey", label: "Grey", hex: "#9A9A9A" },
    { id: "white", label: "White", hex: "#FFFFFF" },
    { id: "beige", label: "Beige", hex: "#D9C8A9" },
    { id: "brown", label: "Brown", hex: "#8B5A2B" },
    { id: "red", label: "Red", hex: "#D41C28" },
    { id: "orange", label: "Orange", hex: "#EF7C00" },
    { id: "yellow", label: "Yellow", hex: "#FACE48" },
    { id: "green", label: "Green", hex: "#1E9658" },
    { id: "blue", label: "Blue", hex: "#1F5CB4" },
    { id: "purple", label: "Purple", hex: "#7C5CBF" },
    { id: "pink", label: "Pink", hex: "#E96F98" },
]

function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
    if (!m) return null
    const int = parseInt(m[1], 16)
    const r = ((int >> 16) & 255) / 255
    const g = ((int >> 8) & 255) / 255
    const b = (int & 255) / 255
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const l = (max + min) / 2
    if (max === min) return { h: 0, s: 0, l }
    const d = max - min
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    let h: number
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60
    else if (max === g) h = ((b - r) / d + 2) * 60
    else h = ((r - g) / d + 4) * 60
    return { h, s, l }
}

export function classifyColor(hex: string): string {
    const hsl = hexToHsl(hex)
    if (!hsl) return "grey"
    const { h, s, l } = hsl
    // Achromatic first
    if (s < 0.1) {
        if (l > 0.85) return "white"
        if (l < 0.16) return "black"
        return "grey"
    }
    if (l < 0.13 && s < 0.4) return "black"
    if (l > 0.94 && s < 0.35) return "white"
    // Warm neutrals
    if (h >= 15 && h <= 60 && s < 0.45 && l > 0.6) return "beige"
    if (h >= 15 && h <= 50 && l < 0.55 && s < 0.5) return "brown"
    // Hue buckets
    if (h < 15 || h >= 345) return l > 0.75 ? "pink" : "red"
    if (h < 45) return "orange"
    if (h < 70) return "yellow"
    if (h < 170) return "green"
    if (h < 255) return "blue"
    if (h < 300) return "purple"
    return "pink"
}

// --- Per-product facets ------------------------------------------------------

function deriveFacets(p: StaticProduct): Facets {
    const garment = deriveGarment(p.name)
    const text = `${p.name} ${p.details?.description ?? ""}`.toLowerCase()
    return {
        garment,
        gender: deriveGender(p.name, garment),
        apparel: APPAREL.includes(garment),
        sustainable: /organic|recycled|sustainab/.test(text),
        colorFamilies: new Set(p.appearances.map(a => classifyColor(a.color))),
        sizeGroups: deriveSizeGroups(p.sizes),
    }
}

export type FacetedProduct = { product: StaticProduct; facets: Facets }

export function deriveAllFacets(products: StaticProduct[]): FacetedProduct[] {
    return products.map(product => ({ product, facets: deriveFacets(product) }))
}

// --- Category tree -----------------------------------------------------------
// Modeled on the Spreadshirt CYO tree: top level is Clothing / Accessories /
// Home & Living, with the gender split nested under Clothing. Leaves are
// predicates over the derived facets; branches with no matching products stay
// in the tree (rendered greyed out) so the structure is ready for a bigger
// catalogue later.

type TreeDef = {
    id: string
    label: string
    match?: (f: Facets) => boolean
    children?: TreeDef[]
}

const adult = (f: Facets) => f.gender !== "kids"
const forMen = (f: Facets) => adult(f) && (f.gender === "men" || f.gender === "unisex")
const forWomen = (f: Facets) => adult(f) && (f.gender === "women" || f.gender === "unisex")

const TREE_DEF: TreeDef[] = [
    {
        id: "clothing",
        label: "Clothing",
        children: [
            {
                id: "men",
                label: "Men",
                children: [
                    {
                        id: "men-tshirts",
                        label: "T-shirts",
                        match: f => f.garment === "tshirt" && forMen(f),
                    },
                    {
                        id: "men-tanks",
                        label: "Tank tops",
                        match: f => f.garment === "tank" && forMen(f),
                    },
                    {
                        id: "men-hoodies",
                        label: "Hoodies & Sweatshirts",
                        match: f => f.garment === "hoodie" && forMen(f),
                    },
                    {
                        id: "men-polos",
                        label: "Polo shirts",
                        match: f => f.garment === "polo" && forMen(f),
                    },
                    {
                        id: "men-longsleeve",
                        label: "Long sleeve shirts",
                        match: f => f.garment === "longsleeve" && forMen(f),
                    },
                    {
                        id: "men-pants",
                        label: "Trousers & Shorts",
                        match: f => f.garment === "pants" && forMen(f),
                    },
                    { id: "men-jackets", label: "Jackets & Vests" },
                ],
            },
            {
                id: "women",
                label: "Women",
                children: [
                    {
                        id: "women-tshirts",
                        label: "T-shirts",
                        match: f => f.garment === "tshirt" && forWomen(f),
                    },
                    {
                        id: "women-tops",
                        label: "Tops & Tank tops",
                        match: f => f.garment === "tank" && forWomen(f),
                    },
                    {
                        id: "women-hoodies",
                        label: "Hoodies & Sweatshirts",
                        match: f => f.garment === "hoodie" && forWomen(f),
                    },
                    {
                        id: "women-polos",
                        label: "Polo shirts",
                        match: f => f.garment === "polo" && forWomen(f),
                    },
                    {
                        id: "women-longsleeve",
                        label: "Long sleeve shirts",
                        match: f => f.garment === "longsleeve" && forWomen(f),
                    },
                    {
                        id: "women-pants",
                        label: "Trousers & Shorts",
                        match: f => f.garment === "pants" && forWomen(f),
                    },
                    { id: "women-dresses", label: "Dresses & Skirts" },
                ],
            },
            {
                id: "kids",
                label: "Kids & Babies",
                children: [
                    {
                        id: "kids-tshirts",
                        label: "T-shirts",
                        match: f => f.garment === "tshirt" && f.gender === "kids",
                    },
                    {
                        id: "kids-hoodies",
                        label: "Hoodies & Sweatshirts",
                        match: f => f.garment === "hoodie" && f.gender === "kids",
                    },
                    {
                        id: "kids-caps",
                        label: "Caps",
                        match: f => f.garment === "cap" && f.gender === "kids",
                    },
                    {
                        id: "kids-socks",
                        label: "Socks",
                        match: f => f.garment === "socks" && f.gender === "kids",
                    },
                    {
                        id: "kids-pants",
                        label: "Trousers & Shorts",
                        match: f => f.garment === "pants" && f.gender === "kids",
                    },
                    {
                        id: "kids-bodysuits",
                        label: "Baby Bodysuits",
                        match: f => f.garment === "bodysuit",
                    },
                ],
            },
        ],
    },
    {
        id: "accessories",
        label: "Accessories",
        children: [
            { id: "acc-caps", label: "Caps & Hats", match: f => f.garment === "cap" },
            { id: "acc-bags", label: "Bags & Backpacks", match: f => f.garment === "bag" },
            { id: "acc-socks", label: "Socks", match: f => f.garment === "socks" },
            { id: "acc-aprons", label: "Aprons" },
            { id: "acc-phone", label: "Phone Cases" },
        ],
    },
    {
        id: "home",
        label: "Home & Living",
        children: [
            { id: "home-mugs", label: "Mugs & Drinkware", match: f => f.garment === "mug" },
            { id: "home-posters", label: "Posters", match: f => f.garment === "poster" },
            { id: "home-pillows", label: "Pillows & Blankets", match: f => f.garment === "pillow" },
        ],
    },
    {
        id: "stickers",
        label: "Stickers",
        match: f => f.garment === "sticker",
    },
]

function buildNode(def: TreeDef, faceted: FacetedProduct[]): CategoryNode {
    const children = (def.children ?? []).map(child => buildNode(child, faceted))
    const own = def.match ? faceted.filter(fp => def.match!(fp.facets)).map(fp => fp.product.id) : []
    return {
        id: def.id,
        label: def.label,
        productIds: [...new Set([...own, ...children.flatMap(c => c.productIds)])],
        ...(children.length ? { children } : {}),
    }
}

export function buildCategoryTree(faceted: FacetedProduct[]): CategoryNode[] {
    return TREE_DEF.map(def => buildNode(def, faceted))
}

export function findCategory(tree: CategoryNode[], id: string): CategoryNode | undefined {
    for (const node of tree) {
        if (node.id === id) return node
        const hit = node.children && findCategory(node.children, id)
        if (hit) return hit
    }
    return undefined
}

// --- Search ------------------------------------------------------------------
// Port of create-omat's searchProductTypesByName: every whitespace-separated
// token must be a substring of the product name (case-insensitive).

export function searchProductsByName(products: StaticProduct[], query: string): StaticProduct[] {
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean)
    if (tokens.length === 0) return products
    return products.filter(p => {
        const name = p.name.toLowerCase()
        return tokens.every(token => name.includes(token))
    })
}

// --- Filter sections ---------------------------------------------------------

const option = (id: string, label: string, productIds: string[], color?: string): FilterOption => ({
    id,
    label,
    productIds,
    ...(color ? { color } : {}),
})

/** ids of products whose facets pass the predicate */
const ids = (faceted: FacetedProduct[], pass: (fp: FacetedProduct) => boolean) =>
    faceted.filter(pass).map(fp => fp.product.id)

export function buildFilterSections(faceted: FacetedProduct[]): FilterSection[] {
    const sections: FilterSection[] = []

    // Gender (radio). "Men"/"Women" include unisex wearables, like the shop does.
    const genderOptions = [
        option("men", "Men", ids(faceted, fp => forMen(fp.facets) && fp.facets.gender !== "none")),
        option(
            "women",
            "Women",
            ids(faceted, fp => forWomen(fp.facets) && fp.facets.gender !== "none")
        ),
        option("kids", "Kids & Babies", ids(faceted, fp => fp.facets.gender === "kids")),
    ].filter(o => o.productIds.length > 0)
    if (genderOptions.length > 1)
        sections.push({ id: "gender", label: "Gender", type: "radio", options: genderOptions })

    // Size (chips)
    const sizeOptions = [...ADULT_SIZE_TOKENS, "One Size"]
        .map(size => option(size, size, ids(faceted, fp => fp.facets.sizeGroups.has(size))))
        .filter(o => o.productIds.length > 0)
    if (sizeOptions.length > 1)
        sections.push({ id: "size", label: "Size", type: "size", options: sizeOptions })

    // Color (swatch grid)
    const colorOptions = COLOR_FAMILIES.map(f =>
        option(f.id, f.label, ids(faceted, fp => fp.facets.colorFamilies.has(f.id)), f.hex)
    ).filter(o => o.productIds.length > 0)
    if (colorOptions.length > 1)
        sections.push({ id: "color", label: "Color", type: "color", options: colorOptions })

    // Price (slider, "up to X")
    const prices = faceted.map(fp => fp.product.price)
    if (prices.length)
        sections.push({
            id: "price",
            label: "Price",
            type: "price",
            priceMin: Math.floor(Math.min(...prices)),
            priceMax: Math.ceil(Math.max(...prices)),
        })

    // Toggles
    sections.push({
        id: "sustainable",
        label: "Sustainable",
        type: "toggle",
        productIds: ids(faceted, fp => fp.facets.sustainable),
    })
    sections.push({
        id: "embroidery",
        label: "Embroidery",
        type: "toggle",
        productIds: ids(faceted, fp => fp.product.embroidery),
    })

    // Fit (checkbox, from the size/fit hint)
    const fits = [...new Set(faceted.map(fp => fp.product.details?.sizeFitHint).filter(Boolean))]
    const fitOptions = fits
        .map(fit =>
            option(
                fit,
                fit.charAt(0).toUpperCase() + fit.slice(1),
                ids(faceted, fp => fp.product.details?.sizeFitHint === fit)
            )
        )
        .filter(o => o.productIds.length > 0)
    if (fitOptions.length > 1)
        sections.push({ id: "fit", label: "Fit", type: "checkbox", options: fitOptions })

    // Brand (searchable checkbox list)
    const brands = [...new Set(faceted.map(fp => fp.product.details?.brand).filter(Boolean))].sort()
    const brandOptions = brands.map(brand =>
        option(brand, brand, ids(faceted, fp => fp.product.details?.brand === brand))
    )
    if (brandOptions.length > 1)
        sections.push({
            id: "brand",
            label: "Brand",
            type: "checkbox",
            searchable: true,
            options: brandOptions,
        })

    return sections
}
