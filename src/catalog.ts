import {
  getCatalog,
  getPrintAreaOverlay,
  getProductType,
  buildOutOfStockMap,
  resolveImageUrl,
} from "product-catalog-client";
import type { StaticProduct, ProductTypeData } from "product-catalog-client";

// Base URL of the deployed product catalogue (data + images).
export const CATALOG_URL =
  process.env.REACT_APP_CATALOG_URL || "https://product-catalog-five-self.vercel.app";

export const img = (path: string | null | undefined) => resolveImageUrl(CATALOG_URL, path);

export type DockColor = { key: string; label: string; hex: string };
export type DockSlide = { label: string; viewId: string; src: string };
export type DockPrintArea = { x: number; y: number; w: number; h: number };

// Catalog-backed product, shaped for mobile-dock's existing UI.
export type DockProduct = {
  id: string;
  name: string;
  embroidery: boolean;
  price: number;
  colors: DockColor[];
  defaultColor: string;
  sizes: string[];
  outOfStock: Record<string, string[]>;
  /** Colours with every size out of stock — unselectable, like create-omat's
      out-of-stock appearance swatch. */
  soldOutColors: Set<string>;
  modelImageFront: string | null;
  thumbnail: (colorKey: string) => string;
  slidesFor: (colorKey: string) => DockSlide[];
  // Print areas as fractions of the view image, keyed by view label ("Front",
  // "Back", "Right", "Left", "Neck Label"). Same keys as DockSlide.label.
  printAreas: Record<string, DockPrintArea>;
  // Print area as fractions of the view image (or null if none for that view).
  printAreaFor: (viewId: string) => DockPrintArea | null;
  productType: ProductTypeData;
};

export function toDockProduct(p: StaticProduct): DockProduct {
  const pt = getProductType([p], p.id) as ProductTypeData;
  const appById = new Map(pt.appearances.map((a) => [a.id, a]));
  const colors: DockColor[] = pt.appearances.map((a) => ({
    key: a.id,
    label: a.name,
    hex: a.color,
  }));
  const sizes = pt.sizes.map((s) => s.name);
  const outOfStock = buildOutOfStockMap(pt.id, pt.appearances, pt.sizes);
  const soldOutColors = new Set(
    colors
      .filter((c) => sizes.length > 0 && sizes.every((s) => (outOfStock[c.key] ?? []).includes(s)))
      .map((c) => c.key)
  );
  // Never open a product on a colour nobody can buy.
  const preferred = pt.defaultAppearanceId || colors[0]?.key || "";
  const defaultColor = soldOutColors.has(preferred)
    ? colors.find((c) => !soldOutColors.has(c.key))?.key ?? preferred
    : preferred;

  const appFor = (key: string) => appById.get(key) ?? pt.appearances[0];

  const overlayToArea = (viewId: string): DockPrintArea | null => {
    const o = getPrintAreaOverlay(pt, viewId);
    return o ? { x: o.left / 100, y: o.top / 100, w: o.width / 100, h: o.height / 100 } : null;
  };

  // Pre-compute a label-keyed print-area map so the UI can look up by slide label.
  const printAreas: Record<string, DockPrintArea> = {};
  for (const v of pt.views) {
    const area = overlayToArea(v.id);
    if (area) printAreas[v.name] = area;
  }

  return {
    id: p.id,
    name: p.name,
    embroidery: p.embroidery,
    price: p.price,
    colors,
    defaultColor,
    sizes,
    outOfStock,
    soldOutColors,
    modelImageFront: pt.modelImageFront ? img(pt.modelImageFront) : null,
    thumbnail: (key) => img(appFor(key)?.image),
    slidesFor: (key) => {
      const a = appFor(key);
      return pt.views.map((v) => {
        const av = a?.views.find((x) => x.id === v.id);
        return { label: v.name, viewId: v.id, src: img(av?.image ?? a?.image) };
      });
    },
    printAreas,
    printAreaFor: overlayToArea,
    productType: pt,
  };
}

/** A safe empty product so the UI can render before the catalogue has loaded. */
export const EMPTY_DOCK_PRODUCT: DockProduct = {
  id: "",
  name: "",
  embroidery: false,
  price: 0,
  colors: [],
  defaultColor: "",
  sizes: [],
  outOfStock: {},
  soldOutColors: new Set(),
  modelImageFront: null,
  thumbnail: () => "",
  slidesFor: () => [],
  printAreas: {},
  printAreaFor: () => null,
  productType: { id: "", appearances: [], sizes: [], views: [] } as unknown as ProductTypeData,
};

export type DockCatalog = {
  products: DockProduct[];
  featuredProductId: string;
  /** Raw catalogue products with absolute image URLs — feeds the ported
      ProductsDrawer (buildTiles, filters, model-image carousel). */
  rawProducts: StaticProduct[];
};

// --- Raw-product helpers for the ported products drawer (from the main
// proto's lib/catalog.ts) --------------------------------------------------

// The catalogue carries a per-colour model-image library (all views × both
// crops) that the package types don't yet describe — model it locally.
export type ModelImageRef = { viewId: number; crop: string; image: string };
type AppearanceWithModels = StaticProduct["appearances"][number] & {
  modelImages?: ModelImageRef[];
};

// Rewrite every image field to an absolute catalogue URL once, at load time,
// so the drawer can use `.image` / `.preview` / `.modelImages` directly.
function absolutize(products: StaticProduct[]): StaticProduct[] {
  return products.map((p) => ({
    ...p,
    preview: img(p.preview),
    modelImageFront: p.modelImageFront ? img(p.modelImageFront) : null,
    appearances: p.appearances.map((a) => {
      const models = (a as AppearanceWithModels).modelImages;
      return {
        ...a,
        image: img(a.image),
        modelImage: a.modelImage ? img(a.modelImage) : null,
        views: a.views.map((v) => ({ ...v, image: img(v.image) })),
        ...(models
          ? { modelImages: models.map((m) => ({ ...m, image: img(m.image) })) }
          : {}),
      };
    }),
  }));
}

/**
 * All model/mood images for a product's tile hover carousel: every view of the
 * given colour, ordered by view, one crop. Falls back to the first colour that
 * has model images. Returns absolute URLs, or [] when none exist.
 */
export function modelImagesFor(
  product: StaticProduct,
  appearanceId?: string,
  crop: string = "detail"
): string[] {
  const appearances = product.appearances as AppearanceWithModels[];
  const source =
    appearances.find((a) => a.id === appearanceId && a.modelImages?.length) ??
    appearances.find((a) => a.modelImages?.length);
  const models = source?.modelImages;
  if (!models?.length) return [];

  const wanted = models.filter((m) => m.crop === crop);
  const list = (wanted.length ? wanted : models)
    .slice()
    .sort((a, b) => a.viewId - b.viewId)
    .map((m) => m.image);
  return Array.from(new Set(list));
}

/** Fetch the catalogue and adapt every product for mobile-dock. */
export async function loadDockProducts(): Promise<DockCatalog> {
  const { products, featuredProductId } = await getCatalog(CATALOG_URL);
  return {
    products: products.map(toDockProduct),
    featuredProductId,
    rawProducts: absolutize(products),
  };
}
