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
    defaultColor: pt.defaultAppearanceId || colors[0]?.key || "",
    sizes,
    outOfStock,
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
  modelImageFront: null,
  thumbnail: () => "",
  slidesFor: () => [],
  printAreas: {},
  printAreaFor: () => null,
  productType: { id: "", appearances: [], sizes: [], views: [] } as unknown as ProductTypeData,
};

export type DockCatalog = { products: DockProduct[]; featuredProductId: string };

/** Fetch the catalogue and adapt every product for mobile-dock. */
export async function loadDockProducts(): Promise<DockCatalog> {
  const { products, featuredProductId } = await getCatalog(CATALOG_URL);
  return { products: products.map(toDockProduct), featuredProductId };
}
