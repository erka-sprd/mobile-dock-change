import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Drawer } from "vaul";
import { CurvedText } from "./CurvedText";
import MobileEditSheet, { TextTab } from "./EditSheet";
import { GraphicEditorBar, MobileEditorBar } from "./EditorBar";
import EmbroideryPreview, { renderEmbroidery } from "./EmbroideryPreview";
import { DEFAULT_FONT_FAMILY, MAX_FONT_SIZE, getFontVariants, loadFont } from "./fonts";
import { TextCurveId, curveIdForPath, invalidateTextMetrics, textCurve } from "./textPath";
import { drawTextItem, rotatedExtent, textItemFamily, textItemFont, textItemSize } from "./textRender";
import SizeSelection from "./SizeSelection";
import { loadDockProducts, EMPTY_DOCK_PRODUCT, modelImagesFor } from "./catalog";
import type { DockProduct } from "./catalog";
import { buildTiles } from "product-catalog-client";
import type { StaticProduct } from "product-catalog-client";
import ProductsDrawer from "./products-drawer/products-drawer";
import "./products-drawer/tw.css";

/**
 * /scrollversion — the same screen with the checkout sheet laid out inline.
 *
 * A layout variant, nothing more: the sheet's content stops being a drawer
 * pinned to the bottom of the viewport and becomes an ordinary block under the
 * editor, so the page itself scrolls. Everything inside it is the same markup
 * the default route renders.
 *
 * Read once at module load — the route does not change without a reload. The
 * positioning it overrides is inline on the elements, so it is expressed as
 * CSS under `body.scroll-version` in styles.css; this flag only decides the two
 * things CSS cannot reach, the sheet's "expanded" state and the animation the
 * editor plays as the sheet rises.
 */
export const SCROLL_VERSION =
  typeof window !== "undefined" &&
  window.location.pathname.replace(/\/+$/, "") === "/scrollversion";

// What a fresh text says — an untouched placeholder is selected whole when
// editing starts, so the first keystroke replaces it (main proto behaviour).
const DEFAULT_TEXT_CONTENT = "Text";

const BASE_PRODUCT_PRICE = 17.98;
const SURCHARGE_EMBROIDERY = 6;
const SURCHARGE_STANDARD = 2;


const HEADER = 56;
const EDITOR_MIN = 170;
const THRESHOLD = 10;
// Room the product image leaves free at the stage's top and foot. By default
// only the foot (the sheet rides over it), which shifts the product upward.
// Inline the stage is a self-contained card with the Front/Back toolbar on top
// and the action bar at the foot, so it reserves the same at both ends and the
// product sits exactly on the card's vertical middle.
const EDITOR_TOP_OFFSET = SCROLL_VERSION ? 72 : 0;
const EDITOR_BOTTOM_OFFSET = SCROLL_VERSION ? 72 : 80;
/** Height of the box the product image is contained in. */
const productBoxH = (editorH: number) => editorH - EDITOR_TOP_OFFSET - EDITOR_BOTTOM_OFFSET;
/** Vertical centre of that box, in stage coordinates — the zoom origin. */
const productCenterY = (editorH: number) => EDITOR_TOP_OFFSET + productBoxH(editorH) / 2;

// Whether a hex colour is light enough that a dark checkmark reads better on it.
function isLightHex(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  // Perceived luminance (Rec. 601).
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.7;
}

function getContainRect(containerW: number, containerH: number, imgW: number, imgH: number) {
  const containerRatio = containerW / containerH;
  const imgRatio = imgW / imgH;
  let width: number, height: number;
  if (imgRatio > containerRatio) {
    width = containerW;
    height = containerW / imgRatio;
  } else {
    height = containerH;
    width = containerH * imgRatio;
  }
  return { left: (containerW - width) / 2, top: (containerH - height) / 2, width, height };
}

export default function App() {
  const editorRef = useRef<HTMLDivElement>(null);
  const imageNaturalSizeRef = useRef({ width: 1, height: 1 });
  const [imageNaturalSize, setImageNaturalSize] = useState({ width: 1, height: 1 });
  const [editorSize, setEditorSize] = useState({ width: 0, height: 0 });

  // Product catalogue, fetched at runtime from the shared catalog deployment.
  const [products, setProducts] = useState<DockProduct[]>([]);
  // Raw catalogue products feed the ported all-products drawer (tiles, filters).
  const [rawProducts, setRawProducts] = useState<StaticProduct[]>([]);
  const [selectedProductId, setSelectedProductId] = useState(
    () => localStorage.getItem("selectedProductId") ?? ""
  );
  const [selectedColor, setSelectedColor] = useState(
    () => localStorage.getItem("selectedColor") ?? ""
  );
  const selectedProduct =
    products.find(p => p.id === selectedProductId) ?? products[0] ?? EMPTY_DOCK_PRODUCT;

  // Load the catalogue once, then reconcile the selected product/colour against
  // what the catalogue actually contains (saved ids may be stale or empty).
  useEffect(() => {
    let cancelled = false;
    loadDockProducts().then(({ products: loaded, featuredProductId, rawProducts: raw }) => {
      if (cancelled) return;
      setProducts(loaded);
      setRawProducts(raw);
      const saved = localStorage.getItem("selectedProductId");
      const initial =
        loaded.find(p => p.id === saved) ??
        loaded.find(p => p.id === featuredProductId) ??
        loaded[0];
      if (!initial) return;
      setSelectedProductId(initial.id);
      const savedColor = localStorage.getItem("selectedColor");
      const colorOk = initial.colors.some(c => c.key === savedColor);
      setSelectedColor(colorOk ? savedColor! : initial.defaultColor);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Tiles for the all-products drawer, enriched with model/mood images for the
  // hover carousel — same derivation as the main proto's designer.
  const allTilesWithModel = useMemo(() => {
    const { allTiles } = buildTiles(rawProducts);
    return allTiles.map(t => {
      const product = rawProducts.find(p => p.id === t.id);
      return { ...t, modelImages: product ? modelImagesFor(product, t.appearanceId) : [] };
    });
  }, [rawProducts]);

  const slides = useMemo(
    () => selectedProduct.slidesFor(selectedColor),
    [selectedProduct, selectedColor]
  );
  const savedSlideIndex = parseInt(localStorage.getItem("activeSlideIndex") ?? "0", 10) || 0;
  const [index, setIndex] = useState(savedSlideIndex);

  const [activeIndex, setActiveIndex] = useState(savedSlideIndex);
  const [targetIndex, setTargetIndex] = useState<number | null>(null);
  const [phase, setPhase] = useState<"idle" | "out" | "in">("idle");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  // Mirrored so the stage's non-passive touch listener can read the zoom
  // without being torn down and re-attached every time it changes.
  const zoomRef = useRef(1);
  zoomRef.current = zoom;



  const addDesignBtnRef = useRef<HTMLButtonElement>(null);

  // Checkout drawer state
  const DRAWER_MIN = 70;
  const [checkoutDrawerHeight, setCheckoutDrawerHeight] = useState(DRAWER_MIN);
  const [checkoutDrawerMaxH, setCheckoutDrawerMaxH] = useState(DRAWER_MIN);
  const [checkoutDrawerExpandedRaw, setCheckoutDrawerExpanded] = useState(false);
  // Laid out inline there is nothing to expand — the content is always open,
  // and every `checkoutDrawerExpanded` below reads true without knowing why.
  const checkoutDrawerExpanded = SCROLL_VERSION || checkoutDrawerExpandedRaw;
  /**
   * Whether a drawer actually opened — which inline it never does.
   *
   * Some things on screen exist only as a consequence of the sheet rising: the
   * view chevrons appear, a blur shade lifts behind the action bar, the bar's
   * button shrinks to make room. Those read this rather than the state above,
   * so laid out inline they stay as they are when the sheet is down.
   *
   * Pinned false inline rather than just following the raw state: several
   * things open the sheet as a side effect — dismissing the onboarding popup
   * does — and inline every one of them would raise chrome for a sheet that
   * was never there.
   */
  const drawerOpen = !SCROLL_VERSION && checkoutDrawerExpandedRaw;
  const [checkoutDrawerDragging, setCheckoutDrawerDragging] = useState(false);
  const [checkoutDrawerContentScrolled, setCheckoutDrawerContentScrolled] = useState(false);
  const [checkoutDrawerScrolledToBottom, setCheckoutDrawerScrolledToBottom] = useState(false);
  const checkoutDrawerRef = useRef<HTMLDivElement>(null);
  const checkoutDrawerScrollRef = useRef<HTMLDivElement>(null);
  /**
   * How far the sheet is open, 0 at rest to 1 fully raised. The whole screen
   * animates off it: the sheet's own header, and the editor above, which
   * shrinks back to make room.
   *
   * Inline, the sheet is simply open — so its own parts read 1 — while the
   * editor has nothing to make room for and reads 0, keeping its full size.
   */
  const drawerInterp = SCROLL_VERSION
    ? 1
    : // Guard the first paint, where maxH still equals MIN and 0/0 puts NaN
      // into every opacity derived from this.
      checkoutDrawerMaxH <= DRAWER_MIN
      ? 0
      : Math.min(
          1,
          Math.max(0, (checkoutDrawerHeight - DRAWER_MIN) / (checkoutDrawerMaxH - DRAWER_MIN))
        );
  const editorInterp = SCROLL_VERSION ? 0 : drawerInterp;
  const otherProductsScrollRef = useRef<HTMLDivElement>(null);
  const [otherProductsScrollPos, setOtherProductsScrollPos] = useState({ atStart: true, atEnd: false });
  const horizontalGesture = useRef({ startX: 0, startY: 0, locked: false });
  const onHorizontalTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    horizontalGesture.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY, locked: false };
  };
  const onHorizontalTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const dx = e.touches[0].clientX - horizontalGesture.current.startX;
    const dy = e.touches[0].clientY - horizontalGesture.current.startY;
    if (!horizontalGesture.current.locked && Math.abs(dx) > THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
      horizontalGesture.current.locked = true;
    }
    if (horizontalGesture.current.locked) e.stopPropagation();
  };
  const onHorizontalTouchEnd = () => { horizontalGesture.current.locked = false; };
  const checkoutDrawerHandlePathRef = useRef<SVGPathElement>(null);
  const checkoutDrawerHandleSvgRef = useRef<SVGSVGElement>(null);
  const checkoutDrawerDrag = useRef({ startY: 0, startH: DRAWER_MIN, active: false });
  const checkoutDrawerDragDirection = useRef<"up" | "down" | "none">("none");
  const checkoutDrawerChevronState = useRef({ bend: 0, gray: 0.8, scale: 1, rafId: 0 });
  const checkoutDrawerScrollGesture = useRef({ startY: 0, startScrollTop: 0, draggingSheet: false, lockedAtTop: false });

  const [colorDrawerOpen, setColorDrawerOpen] = useState(false);
  const [allProductsDrawerOpen, setAllProductsDrawerOpen] = useState(false);
  const [moreMenuDrawerOpen, setMoreMenuDrawerOpen] = useState(false);
  const [colorDrawerScrolled, setColorDrawerScrolled] = useState(false);
  const [openAccordions, setOpenAccordions] = useState<Set<string>>(new Set());
  const [designDrawerOpen, setDesignDrawerOpen] = useState(false);
  const [graphicsDrawerOpen, setGraphicsDrawerOpen] = useState(false);
  const graphicsScrollRef = useRef<HTMLDivElement>(null);
  const graphicsScrollPos = useRef(0);
  const [sizeDrawerOpen, setSizeDrawerOpen] = useState(false);
  const [sideThumbnails, setSideThumbnails] = useState<Array<{ label: string; src: string; thumbnail: string }>>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [cartItems, setCartItems] = useState<Array<{ product: string; color: string; colorLabel: string; thumbnail: string; quantities: Record<string, number>; unitPrice: number; printTechnique?: "embroidery" | "standard" }>>(() => {
    try { return JSON.parse(localStorage.getItem("cartItems") || "[]"); } catch { return []; }
  });
  const [cartCount, setCartCount] = useState<number>(() => {
    try { return JSON.parse(localStorage.getItem("cartCount") || "0"); } catch { return 0; }
  });
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
  useEffect(() => { localStorage.setItem("cartItems", JSON.stringify(cartItems)); }, [cartItems]);
  useEffect(() => { localStorage.setItem("cartCount", JSON.stringify(cartCount)); }, [cartCount]);
  const [toastVisible, setToastVisible] = useState(false);
  const [, setHandleTick] = useState(0);
  const [previewDrawerOpen, setPreviewDrawerOpen] = useState(false);
  const [modelPopupOpen, setModelPopupOpen] = useState(false);
  const [modelPopupClosing, setModelPopupClosing] = useState(false);
  const popupZoomRef = useRef(1);
  const popupPanRef = useRef({ x: 0, y: 0 });
  const popupGestureRef = useRef<{ initDist: number; initScale: number; startX: number; startY: number; initPanX: number; initPanY: number; } | null>(null);
  const previewImgZoom = useRef(1);
  const previewImgPan = useRef({ x: 0, y: 0 });
  const [previewImgTransform, setPreviewImgTransform] = useState({ zoom: 1, x: 0, y: 0 });
  const previewImgGesture = useRef<{ type: "pinch" | "pan"; startDist: number; startZoom: number; startPanX: number; startPanY: number; startTx: number; startTy: number } | null>(null);

  const previewImgContainerRef = useRef<HTMLDivElement>(null);
  const popupImgRef = useRef<HTMLDivElement>(null);
  const [popupZoom, setPopupZoom] = useState(1);
  const [popupPan, setPopupPan] = useState({ x: 0, y: 0 });
  const [previewLoading, setPreviewLoading] = useState(false);
  const [printTechnique, setPrintTechnique] = useState<"embroidery" | "standard">("standard");
  const [savedPrintTechnique, setSavedPrintTechnique] = useState<"embroidery" | "standard">("standard");
  const [embroideryDataUrl, setEmbroideryDataUrl] = useState<string | null>(null);
  const [embroideryRenderedUrl, setEmbroideryRenderedUrl] = useState<string | null>(null);
  const [designBbox, setDesignBbox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [hoopframeWarning, setHoopframeWarning] = useState(false);

  // ---- Live on-canvas embroidery preview (stitched render overlaid on the
  // design while it sits on the product canvas, like the b2b designer). ----
  const [canvasEmbDataUrl, setCanvasEmbDataUrl] = useState<string | null>(null);
  const [canvasEmbRenderedUrl, setCanvasEmbRenderedUrl] = useState<string | null>(null);
  const [canvasEmbBbox, setCanvasEmbBbox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [canvasEmbLoading, setCanvasEmbLoading] = useState(false);
  // True between a drag/resize release and the next flatten completing at the
  // final position. While settling we keep the flat element visible (no spinner,
  // no overlay) so the stitched render reappears at the settled spot with no jump
  // — otherwise it flashes at the pre-drag bounding box before repositioning.
  const [canvasEmbSettling, setCanvasEmbSettling] = useState(false);
  // Last flattened design URL fed to EmbroideryPreview. Used to detect when a
  // re-flatten produced an identical image — in which case EmbroideryPreview's
  // effect won't re-run (so onRendered won't fire) and we must clear the spinner
  // ourselves, otherwise it spins forever.
  const canvasEmbDataUrlRef = useRef<string | null>(null);
  // First reveal in a session shows a "Embroidery preview…" label for an extra
  // beat so it's readable; later reveals just show a small spinner.
  const canvasEmbEverShownRef = useRef(false);
  const [canvasEmbFirstDelayPassed, setCanvasEmbFirstDelayPassed] = useState(false);

  // The main proto's full text model on every item: face, weight, style,
  // underline, alignment, curve (an SVG baseline path, CE.SDK-style) and
  // rotation. Legacy fields keep their meaning; text without a fontFamily
  // falls back to the default face.
  type DesignItem = {
    id: string; type: "text" | "image"; content: string; src?: string;
    x: number; y: number; w: number; fontSize: number;
    color?: string; colorSet?: boolean;
    fontFamily?: string; bold?: boolean; italic?: boolean; underline?: boolean;
    textAlign?: "left" | "center" | "right";
    textPath?: string | null;
    rotation?: number;
  };
  const [allDesignItems, setAllDesignItems] = useState<Record<string, DesignItem[]>>(() => {
    try {
      const saved = localStorage.getItem("designItems");
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  const currentSlideLabel = slides[activeIndex]?.label ?? "Front";
  const designItems: DesignItem[] = allDesignItems[currentSlideLabel] ?? [];
  const designHistory = useRef<DesignItem[][]>([]);
  const pushHistory = () => {
    const current = allDesignItems[currentSlideLabel] ?? [];
    designHistory.current = [...designHistory.current.slice(-29), [...current]];
  };
  const setDesignItems = (updater: DesignItem[] | ((prev: DesignItem[]) => DesignItem[])) => {
    setAllDesignItems(all => {
      const prev = all[currentSlideLabel] ?? [];
      const next = typeof updater === "function" ? updater(prev) : updater;
      // Identity-stable: a no-op update must not mint new state — every fresh
      // identity re-runs the handle-measure layout effect and re-renders the
      // whole canvas, and a burst of those while a vaul drawer is animating
      // starves React into "Maximum update depth exceeded".
      if (next === prev) return all;
      return { ...all, [currentSlideLabel]: next };
    });
  };
  const undo = () => {
    if (designHistory.current.length === 0) return;
    const prev = designHistory.current[designHistory.current.length - 1];
    designHistory.current = designHistory.current.slice(0, -1);
    setAllDesignItems(all => ({ ...all, [currentSlideLabel]: prev }));
  };

  const designSidesCount = Object.keys(allDesignItems).filter(k => (allDesignItems[k] as DesignItem[]).length > 0).length;
  const currentPrice = BASE_PRODUCT_PRICE + designSidesCount * (savedPrintTechnique === "embroidery" ? SURCHARGE_EMBROIDERY : SURCHARGE_STANDARD);

  const [selectedDesignId, setSelectedDesignId] = useState<string | null>(null);
  // The text being edited inline (its span swapped for a focused textarea) —
  // the main proto's editingTextId. Entered through the bar's Write pill,
  // never on add: on mobile a new text is selected, which is what raises the
  // editor bar over it, and going straight to the caret would hide the bar
  // behind the keyboard the instant the text appeared.
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  // Which panel the edit sheet is open at — set by the editor bar's items,
  // null while the sheet is closed (the main proto's mobileSheetPanel).
  const [mobileSheetPanel, setMobileSheetPanel] = useState<TextTab | null>(null);
  // Whether the selected text's font really ships bold / italic faces.
  const [fontCaps, setFontCaps] = useState({ canBold: true, canItalic: true });
  // Bumped when a webfont lands, so everything measured re-measures in the
  // face that is now actually drawing it.
  const [, setFontTick] = useState(0);
  // For double-tap detection on text items — a second tap on an already
  // selected text within this window drops straight into the keyboard.
  const lastTapRef = useRef<{ id: string; t: number } | null>(null);
  const [designGestureActive, setDesignGestureActive] = useState(false);
  const [snapGuides, setSnapGuides] = useState<{ h: boolean; v: boolean }>({ h: false, v: false });
  const [chevronPressed, setChevronPressed] = useState<"left" | "right" | null>(null);

  const hasAnyItems = Object.keys(allDesignItems).some((k) => (allDesignItems[k] as DesignItem[]).length > 0);
  // Objects on the current product's own print areas. Items are stored by side
  // name and survive a product switch, so ones left on a side this product does
  // not have must not count — the print technique choice is about what will
  // actually be printed here.
  const hasItemsOnPrintAreas = Object.keys(selectedProduct.printAreas).some(
    (side) => ((allDesignItems[side] as DesignItem[] | undefined)?.length ?? 0) > 0
  );
  const activeIsEmpty = designItems.length === 0;

  // On-canvas embroidery is active only for embroidery-suitable products (so we
  // never stitch-render on stickers etc.) when the chosen technique is embroidery.
  const embroiderySupported = !!selectedProduct.embroidery;
  const onCanvasEmbroidery = embroiderySupported && savedPrintTechnique === "embroidery";
  // Signature of everything that changes the stitched look of the current slide.
  const canvasEmbSig = useMemo(
    () =>
      JSON.stringify({
        slide: currentSlideLabel,
        color: selectedColor,
        on: onCanvasEmbroidery,
        items: designItems.map(i => [i.type, i.content, i.src, i.x, i.y, i.w, i.fontSize, i.color]),
      }),
    [currentSlideLabel, selectedColor, onCanvasEmbroidery, designItems]
  );
  const [showPopup, setShowPopup] = useState(!hasAnyItems);
  const [showDesignRow, setShowDesignRow] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [revealed, setRevealed] = useState(hasAnyItems);
  const [slidePopoverOpen, setSlidePopoverOpen] = useState(false);

  const dismissPopup = () => {
    setShowPopup(false);
    setAnimating(true);
    setTimeout(() => setAnimating(false), 750);
    setCheckoutDrawerExpanded(true);
    setCheckoutDrawerHeight(checkoutDrawerMaxH);
    computeHoopframeWarning();
    requestAnimationFrame(() => requestAnimationFrame(() => setRevealed(true)));
  };

  const currentPARef = useRef<{ left: number; top: number; width: number; height: number } | null>(null);
  const itemSizeRefs = useRef<Map<string, { w: number; h: number }>>(new Map());
  const itemElRefs = useRef<Map<string, HTMLElement>>(new Map());
  const doneBtnRef = useRef<HTMLButtonElement>(null);
  const pendingSnapItemId = useRef<string | null>(null);
  const designGestureRef = useRef<
    | { type: "idle" }
    | { type: "move"; itemId: string; startTx: number; startTy: number; startX: number; startY: number; startW: number; startFontSize: number; }
    | { type: "resize-tl" | "resize-tr" | "resize-bl" | "resize-br"; itemId: string; startTx: number; startTy: number; startX: number; startY: number; startW: number; startH: number; startFontSize: number; anchorX: number; anchorY: number; startDist: number; anchorLocalX: number; anchorLocalY: number; }
    // The proto's rotate handle: angle from the box centre at touchstart vs now.
    | { type: "rotate"; itemId: string; cx: number; cy: number; startAngle: number; startRotation: number; }
  >({ type: "idle" });




  // Checkout drawer max height
  useEffect(() => {
    const update = () => {
      const next = 400;
      setCheckoutDrawerMaxH(next);
      setCheckoutDrawerHeight(prev => Math.min(Math.max(DRAWER_MIN, prev), next));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Checkout drawer handle chevron animation
  useEffect(() => {
    const cs = checkoutDrawerChevronState.current;
    const animate = () => {
      const targetBend = checkoutDrawerDragging
        ? checkoutDrawerDragDirection.current === "up" ? -3 : checkoutDrawerDragDirection.current === "down" ? 3 : 0
        : 0;
      const targetGray = checkoutDrawerDragging ? 0 : 0.8;
      const targetScale = checkoutDrawerDragging ? 2 : 1;
      cs.bend += (targetBend - cs.bend) * 0.12;
      cs.gray += (targetGray - cs.gray) * 0.1;
      cs.scale += (targetScale - cs.scale) * 0.1;
      if (checkoutDrawerHandlePathRef.current) {
        const g = Math.round(cs.gray * 255);
        checkoutDrawerHandlePathRef.current.setAttribute("d", `M0,2 Q18,${(2 + cs.bend).toFixed(2)} 36,2`);
        checkoutDrawerHandlePathRef.current.setAttribute("stroke", `rgb(${g},${g},${g})`);
      }
      if (checkoutDrawerHandleSvgRef.current) {
        checkoutDrawerHandleSvgRef.current.style.transform = `scale(${cs.scale.toFixed(3)}, 1)`;
      }
      if (Math.abs(targetBend - cs.bend) > 0.02 || Math.abs(targetGray - cs.gray) > 0.005 || Math.abs(targetScale - cs.scale) > 0.005) {
        cs.rafId = requestAnimationFrame(animate);
      } else {
        if (checkoutDrawerHandlePathRef.current) {
          checkoutDrawerHandlePathRef.current.setAttribute("d", `M0,2 Q18,${(2 + targetBend).toFixed(2)} 36,2`);
          checkoutDrawerHandlePathRef.current.setAttribute("stroke", `rgb(${Math.round(targetGray * 255)},${Math.round(targetGray * 255)},${Math.round(targetGray * 255)})`);
        }
        if (checkoutDrawerHandleSvgRef.current) checkoutDrawerHandleSvgRef.current.style.transform = `scale(${targetScale}, 1)`;
      }
    };
    cs.rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(cs.rafId);
  }, [checkoutDrawerDragging]);

  // Checkout drawer drag handlers
  const checkoutDrawerStart = (y: number) => {
    checkoutDrawerDrag.current = { startY: y, startH: checkoutDrawerRef.current?.offsetHeight || DRAWER_MIN, active: false };
    setCheckoutDrawerDragging(false);
  };
  const checkoutDrawerMove = (y: number) => {
    const d = checkoutDrawerDrag.current;
    const dy = d.startY - y;
    if (!d.active && Math.abs(dy) > THRESHOLD) { d.active = true; setCheckoutDrawerDragging(true); }
    if (!d.active) return;
    checkoutDrawerDragDirection.current = dy > 0 ? "up" : "down";
    setCheckoutDrawerHeight(Math.min(checkoutDrawerMaxH, Math.max(DRAWER_MIN, d.startH + dy)));
  };
  const checkoutDrawerEnd = (y: number) => {
    const d = checkoutDrawerDrag.current;
    if (!d.active) return;
    const dy = d.startY - y;
    const midpoint = DRAWER_MIN + (checkoutDrawerMaxH - DRAWER_MIN) / 2;
    const next = dy > THRESHOLD ? true : dy < -THRESHOLD ? false : checkoutDrawerHeight > midpoint;
    setCheckoutDrawerExpanded(next);
    setCheckoutDrawerHeight(next ? checkoutDrawerMaxH : DRAWER_MIN);
    if (next) computeHoopframeWarning();
    if (!next && checkoutDrawerScrollRef.current) checkoutDrawerScrollRef.current.scrollTop = 0;
    setCheckoutDrawerDragging(false);
    checkoutDrawerDragDirection.current = "none";
    d.active = false;
  };

  const onCheckoutDrawerHandleMouseDown = (e: React.MouseEvent) => {
    checkoutDrawerStart(e.clientY);
    const mm = (ev: MouseEvent) => checkoutDrawerMove(ev.clientY);
    const mu = (ev: MouseEvent) => { checkoutDrawerEnd(ev.clientY); window.removeEventListener("mousemove", mm); window.removeEventListener("mouseup", mu); };
    window.addEventListener("mousemove", mm);
    window.addEventListener("mouseup", mu);
  };

  const onCheckoutDrawerScrollTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const scrollTop = checkoutDrawerScrollRef.current?.scrollTop || 0;
    checkoutDrawerScrollGesture.current = { startY: e.touches[0].clientY, startScrollTop: scrollTop, draggingSheet: false, lockedAtTop: checkoutDrawerExpanded && scrollTop <= 0 };
    if (!checkoutDrawerExpanded) { checkoutDrawerStart(e.touches[0].clientY); checkoutDrawerScrollGesture.current.draggingSheet = true; }
  };
  const onCheckoutDrawerScrollTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const scrollEl = checkoutDrawerScrollRef.current;
    if (!scrollEl) return;
    const currentY = e.touches[0].clientY;
    const deltaY = currentY - checkoutDrawerScrollGesture.current.startY;
    const atTop = scrollEl.scrollTop <= 0;
    if (checkoutDrawerExpanded && atTop) scrollEl.scrollTop = 0;
    if (!checkoutDrawerScrollGesture.current.draggingSheet) {
      const shouldDrag = !checkoutDrawerExpanded || ((checkoutDrawerScrollGesture.current.lockedAtTop || checkoutDrawerScrollGesture.current.startScrollTop <= 0) && atTop && deltaY > THRESHOLD);
      if (shouldDrag) { e.preventDefault(); scrollEl.scrollTop = 0; checkoutDrawerStart(checkoutDrawerScrollGesture.current.startY); checkoutDrawerScrollGesture.current.draggingSheet = true; }
    }
    if (checkoutDrawerScrollGesture.current.draggingSheet) { e.preventDefault(); scrollEl.scrollTop = 0; checkoutDrawerMove(currentY); }
  };
  const onCheckoutDrawerScrollTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (checkoutDrawerScrollGesture.current.draggingSheet) checkoutDrawerEnd(e.changedTouches[0].clientY);
    checkoutDrawerScrollGesture.current.draggingSheet = false;
    checkoutDrawerScrollGesture.current.lockedAtTop = false;
  };

  const checkoutDrawerShadow = checkoutDrawerExpanded
    ? "0 -20px 80px rgba(0,0,0,0.22), 0 -4px 200px rgba(0,0,0,0.25)"
    : "0 -50px 60px rgba(0,0,0,0.12), 0 -4px 20px rgba(0,0,0,0.09)";

  const imageGesture = useRef({
    mode: "idle" as "idle" | "pinch" | "pan",
    startDistance: 0,
    startZoom: 1,
    startPan: { x: 0, y: 0 },
    startCenter: { x: 0, y: 0 },
    startTouch: { x: 0, y: 0 },
    lastPan: { x: 0, y: 0 },
    lastZoom: 1,
  });

  const EDITOR_SWIPE_OPEN_DRAWER = 50;
  const editorSwipeRef = useRef({ active: false, startX: 0, startY: 0 });

  useEffect(() => {
    const id = "dock-bounce-keyframe";
    if (!document.getElementById(id)) {
      const s = document.createElement("style");
      s.id = id;
      s.textContent = `@keyframes dockBounce { 0% { transform: translateY(120px); } 60% { transform: translateY(-10px); } 80% { transform: translateY(4px); } 100% { transform: translateY(0); } } @keyframes dockBounceRight { 0% { transform: translateX(36px); opacity: 0; } 60% { transform: translateX(-4px); opacity: 1; } 80% { transform: translateX(2px); } 100% { transform: translateX(0); } }`;
      document.head.appendChild(s);
    }
  }, []);

  useEffect(() => {
    const prevBodyMargin = document.body.style.margin;
    const prevBodyOverflow = document.body.style.overflow;
    const prevBodyOverscroll = document.body.style.overscrollBehavior;
    const prevHtmlOverscroll = document.documentElement.style.overscrollBehavior;

    document.body.style.margin = "0";
    // The page is locked so that only the sheet scrolls. Laid out inline the
    // page IS the scroller, so the lock has to come off — and it is set here as
    // an inline style, which no stylesheet could have overridden.
    document.body.style.overflow = SCROLL_VERSION ? "auto" : "hidden";
    document.body.style.overscrollBehavior = SCROLL_VERSION ? "auto" : "none";
    document.documentElement.style.overscrollBehavior = SCROLL_VERSION ? "auto" : "none";

    const madeId = "made-outer-sans-font";
    if (!document.getElementById(madeId)) {
      const style = document.createElement("style");
      style.id = madeId;
      style.textContent = `
        @font-face {
          font-family: "MADEOuterSans";
          src: url("/fonts/MADE-Outer-Sans-Medium.woff2") format("woff2"),
               url("/fonts/MADE-Outer-Sans-Medium.otf") format("opentype");
          font-weight: 500;
        }
      `;
      document.head.appendChild(style);
    }

    return () => {
      document.body.style.margin = prevBodyMargin;
      document.body.style.overflow = prevBodyOverflow;
      document.body.style.overscrollBehavior = prevBodyOverscroll;
      document.documentElement.style.overscrollBehavior = prevHtmlOverscroll;
    };
  }, []);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setEditorSize({ width, height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    imageGesture.current.lastZoom = 1;
    imageGesture.current.lastPan = { x: 0, y: 0 };
  }, [index]);

  useEffect(() => {
    if (phase !== "out" || targetIndex === null) return;
    const outTimer = window.setTimeout(() => {
      setActiveIndex(targetIndex);
      setPhase("in");
    }, 180);
    return () => window.clearTimeout(outTimer);
  }, [phase, targetIndex]);

  useEffect(() => {
    if (phase !== "in") return;
    const raf1 = window.requestAnimationFrame(() => {
      const raf2 = window.requestAnimationFrame(() => {
        const settleTimer = window.setTimeout(() => {
          setPhase("idle");
          setTargetIndex(null);
        }, 180);
        return () => window.clearTimeout(settleTimer);
      });
      return () => window.cancelAnimationFrame(raf2);
    });
    return () => window.cancelAnimationFrame(raf1);
  }, [phase]);


  const getTouchDistance = (touches: React.TouchList) => {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  };

  const getTouchCenter = (touches: React.TouchList) => {
    if (touches.length < 2) return { x: 0, y: 0 };
    return { x: (touches[0].clientX + touches[1].clientX) / 2, y: (touches[0].clientY + touches[1].clientY) / 2 };
  };

  const clampZoom = (value: number) => Math.max(1, Math.min(3, value));

  const getPanLimits = (nextZoom: number) => {
    const editorEl = editorRef.current;
    if (!editorEl || nextZoom <= 1) return { x: 0, y: 0 };
    const editorWidth = editorEl.clientWidth || 1;
    const editorHeight = editorEl.clientHeight || 1;
    const imageWidth = imageNaturalSizeRef.current.width || 1;
    const imageHeight = imageNaturalSizeRef.current.height || 1;
    const containScale = Math.min(editorWidth / imageWidth, editorHeight / imageHeight);
    const baseWidth = imageWidth * containScale;
    const baseHeight = imageHeight * containScale;
    return { x: Math.max(0, (baseWidth * nextZoom - baseWidth) / 2), y: Math.max(0, (baseHeight * nextZoom - baseHeight) / 2) };
  };

  const clampPan = (nextPan: { x: number; y: number }, nextZoom: number) => {
    if (nextZoom <= 1) return { x: 0, y: 0 };
    const limits = getPanLimits(nextZoom);
    return { x: Math.max(-limits.x, Math.min(limits.x, nextPan.x)), y: Math.max(-limits.y, Math.min(limits.y, nextPan.y)) };
  };

  const onEditorTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    // No deselect here: a selection must survive a pinch or a pan. A plain tap
    // still deselects, via the document-level tap handler below.
    if (e.touches.length === 2) {
      // Main proto: a second finger abandons any object manipulation, so the
      // object doesn't fly while the canvas zooms.
      if (designGestureRef.current.type !== "idle") {
        designGestureRef.current = { type: "idle" };
        setDesignGestureActive(false);
      }
      editorSwipeRef.current.active = false;
      if (zoom <= 1) setPan({ x: 0, y: 0 });
      imageGesture.current = {
        mode: "pinch",
        startDistance: getTouchDistance(e.touches),
        startZoom: zoom,
        startPan: zoom <= 1 ? { x: 0, y: 0 } : pan,
        startCenter: getTouchCenter(e.touches),
        startTouch: { x: 0, y: 0 },
        lastPan: zoom <= 1 ? { x: 0, y: 0 } : pan,
        lastZoom: zoom,
      };
      return;
    }
    if (e.touches.length === 1 && zoom > 1) {
      imageGesture.current = {
        mode: "pan",
        startDistance: 0,
        startZoom: zoom,
        startPan: pan,
        startCenter: { x: 0, y: 0 },
        startTouch: { x: e.touches[0].clientX, y: e.touches[0].clientY },
        lastPan: pan,
        lastZoom: zoom,
      };
      return;
    }
    if (e.touches.length === 1 && zoom <= 1 && !checkoutDrawerExpanded) {
      editorSwipeRef.current = {
        active: true,
        startX: e.touches[0].clientX,
        startY: e.touches[0].clientY,
      };
    }
  };

  const onEditorTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (designGestureRef.current.type !== "idle") {
      handleDesignMove(e);
      return;
    }
    if (editorSwipeRef.current.active && e.touches.length === 1) {
      const dy = e.touches[0].clientY - editorSwipeRef.current.startY;
      const dx = e.touches[0].clientX - editorSwipeRef.current.startX;
      // Inline, a swipe up the editor is the page scrolling, not a sheet being
      // pulled open — there is no sheet to pull.
      if (!SCROLL_VERSION && dy < -EDITOR_SWIPE_OPEN_DRAWER && Math.abs(dy) > Math.abs(dx)) {
        editorSwipeRef.current.active = false;
        setCheckoutDrawerExpanded(true);
        setCheckoutDrawerHeight(checkoutDrawerMaxH);
      }
      return;
    }
    if (imageGesture.current.mode === "pinch") {
      if (e.touches.length !== 2) return;
      e.preventDefault();
      const nextDistance = getTouchDistance(e.touches);
      if (!imageGesture.current.startDistance) return;
      const scaleFactor = nextDistance / imageGesture.current.startDistance;
      const nextZoom = clampZoom(imageGesture.current.startZoom * scaleFactor);
      const center = getTouchCenter(e.touches);
      const centerDx = center.x - imageGesture.current.startCenter.x;
      const centerDy = center.y - imageGesture.current.startCenter.y;
      let nextPan = clampPan({ x: imageGesture.current.startPan.x + centerDx, y: imageGesture.current.startPan.y + centerDy }, nextZoom);
      if (nextZoom <= 1) nextPan = { x: 0, y: 0 };
      imageGesture.current.lastZoom = nextZoom;
      imageGesture.current.lastPan = nextPan;
      setZoom(nextZoom);
      setPan(nextPan);
      return;
    }
    if (imageGesture.current.mode === "pan") {
      if (e.touches.length !== 1 || imageGesture.current.lastZoom <= 1) return;
      e.preventDefault();
      const dx = e.touches[0].clientX - imageGesture.current.startTouch.x;
      const dy = e.touches[0].clientY - imageGesture.current.startTouch.y;
      const nextPan = clampPan({ x: imageGesture.current.startPan.x + dx, y: imageGesture.current.startPan.y + dy }, imageGesture.current.lastZoom);
      imageGesture.current.lastPan = nextPan;
      setPan(nextPan);
    }
  };

  const onEditorTouchEnd = (e?: React.TouchEvent<HTMLDivElement>) => {
    if (designGestureRef.current.type !== "idle") {
      handleDesignEnd();
      return;
    }
    // Main proto: fingers still down (pinch 2 → 1) re-arm as a pan from here,
    // so the motion carries on without a jump.
    if (e && e.touches.length > 0) {
      if (e.touches.length === 1 && imageGesture.current.lastZoom > 1) {
        imageGesture.current = {
          ...imageGesture.current,
          mode: "pan",
          startZoom: imageGesture.current.lastZoom,
          startPan: imageGesture.current.lastPan,
          startTouch: { x: e.touches[0].clientX, y: e.touches[0].clientY },
        };
      }
      return;
    }
    editorSwipeRef.current.active = false;
    imageGesture.current.mode = "idle";
    if (imageGesture.current.lastZoom <= 1) {
      imageGesture.current.lastZoom = 1;
      imageGesture.current.lastPan = { x: 0, y: 0 };
      setZoom(1);
      setPan({ x: 0, y: 0 });
    }
  };

  const goToSlide = (nextIndex: number) => {
    const clampedIndex = Math.max(0, Math.min(slides.length - 1, nextIndex));
    if (clampedIndex === activeIndex || phase !== "idle") return;

    setTargetIndex(clampedIndex);
    setIndex(clampedIndex);
    setPhase("out");
  };

  const currentPA = useMemo(() => {
    if (editorSize.width === 0) return null;
    const label = slides[activeIndex]?.label;
    const area = label ? selectedProduct.printAreas[label] ?? null : null;
    if (!area) return null;
    const contentH = productBoxH(editorSize.height);
    const rect = getContainRect(editorSize.width, contentH, imageNaturalSize.width, imageNaturalSize.height);
    return {
      left: rect.left + rect.width * area.x,
      top: EDITOR_TOP_OFFSET + rect.top + rect.height * area.y,
      width: rect.width * area.w,
      height: rect.height * area.h,
    };
  }, [editorSize, activeIndex, imageNaturalSize, selectedColor]);



  useEffect(() => { currentPARef.current = currentPA; }, [currentPA]);

  /**
   * The editor bars' two live actions — the same pair the main proto wires
   * (duplicateSelectedText/Graphic there): clone with a small offset, kept
   * inside the print area, and delete-and-deselect.
   */
  const selectedItem = selectedDesignId
    ? designItems.find(d => d.id === selectedDesignId) ?? null
    : null;
  const duplicateSelectedItem = () => {
    if (!selectedItem) return;
    pushHistory();
    const newId = `${selectedItem.type}-${Date.now()}`;
    setDesignItems(prev => [...prev, {
      ...selectedItem,
      id: newId,
      x: currentPA ? Math.min(currentPA.width, selectedItem.x + 12) : selectedItem.x + 12,
      y: currentPA ? Math.min(currentPA.height, selectedItem.y + 12) : selectedItem.y + 12,
    }]);
    setSelectedDesignId(newId);
  };
  const deleteSelectedItem = () => {
    if (!selectedDesignId) return;
    pushHistory();
    setDesignItems(prev => prev.filter(d => d.id !== selectedDesignId));
    setSelectedDesignId(null);
  };

  /** Patch the selected text — the proto's updateSelectedText. */
  const updateSelectedText = (patch: Partial<DesignItem>) => {
    if (!selectedDesignId) return;
    setDesignItems(prev =>
      prev.map(t => (t.id === selectedDesignId && t.type === "text" ? { ...t, ...patch } : t))
    );
  };

  /** Curve on/off — the proto's changeTextCurve, sans its re-fit pass. */
  const changeTextCurve = (id: TextCurveId | null) => {
    const patch: Partial<DesignItem> = { textPath: id ? textCurve(id).path : null };
    // Curved text is always centre-aligned; un-curving leaves alignment be.
    if (id) patch.textAlign = "center";
    updateSelectedText(patch);
  };

  /** Largest size the size slider offers — capped by the print area. */
  const maxFontSize = currentPA ? Math.min(MAX_FONT_SIZE, currentPA.height) : MAX_FONT_SIZE;

  // Every face the canvas shows gets loaded (Google Fonts, on demand); when
  // one lands, stale text measurements are dropped and everything measured
  // re-renders in the real face — the proto's invalidate-and-reapply.
  const familiesOnCanvas = Object.keys(allDesignItems)
    .flatMap(k => (allDesignItems[k] as DesignItem[]).filter(d => d.type === "text"))
    .map(t => textItemFamily(t))
    .filter((f, i, a) => a.indexOf(f) === i)
    .join("|");
  useEffect(() => {
    const families = familiesOnCanvas ? familiesOnCanvas.split("|") : [];
    if (!families.includes(DEFAULT_FONT_FAMILY)) families.push(DEFAULT_FONT_FAMILY);
    let active = true;
    families.forEach(f =>
      loadFont(f).then(() => {
        if (!active) return;
        invalidateTextMetrics();
        setFontTick(v => v + 1);
      })
    );
    return () => { active = false; };
  }, [familiesOnCanvas]);

  // When the selected text's font changes, detect which variants it supports
  // and drop any bold/italic the new font can't render — the proto's fontCaps
  // effect, so we never faux-render or strand an un-toggleable style.
  const selectedFontFamily = selectedItem?.type === "text" ? textItemFamily(selectedItem) : null;
  useEffect(() => {
    if (!selectedFontFamily) return;
    let active = true;
    const apply = () => {
      if (!active) return;
      const v = getFontVariants(selectedFontFamily);
      // Both writes identity-stable — apply() runs twice (before and after
      // the font loads) and usually changes nothing.
      setFontCaps(c =>
        c.canBold === v.bold && c.canItalic === v.italic
          ? c
          : { canBold: v.bold, canItalic: v.italic }
      );
      setDesignItems(prev => {
        let changed = false;
        const next = prev.map(t => {
          if (t.type !== "text" || textItemFamily(t) !== selectedFontFamily) return t;
          if ((t.bold && !v.bold) || (t.italic && !v.italic)) {
            changed = true;
            return { ...t, bold: t.bold && v.bold, italic: t.italic && v.italic };
          }
          return t;
        });
        return changed ? next : prev;
      });
    };
    apply();
    loadFont(selectedFontFamily).then(() => {
      invalidateTextMetrics();
      apply();
    });
    return () => { active = false; };
  }, [selectedFontFamily]);

  // The sheet belongs to a selected text; whatever clears or retypes the
  // selection closes it.
  useEffect(() => {
    if (mobileSheetPanel && selectedItem?.type !== "text") setMobileSheetPanel(null);
  }, [selectedDesignId, mobileSheetPanel, selectedItem]);

  /**
   * Inline text editing — the main proto's flow. The selected text's span is
   * swapped for a focused textarea; a textarea does not size to its content,
   * so it is measured the way the canvas flattener measures the span.
   */
  const textMeasureCtx = useRef<CanvasRenderingContext2D | null>(null);
  const measureTextBox = (item: DesignItem) => {
    if (!textMeasureCtx.current)
      textMeasureCtx.current = document.createElement("canvas").getContext("2d");
    const ctx = textMeasureCtx.current;
    const lines = item.content.split("\n");
    let w = item.fontSize * 0.5; // never collapse to nothing while empty
    if (ctx) {
      ctx.font = textItemFont(item);
      for (const line of lines) w = Math.max(w, ctx.measureText(line).width);
    }
    // + the span's own 2px/4px padding on each side, so the glyphs stay put
    // when the span swaps in and out.
    return { width: Math.ceil(w) + 8, height: Math.ceil(lines.length * item.fontSize * 0.9) + 4 };
  };
  const commitTextEdit = (id: string) => {
    setEditingTextId(cur => (cur === id ? null : cur));
    // Editing away everything removes the element — an empty text could never
    // be seen or reselected.
    const item = designItems.find(d => d.id === id);
    if (item && item.type === "text" && item.content.trim() === "") {
      setDesignItems(prev => prev.filter(d => d.id !== id));
      if (selectedDesignId === id) setSelectedDesignId(null);
    }
  };
  // Whatever clears or moves the selection (Done, a tap on the stage, a slide
  // change) also ends the edit — the textarea unmounts without its blur.
  useEffect(() => {
    if (editingTextId && selectedDesignId !== editingTextId) commitTextEdit(editingTextId);
  }, [selectedDesignId]);

  const computeHoopframeWarning = () => {
    if (savedPrintTechnique !== "embroidery" || designItems.length === 0) { setHoopframeWarning(false); return; }
    flattenDesignItems().then(({ bbox }) => {
      if (!bbox) { setHoopframeWarning(false); return; }
      const area = bbox.width * bbox.height;
      setHoopframeWarning(area > 1 / 7 && Math.sqrt((1 / 7) / area) < 0.8);
    });
  };

  // Reset preview image zoom/pan when drawer closes
  useEffect(() => {
    if (!previewDrawerOpen) {
      previewImgZoom.current = 1;
      previewImgPan.current = { x: 0, y: 0 };
      setPreviewImgTransform({ zoom: 1, x: 0, y: 0 });
      previewImgGesture.current = null;
    }
  }, [previewDrawerOpen]);

  /**
   * Picking something up on the product brings the stage back into view.
   *
   * Inline the page can be scrolled well past the stage, and everything that
   * appears when a design is selected — its handles, Done, the toolbar — is up
   * there with it. Smoothly, so it reads as the page following the tap rather
   * than the ground moving.
   */
  useEffect(() => {
    if (!SCROLL_VERSION || !selectedDesignId) return;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [selectedDesignId]);

  /**
   * Inline, a gesture on the stage is either the page's or the product's —
   * never both.
   *
   * The page is the scroller here, so at rest one finger dragging the stage
   * scrolls the page, which is wanted. It belongs to the product in two cases:
   * two fingers, which are a zoom; and one finger while the product is zoomed
   * in, which is a pan of it. In both the page must hold still underneath, and
   * back at rest the finger goes back to scrolling.
   *
   * touch-action cannot express that. It is read when the gesture begins — by
   * which time the first finger is already panning the page — and it cannot
   * depend on the zoom. So the cases are answered directly, on a non-passive
   * listener: React's own are passive, where a preventDefault is ignored.
   */
  useEffect(() => {
    if (!SCROLL_VERSION) return;
    const el = editorRef.current;
    if (!el) return;
    // Only the second finger is answered on touchstart. Preventing the default
    // there also cancels the compatibility mouse events the browser synthesises
    // from a tap — click among them — so doing it for every touch while zoomed
    // left the buttons on the stage unpressable.
    const onStart = (e: TouchEvent) => {
      if (e.touches.length >= 2) e.preventDefault();
    };
    // Movement is where a page scroll would actually happen, and a tap has
    // none — so this can be strict without costing a click.
    const onMove = (e: TouchEvent) => {
      // A horizontal strip on the stage (the editor bar) scrolls natively —
      // never cancel its movement, even while the product is zoomed
      if ((e.target as Element | null)?.closest?.("[data-hscroll]")) return;
      if (e.touches.length >= 2 || zoomRef.current > 1) e.preventDefault();
    };
    el.addEventListener("touchstart", onStart, { passive: false });
    el.addEventListener("touchmove", onMove, { passive: false });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
    };
  }, []);

  // Main proto's page lock: the page itself must never browser-zoom. Safari
  // ignores the viewport meta's zoom lock, so its gesture events and every
  // multi-touch move are blocked at the document; the canvas runs its own
  // pinch. One-finger moves are left alone, so /scrollversion still scrolls.
  useEffect(() => {
    const preventGesture = (e: Event) => e.preventDefault();
    const preventMultiTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 1) e.preventDefault();
    };
    document.addEventListener("gesturestart", preventGesture);
    document.addEventListener("gesturechange", preventGesture);
    document.addEventListener("touchmove", preventMultiTouchMove, { passive: false });
    return () => {
      document.removeEventListener("gesturestart", preventGesture);
      document.removeEventListener("gesturechange", preventGesture);
      document.removeEventListener("touchmove", preventMultiTouchMove);
    };
  }, []);

  // Non-passive touch listeners on preview image container to block Vaul drag/scroll during gestures
  useEffect(() => {
    const el = previewImgContainerRef.current;
    if (!el) return;
    const onStart = (e: TouchEvent) => { if (e.touches.length >= 2) e.preventDefault(); };
    const onMove = (e: TouchEvent) => { if (previewImgGesture.current) e.preventDefault(); };
    el.addEventListener("touchstart", onStart, { passive: false });
    el.addEventListener("touchmove", onMove, { passive: false });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
    };
  }, []);

  /**
   * A new text goes straight onto the product — no prepared list. The main
   * proto's addTextElement: a "Text" placeholder sized so it takes about half
   * the print area's width (measured in the face it renders in), selected so
   * the editor bar comes up over it — the bar's Write pill is how you get to
   * the keyboard from there, same as tapping an existing text.
   */
  const addNewTextItem = () => {
    const pa = currentPARef.current;
    if (!pa) return;
    pushHistory();
    const id = `text-${Date.now()}`;
    let fontSize = 28;
    const ctx = document.createElement("canvas").getContext("2d");
    if (ctx) {
      ctx.font = `100px "${DEFAULT_FONT_FAMILY}"`;
      const widthAt100 = ctx.measureText(DEFAULT_TEXT_CONTENT).width;
      if (widthAt100 > 0) {
        fontSize = Math.max(14, Math.floor(Math.min(((pa.width * 0.5) / widthAt100) * 100, pa.height)));
      }
    }
    setDesignItems(prev => [...prev, {
      id, type: "text" as const, content: DEFAULT_TEXT_CONTENT,
      x: pa.width / 2, y: pa.height / 2,
      w: 0, fontSize,
      fontFamily: DEFAULT_FONT_FAMILY,
      // Reads against the product until a colour is picked; colorSet keeps
      // the bar's Color item on the rainbow wheel meanwhile.
      color: isLightHex(selectedColor) ? "#111111" : "#FFFFFF",
      colorSet: false,
    }]);
    setSelectedDesignId(id);
    setDesignDrawerOpen(false);
    requestAnimationFrame(() => setHandleTick(v => v + 1));
  };

  const addGraphicItem = (src: string) => {
    const pa = currentPARef.current;
    if (!pa) return;
    pushHistory();
    const size = Math.min(pa.width, pa.height) * 0.5;
    const id = `img-${Date.now()}`;
    setDesignItems(prev => [...prev, {
      id, type: "image" as const, content: "", src,
      x: pa.width / 2, y: pa.height / 2,
      w: size, fontSize: 0,
    }]);
    setSelectedDesignId(id);
    setGraphicsDrawerOpen(false);
    setDesignDrawerOpen(false);
  };

  type BboxResult = { dataUrl: string; bbox: { left: number; top: number; width: number; height: number } | null };
  const flattenDesignItems = (): Promise<BboxResult> => {
    return new Promise((resolve) => {
      const pa = currentPARef.current;
      if (!pa || designItems.length === 0) { resolve({ dataUrl: "", bbox: null }); return; }

      const PAD = 16;
      const OUTPUT = 600;

      // Preload all images first so naturalWidth/naturalHeight are available for bounding box
      const loadedImgs = new Map<string, HTMLImageElement>();
      const imageItems = designItems.filter(i => i.type === "image" && i.src);
      let pending = imageItems.length;

      const proceed = () => {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        for (const item of designItems) {
          // Unrotated box first, then the axis-aligned extent of it rotated —
          // so a tilted item's bbox still wraps every glyph and pixel.
          let boxW: number, boxH: number;
          if (item.type === "image") {
            const img = loadedImgs.get(item.src ?? "");
            const aspect = img && img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1;
            boxW = item.w;
            boxH = item.w / aspect;
          } else {
            const s = textItemSize(item);
            boxW = s.w;
            boxH = s.h;
          }
          const ext = rotatedExtent(boxW, boxH, item.rotation);
          minX = Math.min(minX, item.x - ext.w / 2);
          minY = Math.min(minY, item.y - ext.h / 2);
          maxX = Math.max(maxX, item.x + ext.w / 2);
          maxY = Math.max(maxY, item.y + ext.h / 2);
        }

        if (!isFinite(minX)) { resolve({ dataUrl: "", bbox: null }); return; }

        const cropW = (maxX - minX) + PAD * 2;
        const cropH = (maxY - minY) + PAD * 2;
        const offsetX = minX - PAD;
        const offsetY = minY - PAD;

        const SCALE = OUTPUT / Math.max(cropW, cropH);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(cropW * SCALE);
        canvas.height = Math.round(cropH * SCALE);
        const ctx = canvas.getContext("2d")!;
        ctx.scale(SCALE, SCALE);
        ctx.translate(-offsetX, -offsetY);

        const renderNext = (index: number) => {
          if (index >= designItems.length) {
              const bbox = {
                left: offsetX / pa.width,
                top: offsetY / pa.height,
                width: cropW / pa.width,
                height: cropH / pa.height,
              };
              resolve({ dataUrl: canvas.toDataURL("image/png"), bbox });
              return;
            }
          const item = designItems[index];
          if (item.type === "image" && item.src) {
            const img = loadedImgs.get(item.src)!;
            const aspect = img.naturalWidth / img.naturalHeight;
            const drawW = item.w;
            const drawH = item.w / aspect;
            ctx.save();
            ctx.translate(item.x, item.y);
            if (item.rotation) ctx.rotate((item.rotation * Math.PI) / 180);
            ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
            ctx.restore();
            renderNext(index + 1);
          } else if (item.type === "text") {
            drawTextItem(ctx, item, item.x, item.y);
            renderNext(index + 1);
          } else {
            renderNext(index + 1);
          }
        };
        renderNext(0);
      };

      if (pending === 0) {
        proceed();
      } else {
        imageItems.forEach(item => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => { loadedImgs.set(item.src!, img); if (--pending === 0) proceed(); };
          img.onerror = () => { if (--pending === 0) proceed(); };
          img.src = item.src!;
        });
      }
    });
  };

  useEffect(() => {
    localStorage.setItem("designItems", JSON.stringify(allDesignItems));
  }, [allDesignItems]);

  // Drive the on-canvas embroidery render: whenever the design (or product /
  // colour / technique) changes and we're not mid-drag, flatten the current
  // slide and feed it to the off-screen EmbroideryPreview, which produces the
  // stitched result (canvasEmbRenderedUrl) that we overlay on the canvas.
  useEffect(() => {
    if (!onCanvasEmbroidery || designItems.length === 0) {
      canvasEmbDataUrlRef.current = null;
      setCanvasEmbDataUrl(null);
      setCanvasEmbRenderedUrl(null);
      setCanvasEmbBbox(null);
      setCanvasEmbLoading(false);
      setCanvasEmbSettling(false);
      return;
    }
    // Keep the last stitched overlay frozen while dragging/resizing — the live,
    // flat element is shown instead during manipulation.
    if (designGestureActive) return;
    let cancelled = false;
    setCanvasEmbLoading(true);
    flattenDesignItems().then(({ dataUrl, bbox }) => {
      if (cancelled) return;
      // Reposition the overlay to the freshly measured bounding box first.
      setCanvasEmbBbox(bbox);
      const next = dataUrl || null;
      if (!next) {
        // Nothing to render — clear the overlay and stop the spinner.
        canvasEmbDataUrlRef.current = null;
        setCanvasEmbDataUrl(null);
        setCanvasEmbRenderedUrl(null);
        setCanvasEmbLoading(false);
        setCanvasEmbSettling(false);
        return;
      }
      if (next === canvasEmbDataUrlRef.current) {
        // Identical flatten (a pure move, or a tap that didn't change the
        // design): the crop is byte-identical so the existing stitched render is
        // still valid — just move it to the new bbox and reveal. EmbroideryPreview
        // won't re-run, so we clear the spinner/settle here ourselves.
        setCanvasEmbLoading(false);
        setCanvasEmbSettling(false);
        return;
      }
      // New design: feed it to EmbroideryPreview. Stay in the settling/loading
      // state until its onRendered fires, so the flat element holds until the new
      // stitched render is ready at the final position (no jump, no stale frame).
      canvasEmbDataUrlRef.current = next;
      setCanvasEmbDataUrl(next);
    });
    return () => {
      cancelled = true;
    };
    // Re-run once the print area is first measured (currentPARef becomes non-null);
    // bbox is fraction-of-PA so zoom/pan size changes don't need a re-flatten.
  }, [onCanvasEmbroidery, canvasEmbSig, designGestureActive, !!currentPA]);

  // First reveal in a session lingers on the "Embroidery preview…" label a beat.
  useEffect(() => {
    if (canvasEmbRenderedUrl && !canvasEmbEverShownRef.current && !canvasEmbFirstDelayPassed) {
      const t = setTimeout(() => setCanvasEmbFirstDelayPassed(true), 1000);
      return () => clearTimeout(t);
    }
  }, [canvasEmbRenderedUrl, canvasEmbFirstDelayPassed]);

  const canvasEmbReady = canvasEmbEverShownRef.current || canvasEmbFirstDelayPassed;
  const showCanvasEmb =
    onCanvasEmbroidery &&
    !designGestureActive &&
    !canvasEmbSettling &&
    !!canvasEmbRenderedUrl &&
    !!canvasEmbBbox &&
    designItems.length > 0 &&
    canvasEmbReady;
  const showCanvasEmbSpinner =
    onCanvasEmbroidery &&
    !designGestureActive &&
    !canvasEmbSettling &&
    designItems.length > 0 &&
    (canvasEmbLoading || (!!canvasEmbRenderedUrl && !canvasEmbReady));
  // Hide the flat (live) art whenever the stitched overlay or its spinner is up.
  const hideFlatForEmb = (showCanvasEmb || showCanvasEmbSpinner) && !designGestureActive;

  useEffect(() => {
    if (showCanvasEmb) canvasEmbEverShownRef.current = true;
  }, [showCanvasEmb]);

  // Clamp design bbox to max 1/7 of print area (by area), anchored to center. Embroidery only.
  const clampEmbroideryBbox = (bbox: { left: number; top: number; width: number; height: number }) => {
    const maxAreaFraction = 1 / 7;
    const area = bbox.width * bbox.height;
    if (area <= maxAreaFraction) return bbox;
    const scale = Math.sqrt(maxAreaFraction / area);
    const cx = bbox.left + bbox.width / 2;
    const cy = bbox.top + bbox.height / 2;
    const newW = bbox.width * scale;
    const newH = bbox.height * scale;
    return { left: cx - newW / 2, top: cy - newH / 2, width: newW, height: newH };
  };

  const generateCartThumbnail = (): Promise<string> => {
    return new Promise((resolve) => {
      const frontItems = allDesignItems["Front"] ?? [];
      const frontArea = selectedProduct.printAreas["Front"];
      const thumbnailSrc = selectedProduct.thumbnail(selectedColor);

      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onerror = () => resolve(thumbnailSrc);
      img.onload = () => {
        const imgW = img.naturalWidth;
        const imgH = img.naturalHeight;

        // Use editor width as output size so scale factor ≈ 1, keeping item proportions exact
        const OUTPUT = Math.max(editorSize.width || 390, 390);
        const canvas = document.createElement("canvas");
        canvas.width = OUTPUT;
        canvas.height = OUTPUT;
        const ctx = canvas.getContext("2d")!;

        const canvasRect = getContainRect(OUTPUT, OUTPUT, imgW, imgH);
        ctx.drawImage(img, canvasRect.left, canvasRect.top, canvasRect.width, canvasRect.height);

        if (frontItems.length === 0 || !frontArea) {
          resolve(canvas.toDataURL("image/png"));
          return;
        }

        const editorRect = getContainRect(editorSize.width, productBoxH(editorSize.height), imageNaturalSize.width || imgW, imageNaturalSize.height || imgH);
        const scale = canvasRect.width / editorRect.width;
        const paLeft = canvasRect.left + canvasRect.width * frontArea.x;
        const paTop = canvasRect.top + canvasRect.height * frontArea.y;
        const paW = Math.round(canvasRect.width * frontArea.w);
        const paH = Math.round(canvasRect.height * frontArea.h);

        const imageItems = frontItems.filter(i => i.type === "image" && i.src);
        const loadedImgs = new Map<string, HTMLImageElement>();
        let pending = imageItems.length;

        const drawItems = () => {
          // Draw design items onto a PA-sized offscreen canvas
          const paCanvas = document.createElement("canvas");
          paCanvas.width = paW; paCanvas.height = paH;
          const pctx = paCanvas.getContext("2d")!;

          for (const item of frontItems) {
            if (item.type === "image" && item.src) {
              const el = loadedImgs.get(item.src);
              if (!el) continue;
              const aspect = el.naturalWidth / el.naturalHeight;
              // Match editor's objectFit:contain within item.w × item.w square box
              const boxSize = item.w * scale;
              const drawW = aspect >= 1 ? boxSize : boxSize * aspect;
              const drawH = aspect >= 1 ? boxSize / aspect : boxSize;
              pctx.save();
              pctx.translate(item.x * scale, item.y * scale);
              if (item.rotation) pctx.rotate((item.rotation * Math.PI) / 180);
              pctx.drawImage(el, -drawW / 2, -drawH / 2, drawW, drawH);
              pctx.restore();
            } else if (item.type === "text") {
              drawTextItem(pctx, { ...item, fontSize: item.fontSize * scale }, item.x * scale, item.y * scale);
            }
          }

          // If embroidery, clamp design to 1/7 of PA area (anchored to center) then render
          let designCanvas: HTMLCanvasElement = paCanvas;
          if (savedPrintTechnique === "embroidery") {
            // Compute design bbox in PA-local fraction coords
            const allAlpha = pctx.getImageData(0, 0, paW, paH).data;
            let minX = paW, maxX = 0, minY = paH, maxY = 0, hasPixel = false;
            for (let y = 0; y < paH; y++) for (let x = 0; x < paW; x++) {
              if (allAlpha[(y * paW + x) * 4 + 3] > 20) {
                if (x < minX) minX = x; if (x > maxX) maxX = x;
                if (y < minY) minY = y; if (y > maxY) maxY = y;
                hasPixel = true;
              }
            }
            if (hasPixel) {
              const rawBbox = { left: minX / paW, top: minY / paH, width: (maxX - minX) / paW, height: (maxY - minY) / paH };
              const clamped = clampEmbroideryBbox(rawBbox);
              const scaleX = clamped.width / rawBbox.width;
              const scaleY = clamped.height / rawBbox.height;
              const s = Math.min(scaleX, scaleY);
              if (s < 1) {
                const clampedCanvas = document.createElement("canvas");
                clampedCanvas.width = paW; clampedCanvas.height = paH;
                const cctx = clampedCanvas.getContext("2d")!;
                const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
                cctx.save();
                cctx.translate(cx, cy);
                cctx.scale(s, s);
                cctx.translate(-cx, -cy);
                cctx.drawImage(paCanvas, 0, 0);
                cctx.restore();
                const imageData = cctx.getImageData(0, 0, paW, paH);
                designCanvas = renderEmbroidery(imageData, paW, paH);
              } else {
                const imageData = pctx.getImageData(0, 0, paW, paH);
                designCanvas = renderEmbroidery(imageData, paW, paH);
              }
            } else {
              const imageData = pctx.getImageData(0, 0, paW, paH);
              designCanvas = renderEmbroidery(imageData, paW, paH);
            }
          }

          ctx.drawImage(designCanvas, paLeft, paTop);
          resolve(canvas.toDataURL("image/png"));
        };

        if (pending === 0) {
          drawItems();
        } else {
          imageItems.forEach(item => {
            const el = new Image();
            el.crossOrigin = "anonymous";
            el.onload = () => { loadedImgs.set(item.src!, el); if (--pending === 0) drawItems(); };
            el.onerror = () => { if (--pending === 0) drawItems(); };
            el.src = item.src!;
          });
        }
      };
      img.src = thumbnailSrc;
    });
  };

  const generateSideThumbnail = (slideLabel: string, slideSrc: string): Promise<string> => {
    return new Promise((resolve) => {
      const items = allDesignItems[slideLabel] ?? [];
      const printArea = selectedProduct.printAreas[slideLabel];
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onerror = () => resolve(slideSrc);
      img.onload = () => {
        const imgW = img.naturalWidth;
        const imgH = img.naturalHeight;
        const OUTPUT = Math.max(editorSize.width || 390, 390);
        const canvas = document.createElement("canvas");
        canvas.width = OUTPUT; canvas.height = OUTPUT;
        const ctx = canvas.getContext("2d")!;
        const canvasRect = getContainRect(OUTPUT, OUTPUT, imgW, imgH);
        ctx.drawImage(img, canvasRect.left, canvasRect.top, canvasRect.width, canvasRect.height);
        if (items.length === 0 || !printArea) { resolve(canvas.toDataURL("image/png")); return; }
        const editorRect = getContainRect(editorSize.width, productBoxH(editorSize.height), imageNaturalSize.width || imgW, imageNaturalSize.height || imgH);
        const scale = canvasRect.width / editorRect.width;
        const paLeft = canvasRect.left + canvasRect.width * printArea.x;
        const paTop = canvasRect.top + canvasRect.height * printArea.y;
        const paW = Math.round(canvasRect.width * printArea.w);
        const paH = Math.round(canvasRect.height * printArea.h);
        const imageItems = items.filter(i => i.type === "image" && i.src);
        const loadedImgs = new Map<string, HTMLImageElement>();
        let pending = imageItems.length;
        const drawItems = () => {
          const paCanvas = document.createElement("canvas");
          paCanvas.width = paW; paCanvas.height = paH;
          const pctx = paCanvas.getContext("2d")!;
          for (const item of items) {
            if (item.type === "image" && item.src) {
              const el = loadedImgs.get(item.src);
              if (!el) continue;
              const aspect = el.naturalWidth / el.naturalHeight;
              const boxSize = item.w * scale;
              const drawW = aspect >= 1 ? boxSize : boxSize * aspect;
              const drawH = aspect >= 1 ? boxSize / aspect : boxSize;
              pctx.save();
              pctx.translate(item.x * scale, item.y * scale);
              if (item.rotation) pctx.rotate((item.rotation * Math.PI) / 180);
              pctx.drawImage(el, -drawW / 2, -drawH / 2, drawW, drawH);
              pctx.restore();
            } else if (item.type === "text") {
              drawTextItem(pctx, { ...item, fontSize: item.fontSize * scale }, item.x * scale, item.y * scale);
            }
          }
          ctx.drawImage(paCanvas, paLeft, paTop);
          resolve(canvas.toDataURL("image/png"));
        };
        if (pending === 0) { drawItems(); } else {
          imageItems.forEach(item => {
            const el = new Image(); el.crossOrigin = "anonymous";
            el.onload = () => { loadedImgs.set(item.src!, el); if (--pending === 0) drawItems(); };
            el.onerror = () => { if (--pending === 0) drawItems(); };
            el.src = item.src!;
          });
        }
      };
      img.src = slideSrc;
    });
  };

  useEffect(() => {
    if (hasAnyItems) setShowPopup(false);
  }, [hasAnyItems]);

  useEffect(() => {
    localStorage.setItem("activeSlideIndex", String(activeIndex));
  }, [activeIndex]);

  useEffect(() => {
    localStorage.setItem("selectedProductId", selectedProductId);
  }, [selectedProductId]);

  useEffect(() => {
    localStorage.setItem("selectedColor", selectedColor);
  }, [selectedColor]);

  // Tap outside the selection deselects — but only a TAP, like the main proto
  // (which deselects on `click`, never on a drag, pan or pinch). A touch that
  // starts outside arms a candidate; moving past the slop or adding a second
  // finger cancels it; lifting the finger with it still armed deselects.
  // UI that stops touchstart propagation (editor bar, edit sheet, undo/redo)
  // never arms it, so it keeps the selection exactly as before.
  useEffect(() => {
    if (!selectedDesignId) return;
    const TAP_SLOP_PX = 10;
    let tap: { x: number; y: number } | null = null;
    const onStart = (e: TouchEvent) => {
      if (e.touches.length > 1) { tap = null; return; }
      const el = itemElRefs.current.get(selectedDesignId);
      if (el && el.contains(e.target as Node)) return;
      if (doneBtnRef.current && doneBtnRef.current.contains(e.target as Node)) return;
      tap = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };
    const onMove = (e: TouchEvent) => {
      if (!tap) return;
      const t = e.touches[0];
      if (e.touches.length > 1 || !t || Math.hypot(t.clientX - tap.x, t.clientY - tap.y) > TAP_SLOP_PX) tap = null;
    };
    const onEnd = (e: TouchEvent) => {
      if (!tap || e.touches.length > 0) return;
      tap = null;
      setSelectedDesignId(null);
    };
    const onCancel = () => { tap = null; };
    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: true });
    document.addEventListener("touchend", onEnd, { passive: true });
    document.addEventListener("touchcancel", onCancel, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onCancel);
    };
  }, [selectedDesignId]);

  const handleDesignMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const g = designGestureRef.current;
    if (g.type === "idle") return;
    e.preventDefault();
    if (g.type === "rotate") {
      // Screen-space angle from the box centre — the proto's startRotate math.
      const angle =
        (Math.atan2(e.touches[0].clientY - g.cy, e.touches[0].clientX - g.cx) * 180) / Math.PI;
      let next = g.startRotation + angle - g.startAngle;
      // Snap to the compass points within a few degrees, so straight is easy.
      const snapped = Math.round(next / 90) * 90;
      if (Math.abs(next - snapped) < 4) next = snapped;
      setDesignItems(items =>
        items.map(item => (item.id === g.itemId ? { ...item, rotation: ((next % 360) + 360) % 360 } : item))
      );
      return;
    }
    const dx = (e.touches[0].clientX - g.startTx) / zoom;
    const dy = (e.touches[0].clientY - g.startTy) / zoom;
    const pa = currentPARef.current;
    if (!pa) return;
    if (g.type === "move") {
      const measured = itemSizeRefs.current.get(g.itemId);
      const itemW = measured?.w ?? g.startW;
      const itemH = measured?.h ?? g.startW;
      const halfW = itemW / 2;
      const halfH = itemH / 2;
      const SNAP_THRESHOLD = 10;
      const rawX = Math.max(halfW, Math.min(pa.width - halfW, g.startX + dx));
      const rawY = Math.max(halfH, Math.min(pa.height - halfH, g.startY + dy));
      const snapH = Math.abs(rawY - pa.height / 2) < SNAP_THRESHOLD;
      const snapV = Math.abs(rawX - pa.width  / 2) < SNAP_THRESHOLD;
      setSnapGuides({ h: snapH, v: snapV });
      setDesignItems(items => items.map(item => {
        if (item.id !== g.itemId) return item;
        return {
          ...item,
          x: snapV ? pa.width  / 2 : rawX,
          y: snapH ? pa.height / 2 : rawY,
        };
      }));
      return;
    }
    setDesignItems(items => items.map(item => {
      if (item.id !== g.itemId) return item;
      // Uniform scale from opposite (anchor) corner
      const tx = e.touches[0].clientX;
      const ty = e.touches[0].clientY;
      const curDist = Math.sqrt(Math.pow(tx - g.anchorX, 2) + Math.pow(ty - g.anchorY, 2));
      const scale = g.startDist > 0 ? curDist / g.startDist : 1;
      const MIN_SIZE = 20;
      const isLeftGrab = g.type === "resize-tl" || g.type === "resize-bl";
      const isTopGrab = g.type === "resize-tl" || g.type === "resize-tr";
      // Both image and text now use translate(-50%, -50%), so anchor math is identical.
      // Max size = distance from anchor corner to the print area edge on each axis.
      const maxByX = isLeftGrab ? g.anchorLocalX : pa.width - g.anchorLocalX;
      const maxByY = isTopGrab ? g.anchorLocalY : pa.height - g.anchorLocalY;
      if (item.type === "image") {
        const newW = Math.max(MIN_SIZE, Math.min(g.startW * scale, maxByX * 2, maxByY * 2));
        const newX = g.anchorLocalX + (isLeftGrab ? -newW / 2 : newW / 2);
        const newY = g.anchorLocalY + (isTopGrab ? -newW / 2 : newW / 2);
        return { ...item, w: newW, x: newX, y: newY };
      } else {
        const maxScale = Math.min(maxByX * 2 / g.startW, maxByY * 2 / g.startH);
        const newFontSize = Math.max(8, Math.min(g.startFontSize * scale, g.startFontSize * maxScale));
        const scaleRatio = newFontSize / g.startFontSize;
        const newW = g.startW * scaleRatio;
        const newH = g.startH * scaleRatio;
        const newX = g.anchorLocalX + (isLeftGrab ? -newW / 2 : newW / 2);
        const newY = g.anchorLocalY + (isTopGrab ? -newH / 2 : newH / 2);
        return { ...item, fontSize: newFontSize, x: newX, y: newY };
      }
    }));
  };

  const handleDesignEnd = () => {
    const g = designGestureRef.current;
    designGestureRef.current = { type: "idle" };
    if (g.type !== "idle") {
      pendingSnapItemId.current = g.itemId;
      // Hold the flat element until the design re-flattens at its final spot, so
      // the stitched overlay doesn't flash at the pre-drag position.
      setCanvasEmbSettling(true);
    }
    setDesignGestureActive(false);
    setSnapGuides({ h: false, v: false });
  };

  // Snap runs in a useEffect so it always fires after all gesture state updates
  // have committed and itemSizeRefs has fresh measurements — avoiding the React
  // batching race where handleDesignEnd reads stale ref values.
  useEffect(() => {
    if (designGestureActive) return;
    const itemId = pendingSnapItemId.current;
    if (!itemId) return;
    pendingSnapItemId.current = null;
    const pa = currentPARef.current;
    if (!pa) return;
    setDesignItems(items => items.map(item => {
      if (item.id !== itemId) return item;
      const measured = itemSizeRefs.current.get(item.id);
      if (item.type === "image") {
        const maxW = Math.min(pa.width, pa.height);
        const w = Math.min(item.w, maxW);
        const half = w / 2;
        const x = Math.max(half, Math.min(pa.width - half, item.x));
        const y = Math.max(half, Math.min(pa.height - half, item.y));
        return { ...item, w, x, y };
      } else {
        const iW = measured?.w ?? 0;
        const iH = measured?.h ?? 0;
        if (iW === 0 || iH === 0) return item;
        const scaleByW = iW > pa.width ? pa.width / iW : 1;
        const scaleByH = iH > pa.height ? pa.height / iH : 1;
        const scale = Math.min(scaleByW, scaleByH);
        const fontSize = item.fontSize * scale;
        const newW = iW * scale;
        const newH = iH * scale;
        const x = Math.max(newW / 2, Math.min(pa.width - newW / 2, item.x));
        const y = Math.max(newH / 2, Math.min(pa.height - newH / 2, item.y));
        return { ...item, fontSize, x, y };
      }
    }));
  }, [designGestureActive]);

  // After any designItems commit outside a gesture, re-render handles synchronously
  // (before paint) so itemSizeRefs is always fresh when handle positions are computed.
  useLayoutEffect(() => {
    if (designGestureActive) return;
    setHandleTick(v => v + 1);
  }, [allDesignItems]);

  useEffect(() => {
    if (graphicsDrawerOpen) {
      requestAnimationFrame(() => {
        if (graphicsScrollRef.current) {
          graphicsScrollRef.current.scrollTop = graphicsScrollPos.current;
        }
      });
    }
  }, [graphicsDrawerOpen]);

  useEffect(() => {
    const el = popupImgRef.current;
    if (!el || !modelPopupOpen) return;
    const onStart = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 2) {
        const dx = e.touches[1].clientX - e.touches[0].clientX;
        const dy = e.touches[1].clientY - e.touches[0].clientY;
        popupGestureRef.current = { initDist: Math.hypot(dx, dy), initScale: popupZoomRef.current, startX: 0, startY: 0, initPanX: popupPanRef.current.x, initPanY: popupPanRef.current.y };
      } else if (e.touches.length === 1 && popupZoomRef.current > 1) {
        popupGestureRef.current = { initDist: 0, initScale: popupZoomRef.current, startX: e.touches[0].clientX, startY: e.touches[0].clientY, initPanX: popupPanRef.current.x, initPanY: popupPanRef.current.y };
      }
    };
    const onMove = (e: TouchEvent) => {
      e.preventDefault();
      const g = popupGestureRef.current;
      if (!g) return;
      if (e.touches.length === 2 && g.initDist > 0) {
        const dx = e.touches[1].clientX - e.touches[0].clientX;
        const dy = e.touches[1].clientY - e.touches[0].clientY;
        const s = Math.max(1, Math.min(5, g.initScale * (Math.hypot(dx, dy) / g.initDist)));
        popupZoomRef.current = s;
        setPopupZoom(s);
      } else if (e.touches.length === 1 && popupZoomRef.current > 1) {
        const p = { x: g.initPanX + e.touches[0].clientX - g.startX, y: g.initPanY + e.touches[0].clientY - g.startY };
        popupPanRef.current = p;
        setPopupPan(p);
      }
    };
    const onEnd = () => {
      if (popupZoomRef.current <= 1) { popupPanRef.current = { x: 0, y: 0 }; setPopupPan({ x: 0, y: 0 }); }
      popupGestureRef.current = null;
    };
    el.addEventListener("touchstart", onStart, { passive: false });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    return () => { el.removeEventListener("touchstart", onStart); el.removeEventListener("touchmove", onMove); el.removeEventListener("touchend", onEnd); };
  }, [modelPopupOpen]);

  /**
   * The bottom action bar.
   *
   * Fixed above the sheet by default. Laid out inline it goes in the flow
   * instead — at the end of the grey editor area, above the sheet — so it
   * scrolls away with the page rather than riding over the content. That is why
   * it is a value: the same markup, rendered in one of two places.
   */
  /**
   * After a product is picked lower down (the "other products" rail, or the
   * All-products drawer), glide back up to it. Inline the page itself is the
   * scroller; by default it is the sheet's own. `delay` lets a closing drawer
   * finish first — vaul pins the page while it is open, and a scroll started
   * under it is lost.
   */
  const scrollBackToProduct = (delay = 50) => {
    setTimeout(() => {
      if (SCROLL_VERSION) window.scrollTo({ top: 0, behavior: "smooth" });
      else checkoutDrawerScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    }, delay);
  };

  /** Total pieces picked across all sizes. */
  const totalSelectedQty = Object.keys(quantities).reduce((a: number, k: string) => a + (quantities[k] ?? 0), 0);

  /**
   * Put the current configuration in the cart — shared by the size sheet's
   * own CTA and the black cart button in the checkout sheet.
   */
  const addCurrentToCart = async () => {
    const thumbnail = await generateCartThumbnail();
    setCartItems(prev => [...prev, {
      product: selectedProduct.name,
      color: selectedColor,
      colorLabel: selectedProduct.colors.find(c => c.key === selectedColor)?.label ?? selectedColor,
      thumbnail,
      quantities: { ...quantities },
      unitPrice: currentPrice,
      printTechnique: savedPrintTechnique,
    }]);
    setCartCount(c => c + totalSelectedQty);
    setQuantities({});
    setCheckoutDrawerExpanded(false);
    setCheckoutDrawerHeight(DRAWER_MIN);
    setTimeout(() => {
      setToastVisible(true);
      setTimeout(() => setToastVisible(false), 2500);
    }, 400);
  };

  const actionBar = (
    <>
        <div id="action-bar" data-app-actionbar style={{ position: "fixed", bottom: checkoutDrawerHeight, left: 0, right: 0, paddingTop: 12, paddingBottom: 12, overflow: "visible", zIndex: 20, opacity: selectedDesignId || (showPopup && !hasAnyItems) ? 0 : 1, pointerEvents: selectedDesignId || (showPopup && !hasAnyItems) ? "none" : "auto", transition: checkoutDrawerDragging ? "opacity 0.18s ease" : "bottom 0.7s cubic-bezier(0.16,1,0.3,1), opacity 0.18s ease" }}>

          {/* Change product button — shown only when ck-drawer is at MAX */}
          {/* <div style={{ position: "absolute", inset: 0, zIndex: 17, display: "flex", alignItems: "center", justifyContent: "center", opacity: checkoutDrawerExpanded ? 1 : 0, transform: checkoutDrawerExpanded ? "translateY(0)" : "translateY(60px)", pointerEvents: checkoutDrawerExpanded ? "auto" : "none", transition: checkoutDrawerExpanded ? "opacity 0s, transform 0.5s cubic-bezier(0.34,1.56,0.64,1) 0.25s" : "opacity 0.15s ease 0s, transform 0.15s ease 0s" }}>
            <button
              type="button"
              onClick={() => setAllProductsDrawerOpen(true)}
              style={{ height: 46, padding: "0 24px", borderRadius: 999, border: "none", background: "#F4F4F4", color: "#111", fontSize: 14, fontWeight: 600, cursor: "pointer", boxShadow: "0 1px 5px rgba(0,0,0,0.06)" }}
            >
              Change this product
            </button>
          </div> */}

          {/* Action bar buttons */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "center", padding: "0 16px" }}>
            <div style={{ padding: 1, borderRadius: 999, background: "linear-gradient(90deg, #DC2626 -0.88%, #4D52D2 49.94%, #16A34A 101.36%)" }}>
              <button
                type="button"
                className="action-bar-btn"
                onClick={() => {
                  // The wait is for the sheet: it drops out of the way first,
                  // and the design drawer comes up once it has. Inline the
                  // sheet is page content with nowhere to drop to, and
                  // checkoutDrawerExpanded is pinned true — so the button
                  // always took the slow path, half a second of nothing
                  // happening before the drawer appeared.
                  if (!SCROLL_VERSION && checkoutDrawerExpanded) {
                    setCheckoutDrawerExpanded(false);
                    setCheckoutDrawerHeight(DRAWER_MIN);
                    setTimeout(() => setDesignDrawerOpen(true), 500);
                  } else {
                    setDesignDrawerOpen(true);
                  }
                }}
                style={{ height: drawerOpen ? 38 : 46, padding: drawerOpen ? "0 14px" : "0 18px", borderRadius: 999, border: "none",
                  // A faint wash of the border's own red → blue → green over
                  // the grey, so the pill reads a touch more colourful.
                  background: "linear-gradient(90deg, rgba(220,38,38,0.02) 0%, rgba(77,82,210,0.02) 50%, rgba(22,163,74,0.02) 100%), rgba(244,244,244,0.95)",
                  color: "#111", display: "flex", alignItems: "center", gap: drawerOpen ? 6 : 8, fontSize: drawerOpen ? 13 : 14, fontWeight: 600, cursor: "pointer", transition: "height 0.25s ease, font-size 0.25s ease" }}
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <linearGradient id="plusGradient" x1="0" y1="10" x2="20" y2="10" gradientUnits="userSpaceOnUse">
                      <stop offset="-0.88%" stopColor="#DC2626" />
                      <stop offset="49.94%" stopColor="#4D52D2" />
                      <stop offset="101.36%" stopColor="#16A34A" />
                    </linearGradient>
                  </defs>
                  <path d="M10 4v12M4 10h12" stroke="url(#plusGradient)" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <span>Add design/text</span>
              </button>
            </div>
          </div>

        </div>
    </>
  );

  return (
    <div
      data-app-root
      style={{
        height: "100dvh",
        position: "relative",
        display: "flex",
        flexDirection: "column",
        overflowX: "hidden",
        overflowY: "clip",
        fontFamily: '"Inter Variable", sans-serif',
        // The canvas grey: the current mid-grey at the top, a hair darker at
        // the foot. Shared with the inline card in styles.css (--canvas-bg).
        background: "var(--canvas-bg)",
        overscrollBehavior: "none",
        touchAction: "manipulation",
      }}
    >
      {/* Page content — blurred when design menu is open */}
      <div data-app-page style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      {/* Orange banner */}
      {/* Grows up by the status bar's inset (non-zero only where the page is
          drawn under it, e.g. home-screen mode), so the orange runs behind
          the status bar and the label keeps its 36px row below it. */}
      <div style={{ background: "#E8502A", color: "#fff", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, height: "calc(36px + env(safe-area-inset-top, 0px))", paddingTop: "env(safe-area-inset-top, 0px)", boxSizing: "border-box", flexShrink: 0, position: "relative", zIndex: 20 }}>
        Winter Sale 20%
        <img src="/icons/icon-chevrons-right.svg" alt="" style={{ width: 16, height: 16, filter: "invert(1)" }} />
      </div>

      {/* Header */}
      <div style={{ background: "#fff", height: HEADER, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", flexShrink: 0, position: "relative", zIndex: 20, overflow: "hidden" }}>
        <img src="/icons/Logo.svg" alt="Spreadshirt" style={{ height: 22, objectFit: "contain" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>

          {/* Wishlist — visual only for now. */}
          <button type="button" aria-label="Wishlist" style={{ background: "none", border: "none", padding: 6, cursor: "pointer", display: "flex" }}>
            <img src="/icons/icon-heart.svg" alt="" style={{ width: 24, height: 24 }} />
          </button>
          <button type="button" onClick={() => setCartDrawerOpen(true)} style={{ background: "none", border: "none", padding: 6, cursor: "pointer", display: "flex", position: "relative" }}>
            <img src="/icons/icon-cart.svg" alt="Cart" style={{ width: 24, height: 24 }} />
            {cartCount > 0 && (
              <span style={{ position: "absolute", top: 2, right: 2, width: 16, height: 16, borderRadius: "50%", background: "#16A34A", color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: '"Inter Variable", sans-serif' }}>
                {cartCount}
              </span>
            )}
          </button>
          <button type="button" style={{ background: "none", border: "none", padding: 6, cursor: "pointer", display: "flex" }}>
            <img src="/icons/icon-hamburger-menusvg.svg" alt="Menu" style={{ width: 24, height: 24 }} />
          </button>
        </div>
      </div>



      {/* Editor */}
      <div
        data-app-editor
        // Zoomed in, the stage stops handing vertical movement to the page: one
        // finger is panning the product. touch-action is read at the start of
        // each touch sequence, and lifting off after a pinch ends one — so by
        // the time the finger comes back down to pan, this is in force. Back at
        // 1 it lifts and the finger scrolls the page again.
        data-zoomed={SCROLL_VERSION && zoom > 1 ? "" : undefined}
        ref={editorRef}
        onTouchStart={onEditorTouchStart}
        onTouchMove={onEditorTouchMove}
        onTouchEnd={onEditorTouchEnd}
        style={{
          flex: 1,
          minHeight: EDITOR_MIN,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          overflow: "clip",
          touchAction: "none",
        }}
      >
        <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", overflow: "clip", transform: `translateY(${-30 * editorInterp}px) scale(${1 - 0.38 * editorInterp})`, transformOrigin: "center top", transition: checkoutDrawerDragging ? "none" : "transform 0.7s cubic-bezier(0.16,1,0.3,1)" }}>
          {slides.map((slide: { label: string; src: string }, slideIdx: number) => {
            const isActive = slideIdx === activeIndex;
            const isTarget = targetIndex !== null && slideIdx === targetIndex;
            if (!isActive && !isTarget) return null;

            let opacity = 0;
            let transform = "translate3d(0,0,0)";
            const zIndex = isTarget ? 1 : 0;
            let visibility: "visible" | "hidden" = "visible";

            if (isActive) {
              if (phase === "out") { opacity = 0; }
              else { opacity = 1; }
            }
            if (isTarget) {
              if (phase === "out") { opacity = 0; visibility = "hidden"; }
              else if (phase === "in") { opacity = 1; visibility = "visible"; }
            }

            return (
              <img
                onLoad={(e) => {
                  const img = e.currentTarget;
                  const size = { width: img.naturalWidth || 1, height: img.naturalHeight || 1 };
                  imageNaturalSizeRef.current = size;
                  setImageNaturalSize(size);
                }}
                key={slide.label}
                src={slide.src}
                alt={slide.label}
                draggable={false}
                style={{
                  position: "absolute", top: EDITOR_TOP_OFFSET, left: 0, width: "100%", height: `calc(100% - ${EDITOR_TOP_OFFSET + EDITOR_BOTTOM_OFFSET}px)`,
                  objectFit: "contain", transformOrigin: "center center",
                  opacity, visibility,
                  transform: `${transform} translate3d(${zoom <= 1 ? 0 : pan.x}px, ${zoom <= 1 ? 0 : pan.y}px, 0) scale(${zoom})`,
                  zIndex,
                  transition: "opacity 80ms cubic-bezier(0.4, 0, 0.2, 1)",
                  backfaceVisibility: "hidden",
                  WebkitBackfaceVisibility: "hidden",
                  willChange: "opacity, transform",
                  pointerEvents: "none",
                }}
              />
            );
          })}

          {/* Print area border + design items */}
          {currentPA && (
            <>
              <div style={{
                position: "absolute",
                left: currentPA.left, top: currentPA.top,
                width: currentPA.width, height: currentPA.height,
                border: "1.5px dashed rgba(0,0,0,0.35)",
                borderRadius: 4,
                pointerEvents: "none",
                zIndex: 5,
                opacity: phase === "out" ? 0 : (!activeIsEmpty && (selectedDesignId || designGestureActive)) ? 1 : 0,
                transition: "opacity 180ms ease-in-out",
                transform: `translate3d(${zoom <= 1 ? 0 : pan.x}px, ${zoom <= 1 ? 0 : pan.y}px, 0) scale(${zoom})`,
                transformOrigin: `${editorSize.width / 2 - currentPA.left}px ${productCenterY(editorSize.height) - currentPA.top}px`,
              }} />

              {/* Snap guide lines */}
              {(snapGuides.h || snapGuides.v) && (
                <div style={{
                  position: "absolute",
                  left: currentPA.left, top: currentPA.top,
                  width: currentPA.width, height: currentPA.height,
                  pointerEvents: "none",
                  zIndex: 17,
                  transform: `translate3d(${zoom <= 1 ? 0 : pan.x}px, ${zoom <= 1 ? 0 : pan.y}px, 0) scale(${zoom})`,
                  transformOrigin: `${editorSize.width / 2 - currentPA.left}px ${productCenterY(editorSize.height) - currentPA.top}px`,
                }}>
                  {snapGuides.h && (
                    <div style={{ position: "absolute", left: 0, right: 0, top: "50%", height: 1, background: "#FF3B30", transform: "translateY(-50%)" }} />
                  )}
                  {snapGuides.v && (
                    <div style={{ position: "absolute", top: 0, bottom: 0, left: "50%", width: 1, background: "#FF3B30", transform: "translateX(-50%)" }} />
                  )}
                </div>
              )}

              {/* Design items — same transform as print area so they zoom/pan in sync and stay locked to their position */}
              <div style={{
                position: "absolute",
                left: 0, top: 0, width: "100%", height: "100%",
                pointerEvents: "none",
                // 2D, not translate3d: a 3D transform makes this its own GPU
                // layer, which Safari rasterises once at zoom 1 and then just
                // magnifies — the handles, their icons and the text all went
                // soft when zoomed. A 2D transform is re-rasterised at the
                // zoom it lands on, so everything stays sharp.
                transform: `translate(${zoom <= 1 ? 0 : pan.x}px, ${zoom <= 1 ? 0 : pan.y}px) scale(${zoom})`,
                transformOrigin: `${editorSize.width / 2}px ${productCenterY(editorSize.height)}px`,
                zIndex: designGestureActive ? 16 : 6,
                opacity: phase === "out" ? 0 : 1,
                transition: "opacity 180ms ease-in-out",
              }}>
                {designItems.map(item => {
                  const isSelected = item.id === selectedDesignId;
                  // const H = 8; // handle size — re-enable with corner handles
                  return (
                    <div
                      key={item.id}
                      ref={(el) => { if (el) { itemSizeRefs.current.set(item.id, { w: el.offsetWidth, h: el.offsetHeight }); itemElRefs.current.set(item.id, el); } }}
                      style={{
                        position: "absolute",
                        left: currentPA.left + item.x,
                        top: currentPA.top + item.y,
                        width: "fit-content",
                        transform: `translate(-50%, -50%) rotate(${item.rotation ?? 0}deg)`,
                        pointerEvents: "all",
                        touchAction: "none",
                        // The main proto's selection frame: a 1px #3355FF ring.
                        boxShadow: isSelected ? `0 0 0 ${1 / zoom}px #3355FF` : "none",
                        borderRadius: 0,
                        boxSizing: "border-box",
                        overflow: "visible",
                        textAlign: "center",
                        zIndex: isSelected ? 10 : 1,
                      }}
                      onTouchStart={(e) => {
                        // A second finger landing on the object is a canvas
                        // pinch, not an object gesture (main proto) — let it
                        // through to the editor's pinch handling.
                        if (e.touches.length >= 2) return;
                        e.stopPropagation();
                        // While its textarea is up the box is not draggable —
                        // a touch here is about the caret, not a move.
                        if (item.id === editingTextId) return;
                        // A second tap on an already selected text goes
                        // straight to the keyboard — same focus-inside-the-tap
                        // sequence as the Write pill.
                        const now = Date.now();
                        const lastTap = lastTapRef.current;
                        lastTapRef.current = { id: item.id, t: now };
                        if (
                          item.type === "text" &&
                          isSelected &&
                          lastTap && lastTap.id === item.id && now - lastTap.t < 350
                        ) {
                          flushSync(() => setMobileSheetPanel(null));
                          flushSync(() => setEditingTextId(item.id));
                          document.querySelector<HTMLTextAreaElement>("[data-text-edit]")?.focus();
                          return;
                        }
                        // Bring to front + select on the first tap.
                        setSelectedDesignId(item.id);
                        setDesignItems(prev => {
                          const idx = prev.findIndex(d => d.id === item.id);
                          if (idx === -1 || idx === prev.length - 1) return prev;
                          const next = [...prev];
                          next.push(next.splice(idx, 1)[0]);
                          return next;
                        });
                        // Only an already-selected item can be dragged — the first
                        // tap just selects; a subsequent touch begins the move.
                        if (!isSelected) return;
                        pushHistory();
                        const touch = e.touches[0];
                        designGestureRef.current = {
                          type: "move",
                          itemId: item.id,
                          startTx: touch.clientX,
                          startTy: touch.clientY,
                          startX: item.x,
                          startY: item.y,
                          startW: item.w,
                          startFontSize: item.fontSize,
                        };
                        setDesignGestureActive(true);
                      }}
                    >
                      {item.type === "image" ? (
                        <img src={item.src} alt="" draggable={false} style={{ display: "block", width: item.w, height: item.w, objectFit: "contain", userSelect: "none", WebkitUserSelect: "none", opacity: hideFlatForEmb ? 0 : 1 }} />
                      ) : item.id === editingTextId ? (
                        (() => {
                          // A curved text keeps its glyphs on the path while
                          // edited (as in CE.SDK): the CurvedText render stays
                          // underneath and the textarea turns invisible on
                          // top, purely catching keys.
                          const curved = !!item.textPath;
                          const box = curved
                            ? (() => { const s = textItemSize(item); return { width: s.w, height: s.h }; })()
                            : measureTextBox(item);
                          return (
                            <div style={{ position: "relative", width: box.width, height: box.height }}>
                            {curved && (
                              <span aria-hidden style={{ position: "absolute", inset: 0, display: "block", pointerEvents: "none" }}>
                                <CurvedText
                                  text={item.content}
                                  path={item.textPath!}
                                  fontSize={item.fontSize}
                                  fontFamily={textItemFamily(item)}
                                  color={item.color ?? "#000"}
                                  bold={item.bold}
                                  italic={item.italic}
                                  underline={item.underline}
                                  showPath
                                />
                              </span>
                            )}
                            <textarea
                              data-text-edit="true"
                              value={item.content}
                              rows={1}
                              onChange={e => {
                                const v = e.target.value;
                                setDesignItems(prev => prev.map(t => (t.id === item.id ? { ...t, content: v } : t)));
                              }}
                              onBlur={() => commitTextEdit(item.id)}
                              onKeyDown={e => { if (e.key === "Escape") (e.target as HTMLTextAreaElement).blur(); }}
                              // The stage would deselect, the item would start a
                              // move — a touch in the text is the caret's alone.
                              onTouchStart={e => e.stopPropagation()}
                              onTouchMove={e => e.stopPropagation()}
                              onTouchEnd={e => e.stopPropagation()}
                              ref={node => {
                                if (!node || node.dataset.initialSelectDone === "1") return;
                                // Explicit focus, not just autoFocus: on iOS the
                                // keyboard only opens for a focus() inside the tap
                                // that asked for it (paired with the flushSync in
                                // the Write handler).
                                node.focus();
                                // An untouched placeholder is selected whole, so
                                // the first keystroke replaces it; written text
                                // gets a caret at its end instead.
                                const untouched = node.value === DEFAULT_TEXT_CONTENT;
                                node.setSelectionRange(untouched ? 0 : node.value.length, node.value.length);
                                node.dataset.initialSelectDone = "1";
                              }}
                              style={{
                                position: "absolute",
                                inset: 0,
                                display: "block",
                                width: box.width,
                                height: box.height,
                                fontSize: item.fontSize,
                                fontFamily: `"${textItemFamily(item)}"`,
                                fontWeight: item.bold ? 700 : 400,
                                fontStyle: item.italic ? "italic" : "normal",
                                textDecoration: item.underline ? "underline" : "none",
                                // While curved, the textarea is only a key
                                // sink: the glyphs underneath are the
                                // CurvedText, so its own are hidden.
                                color: curved ? "transparent" : item.color ?? "#000",
                                caretColor: curved ? "transparent" : item.color ?? "#000",
                                lineHeight: 0.9,
                                textAlign: item.textAlign ?? "center",
                                whiteSpace: "pre",
                                padding: curved ? 0 : "2px 4px",
                                margin: 0,
                                border: "none",
                                outline: "none",
                                background: "transparent",
                                resize: "none",
                                overflow: "hidden",
                                // styles.css turns selection off app-wide; the
                                // one place it must work is here.
                                userSelect: "text",
                                WebkitUserSelect: "text",
                              }}
                            />
                            </div>
                          );
                        })()
                      ) : item.textPath ? (
                        <CurvedText
                          text={item.content}
                          path={item.textPath}
                          fontSize={item.fontSize}
                          fontFamily={textItemFamily(item)}
                          color={hideFlatForEmb ? "transparent" : item.color ?? "#000"}
                          bold={item.bold}
                          italic={item.italic}
                          underline={item.underline}
                        />
                      ) : (
                        <span style={{
                          display: "block",
                          fontSize: item.fontSize,
                          fontFamily: `"${textItemFamily(item)}"`,
                          fontWeight: item.bold ? 700 : 400,
                          fontStyle: item.italic ? "italic" : "normal",
                          textDecoration: item.underline ? "underline" : "none",
                          color: hideFlatForEmb ? "transparent" : (item.color ?? "#000"),
                          lineHeight: 0.9,
                          whiteSpace: "pre-line",
                          userSelect: "none",
                          WebkitUserSelect: "none",
                          padding: "2px 4px",
                          textAlign: item.textAlign ?? "center",
                        }}>{item.content}</span>
                      )}
                      {/* Delete moved off the item into the editor bar above
                          the canvas, like the main proto — no floating trash
                          bubble riding over the design. */}
                      {isSelected && item.id !== editingTextId && (["tl", "tr", "bl", "br"] as const).map(corner => {
                        const gtype = `resize-${corner}` as "resize-tl" | "resize-tr" | "resize-bl" | "resize-br";
                        // The proto's resize nub: a 15px white circle with a
                        // 2px #3355FF border.
                        const HANDLE = 15;
                        const HIT = 44;
                        // Handles are children of the item container; absolute positioning is
                        // relative to the container's top-left (0,0), not the CSS transform origin.
                        // In percent of the container itself, not a measured size, so a
                        // corner can never lag behind the box it belongs to.
                        const cornerPos: React.CSSProperties = corner === "tl"
                          ? { top: 0, left: 0 }
                          : corner === "tr" ? { top: 0, left: "100%" }
                          : corner === "bl" ? { top: "100%", left: 0 }
                          : { top: "100%", left: "100%" };
                        // Bias each hit zone outward from the corner (instead of
                        // centring on it) so it barely overlaps the object body —
                        // that keeps the interior free for moving, while the corner
                        // stays a big, easy resize target.
                        const tx = corner === "tl" || corner === "bl" ? "-72%" : "-28%";
                        const ty = corner === "tl" || corner === "tr" ? "-72%" : "-28%";
                        // The corner point lands at these coords inside the biased
                        // hit box — keep the visible nub there so it stays on the corner.
                        const nubLeft = corner === "tl" || corner === "bl" ? "72%" : "28%";
                        const nubTop = corner === "tl" || corner === "tr" ? "72%" : "28%";
                        return (
                          <div key={corner} style={{
                            position: "absolute",
                            width: HIT, height: HIT,
                            touchAction: "none", zIndex: 3,
                            transform: `translate(${tx}, ${ty}) scale(${1 / zoom})`,
                            // Scale about the nub — the point that sits on the
                            // corner — so the counter-zoom shrinks the hit box
                            // around it and the nub stays on the corner at any
                            // zoom. About the box centre it drifted off.
                            transformOrigin: `${nubLeft} ${nubTop}`,
                            ...cornerPos,
                          }}
                            onTouchStart={(e) => {
                              e.stopPropagation();
                              pushHistory();
                              const m = itemSizeRefs.current.get(item.id);
                              const startW = m?.w ?? item.w;
                              const startH = m?.h ?? (item.type === "image" ? item.w : item.fontSize * 1.5);
                              const startFontSize = item.fontSize;
                              // Anchor corner in screen space (opposite to grabbed corner)
                              const el = itemElRefs.current.get(item.id);
                              const rect = el?.getBoundingClientRect();
                              let anchorScreenX = 0, anchorScreenY = 0;
                              if (rect) {
                                anchorScreenX = corner === "tl" || corner === "bl" ? rect.right : rect.left;
                                anchorScreenY = corner === "tl" || corner === "tr" ? rect.bottom : rect.top;
                              }
                              // Anchor corner in print-area local coords (for repositioning item during resize)
                              const isLeftGrab = corner === "tl" || corner === "bl";
                              const isTopGrab = corner === "tl" || corner === "tr";
                              let anchorLocalX: number, anchorLocalY: number;
                              // Both image and text use translate(-50%, -50%), item.x/y is center
                              anchorLocalX = item.x + (isLeftGrab ? startW / 2 : -startW / 2);
                              anchorLocalY = item.y + (isTopGrab ? startH / 2 : -startH / 2);
                              const touch = e.touches[0];
                              const startDist = Math.sqrt(
                                Math.pow(touch.clientX - anchorScreenX, 2) +
                                Math.pow(touch.clientY - anchorScreenY, 2)
                              );
                              designGestureRef.current = {
                                type: gtype, itemId: item.id,
                                startTx: touch.clientX, startTy: touch.clientY,
                                startX: item.x, startY: item.y,
                                startW, startH, startFontSize,
                                anchorX: anchorScreenX, anchorY: anchorScreenY,
                                startDist: Math.max(startDist, 10),
                                anchorLocalX, anchorLocalY,
                              };
                              setDesignGestureActive(true);
                            }}
                          >
                            <div style={{
                              position: "absolute",
                              left: nubLeft, top: nubTop,
                              transform: "translate(-50%, -50%)",
                              width: HANDLE, height: HANDLE, borderRadius: 999,
                              background: "#fff", border: "2px solid #3355FF",
                              boxSizing: "border-box",
                              flexShrink: 0, pointerEvents: "none",
                            }} />
                          </div>
                        );
                      })}

                      {/* The proto's selection chrome around the frame: the
                          trashcan above it, and the rotate + move discs 20px
                          below it — all scaled back by 1/zoom so they hold
                          their screen size while the canvas is zoomed. */}
                      {isSelected && item.id !== editingTextId && (() => {
                        const disc: React.CSSProperties = {
                          display: "flex",
                          width: 26, height: 26,
                          alignItems: "center", justifyContent: "center",
                          borderRadius: 999,
                          border: "2px solid #3355FF",
                          background: "#fff", color: "#3355FF",
                          boxSizing: "border-box",
                          touchAction: "none", cursor: "pointer",
                        };
                        return (
                          <>
                            {/* create-omat's trashcan button above the selection. */}
                            <div
                              role="button"
                              aria-label="Delete object"
                              onTouchStart={e => e.stopPropagation()}
                              onTouchEnd={e => {
                                e.stopPropagation();
                                e.preventDefault();
                                pushHistory();
                                setDesignItems(prev => prev.filter(d => d.id !== item.id));
                                setSelectedDesignId(null);
                              }}
                              style={{
                                position: "absolute",
                                // Anchored by its BOTTOM edge, 12 screen px above
                                // the frame, and scaled about that same edge — so
                                // it stays standing on the frame at any zoom. Set
                                // by `top`, the unscaled height leaked in and it
                                // sank into the text as the canvas zoomed.
                                bottom: `calc(100% + ${12 / zoom}px)`,
                                left: "50%",
                                transform: `translateX(-50%) scale(${1 / zoom})`,
                                transformOrigin: "center bottom",
                                width: 28, height: 28, borderRadius: 999,
                                border: "2px solid #d01c00",
                                background: "#f4f4f4", color: "#d01c00",
                                boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                boxSizing: "border-box",
                                touchAction: "none", cursor: "pointer", zIndex: 4,
                              }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M3 6h18" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                <line x1="10" y1="11" x2="10" y2="17" />
                                <line x1="14" y1="11" x2="14" y2="17" />
                              </svg>
                            </div>

                            {/* Rotate + move, 20px below the frame, 12px apart. */}
                            <div
                              style={{
                                position: "absolute",
                                // Off the frame's real foot, not a measured height.
                                top: `calc(100% + ${20 / zoom}px)`,
                                left: "50%",
                                transform: `translateX(-50%) scale(${1 / zoom})`,
                                transformOrigin: "center top",
                                display: "flex", gap: 12, zIndex: 4,
                              }}
                            >
                              <div
                                role="button"
                                aria-label="Rotate"
                                style={disc}
                                onTouchStart={e => {
                                  e.stopPropagation();
                                  pushHistory();
                                  const el = itemElRefs.current.get(item.id);
                                  const rect = el?.getBoundingClientRect();
                                  if (!rect) return;
                                  const cx = rect.left + rect.width / 2;
                                  const cy = rect.top + rect.height / 2;
                                  const t = e.touches[0];
                                  designGestureRef.current = {
                                    type: "rotate",
                                    itemId: item.id,
                                    cx, cy,
                                    startAngle: (Math.atan2(t.clientY - cy, t.clientX - cx) * 180) / Math.PI,
                                    startRotation: item.rotation ?? 0,
                                  };
                                  setDesignGestureActive(true);
                                }}
                              >
                                {/* Two-arrow circular glyph, as the engine draws it. */}
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                                  <path d="M21 3v5h-5" />
                                  <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                                  <path d="M3 21v-5h5" />
                                </svg>
                              </div>
                              <div
                                role="button"
                                aria-label="Move"
                                style={disc}
                                onTouchStart={e => {
                                  e.stopPropagation();
                                  pushHistory();
                                  const t = e.touches[0];
                                  designGestureRef.current = {
                                    type: "move",
                                    itemId: item.id,
                                    startTx: t.clientX,
                                    startTy: t.clientY,
                                    startX: item.x,
                                    startY: item.y,
                                    startW: item.w,
                                    startFontSize: item.fontSize,
                                  };
                                  setDesignGestureActive(true);
                                }}
                              >
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M12 2v20M2 12h20" />
                                  <path d="m9 5 3-3 3 3M9 19l3 3 3-3M5 9l-3 3 3 3M19 9l3 3-3 3" />
                                </svg>
                              </div>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  );
                })}

                {/* Live stitched embroidery overlay, positioned over the design's
                    bounding box within the print area. Hidden during drag (the
                    flat element is shown instead) and on non-embroidery products. */}
                {showCanvasEmb && canvasEmbBbox && (
                  <img
                    src={canvasEmbRenderedUrl!}
                    alt=""
                    draggable={false}
                    style={{
                      position: "absolute",
                      left: currentPA.left + canvasEmbBbox.left * currentPA.width,
                      top: currentPA.top + canvasEmbBbox.top * currentPA.height,
                      width: canvasEmbBbox.width * currentPA.width,
                      height: canvasEmbBbox.height * currentPA.height,
                      objectFit: "fill",
                      pointerEvents: "none",
                      zIndex: 8,
                    }}
                  />
                )}

                {/* Render spinner + intro label centred over the design. */}
                {showCanvasEmbSpinner && canvasEmbBbox && (
                  <div
                    style={{
                      position: "absolute",
                      left: currentPA.left + (canvasEmbBbox.left + canvasEmbBbox.width / 2) * currentPA.width,
                      top: currentPA.top + (canvasEmbBbox.top + canvasEmbBbox.height / 2) * currentPA.height,
                      transform: `translate(-50%, -50%) scale(${1 / zoom})`,
                      transformOrigin: "center center",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      background: "#000",
                      borderRadius: 999,
                      padding: canvasEmbEverShownRef.current ? 10 : "10px 16px 10px 10px",
                      boxShadow: "0 2px 12px rgba(0,0,0,0.25)",
                      pointerEvents: "none",
                      zIndex: 9,
                      whiteSpace: "nowrap",
                    }}
                  >
                    <div
                      style={{
                        width: 26,
                        height: 26,
                        flexShrink: 0,
                        borderRadius: "50%",
                        border: "3px solid rgba(255,255,255,0.3)",
                        borderTopColor: "#fff",
                        animation: "spin 0.8s linear infinite",
                      }}
                    />
                    {!canvasEmbEverShownRef.current && (
                      <span style={{ color: "#fff", fontSize: 14, fontWeight: 500 }}>Embroidery preview…</span>
                    )}
                  </div>
                )}
              </div>
            </>
          )}


        </div>

        {/* Off-screen processor that renders the live on-canvas embroidery. */}
        {onCanvasEmbroidery && canvasEmbDataUrl && (
          <EmbroideryPreview
            src={canvasEmbDataUrl}
            maxSize={500}
            style={{ position: "absolute", opacity: 0, pointerEvents: "none", width: 1, height: 1 }}
            onRendered={url => {
              setCanvasEmbRenderedUrl(url);
              setCanvasEmbLoading(false);
              setCanvasEmbSettling(false);
            }}
          />
        )}

        {/* Off-screen processor for the model popup's stitched preview. */}
        {printTechnique === "embroidery" && embroideryDataUrl && (
          <EmbroideryPreview
            src={embroideryDataUrl}
            maxSize={500}
            style={{ position: "absolute", opacity: 0, pointerEvents: "none", width: 1, height: 1 }}
            onRendered={setEmbroideryRenderedUrl}
          />
        )}


        {/* Side chevrons — visible at MAX */}
        {slides.length > 1 && (
          <>
            <div
              onTouchStart={e => { e.stopPropagation(); setChevronPressed("left"); }}
              onTouchEnd={e => { e.stopPropagation(); setChevronPressed(null); if (activeIndex > 0) goToSlide(activeIndex - 1); }}
              onTouchCancel={() => setChevronPressed(null)}
              style={{ position: "absolute", left: -6, top: (editorSize.height - checkoutDrawerHeight) / 2, transform: "translateY(-50%)", zIndex: 25, width: 72, height: 72, display: "flex", alignItems: "center", justifyContent: "center", opacity: drawerOpen ? (activeIndex === 0 ? 0.3 : 1) : 0, pointerEvents: drawerOpen ? "auto" : "none", transition: "opacity 0.25s ease, top 0.7s cubic-bezier(0.16,1,0.3,1)" }}
            >
              <div style={{ width: 36, height: 36, borderRadius: 999, background: chevronPressed === "left" ? "rgba(220,220,220,0.95)" : "rgba(255,255,255,0.85)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 6px rgba(0,0,0,0.12)", transition: "background 0.1s ease" }}>
                <img src="/icons/icon-chevron-left.svg" width={18} height={18} alt="Previous" />
              </div>
            </div>
            <div
              onTouchStart={e => { e.stopPropagation(); setChevronPressed("right"); }}
              onTouchEnd={e => { e.stopPropagation(); setChevronPressed(null); if (activeIndex < slides.length - 1) goToSlide(activeIndex + 1); }}
              onTouchCancel={() => setChevronPressed(null)}
              style={{ position: "absolute", right: -6, top: (editorSize.height - checkoutDrawerHeight) / 2, transform: "translateY(-50%)", zIndex: 25, width: 72, height: 72, display: "flex", alignItems: "center", justifyContent: "center", opacity: drawerOpen ? (activeIndex === slides.length - 1 ? 0.3 : 1) : 0, pointerEvents: drawerOpen ? "auto" : "none", transition: "opacity 0.25s ease, top 0.7s cubic-bezier(0.16,1,0.3,1)" }}
            >
              <div style={{ width: 36, height: 36, borderRadius: 999, background: chevronPressed === "right" ? "rgba(220,220,220,0.95)" : "rgba(255,255,255,0.85)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 6px rgba(0,0,0,0.12)", transition: "background 0.1s ease" }}>
                <img src="/icons/icon-chevron-right.svg" width={18} height={18} alt="Next" />
              </div>
            </div>
          </>
        )}

        {/* Editor toolbar */}
        {/* Hidden while the sheet is raised over it — which inline it never
            is: there checkoutDrawerExpanded is pinned true, so it must not
            decide this, or the toolbar would never show. */}
        <div style={{ position: "absolute", top: 12, left: 0, right: 0, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 12px", zIndex: 10, opacity: !SCROLL_VERSION && checkoutDrawerExpanded ? 0 : 1, pointerEvents: !SCROLL_VERSION && checkoutDrawerExpanded ? "none" : "auto", transition: "opacity 0.25s ease" }}>
          <div style={{ display: "flex", gap: 4 }} />
          <button type="button" onClick={async () => { setSlidePopoverOpen(v => !v); const results = await Promise.all(slides.map(s => generateSideThumbnail(s.label, s.src))); setSideThumbnails(slides.map((s, i) => ({ label: s.label, src: s.src, thumbnail: results[i] }))); }} style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", height: 40, padding: "0 14px", borderRadius: 999, border: "none", background: "#F4F4F4", color: "#000", display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 600, cursor: "pointer", opacity: selectedDesignId ? 0 : 1, pointerEvents: selectedDesignId ? "none" : "auto", transition: "opacity 0.18s ease" }}>
            <span>{slides[activeIndex]?.label ?? "Front"}</span>
            <img src="/icons/icon-chevron-down.svg" width={16} height={16} alt="" />
          </button>
          <button type="button" onClick={() => setMoreMenuDrawerOpen(true)} style={{ background: "#F4F4F4", border: "none", borderRadius: 999, width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", opacity: selectedDesignId ? 0 : 1, pointerEvents: selectedDesignId ? "none" : "auto", transition: "opacity 0.18s ease" }}>
            <img src="/icons/icon-dots-horizontal.svg" width={20} height={20} alt="More" />
          </button>
        </div>

        {/* Objects editor bars — the main proto's floating pill at the top of
            the canvas, one bar per selection type in the same shell: text gets
            the mobile text bar, artwork the design bar. Duplicate and delete
            are the live actions; the rest render like the proto's unwired
            items. Same mount for the default route and /scrollversion — the
            stage is the positioning context in both. */}
        <GraphicEditorBar
          show={selectedItem?.type === "image"}
          onDuplicate={duplicateSelectedItem}
          onDelete={deleteSelectedItem}
        />
        <MobileEditorBar
          show={selectedItem?.type === "text" && !editingTextId && !mobileSheetPanel}
          color={selectedItem?.color ?? "#000"}
          colorSet={selectedItem?.colorSet !== false}
          onWrite={() => {
            if (!selectedItem || selectedItem.type !== "text") return;
            // The proto's sequence: commit the textarea into the document
            // synchronously, still inside the tap — iOS only raises the
            // keyboard for a focus() inside the gesture that asked for it.
            flushSync(() => setMobileSheetPanel(null));
            flushSync(() => setEditingTextId(selectedItem.id));
            document.querySelector<HTMLTextAreaElement>("[data-text-edit]")?.focus();
          }}
          // Tapping an item opens the bottom sheet, at that panel — the sheet
          // never appears on its own (the proto's flow).
          onPanel={panel => setMobileSheetPanel(panel)}
          onDuplicate={duplicateSelectedItem}
          onDelete={deleteSelectedItem}
        />

        {/* Selection controls — undo/redo at the canvas's bottom-left, the
            main proto's black "Done ✓" pill at its bottom-right, 12px off the
            stage edges like the editor bar. Undo/redo are visual only for now. */}
        <div
          onTouchStart={e => e.stopPropagation()}
          onTouchMove={e => e.stopPropagation()}
          onTouchEnd={e => e.stopPropagation()}
          style={{
            position: "absolute",
            left: 12,
            right: 12,
            // Default route: the stage runs to the screen's foot, so clear
            // the home indicator too. Inline the stage is a card mid-page.
            bottom: SCROLL_VERSION ? 12 : "calc(12px + env(safe-area-inset-bottom))",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            zIndex: 20,
            opacity: selectedDesignId ? 1 : 0,
            transform: selectedDesignId ? "translateY(0)" : "translateY(16px)",
            pointerEvents: selectedDesignId ? "auto" : "none",
            transition: "opacity 0.2s ease, transform 0.2s ease",
          }}
        >
          {/* Same 48px white pill as the editor bar, two icon items in it. */}
          <div style={{ display: "flex", height: 48, boxSizing: "border-box", alignItems: "center", gap: 2, padding: 6, borderRadius: 999, background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.10)" }}>
            <button type="button" aria-label="Undo" className="eb-item" style={{ width: 36, justifyContent: "center", padding: 0, borderRadius: 999 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M9.70711 13.2929C10.0676 13.6534 10.0953 14.2206 9.7903 14.6129L9.70711 14.7071C9.34662 15.0676 8.77939 15.0953 8.3871 14.7903L8.29289 14.7071L4.29289 10.7071C4.2575 10.6717 4.22531 10.6343 4.19633 10.5953L4.12467 10.4841L4.07123 10.3713L4.03585 10.266L4.01102 10.1485L4.00398 10.0898L4 10L4.00279 9.92476L4.02024 9.79927L4.04974 9.68786L4.09367 9.57678L4.146 9.47929L4.2097 9.3871L4.29289 9.29289L8.29289 5.29289C8.68342 4.90237 9.31658 4.90237 9.70711 5.29289C10.0676 5.65338 10.0953 6.22061 9.7903 6.6129L9.70711 6.70711L7.415 9H16C18.7614 9 21 11.2386 21 14C21 16.6888 18.8777 18.8818 16.2169 18.9954L16 19H15C14.4477 19 14 18.5523 14 18C14 17.4872 14.386 17.0645 14.8834 17.0067L15 17H16C17.6569 17 19 15.6569 19 14C19 12.4023 17.7511 11.0963 16.1763 11.0051L16 11H7.415L9.70711 13.2929Z"
                  fill="currentColor"
                />
              </svg>
            </button>
            <button type="button" aria-label="Redo" className="eb-item" style={{ width: 36, justifyContent: "center", padding: 0, borderRadius: 999 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M10 19H9C6.23 19 4 16.7618 4 14.0039C4 11.2361 6.23 9.00785 9 9.00785H17.59L15.29 6.71965V6.71865C14.89 6.31896 14.89 5.68946 15.29 5.29976C15.68 4.90008 16.31 4.90008 16.71 5.29976L20.71 9.29662V9.29563C20.8 9.38555 20.87 9.49547 20.92 9.62537C20.97 9.74527 20.99 9.86518 21 10.0051C20.99 10.135 20.97 10.2549 20.92 10.3848C20.87 10.5047 20.8 10.6146 20.71 10.7145L16.71 14.7114C16.31 15.1011 15.68 15.1011 15.29 14.7114C14.89 14.3117 14.89 13.6822 15.289 13.2925L17.589 11.0043H8.99C7.33 11.0043 5.99 12.3432 5.99 14.0019C5.99 15.6506 7.33 16.9996 8.99 16.9996H9.99C10.54 16.9996 10.99 17.4392 10.99 17.9988C10.99 18.5484 10.54 18.998 9.99 18.998L10 19Z"
                  fill="currentColor"
                />
              </svg>
            </button>
          </div>

          {/* The main proto's Done pill (create-omat's DockUnselectButton). */}
          <button
            ref={doneBtnRef}
            type="button"
            onClick={() => setSelectedDesignId(null)}
            style={{
              display: "inline-flex",
              minHeight: 40,
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              borderRadius: 24,
              border: "none",
              background: "#000",
              padding: "12px 16px",
              fontSize: 12,
              fontWeight: 600,
              color: "#fff",
              cursor: "pointer",
              fontFamily: '"Inter Variable", sans-serif',
              boxShadow: "0px 2px 4px 0px #25211F0D",
            }}
          >
            Done
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M19.2929 6.29289C19.6834 5.90237 20.3166 5.90237 20.7071 6.29289C21.0676 6.65338 21.0953 7.22061 20.7903 7.6129L20.7071 7.70711L10.7071 17.7071C10.3466 18.0676 9.77939 18.0953 9.3871 17.7903L9.29289 17.7071L4.29289 12.7071C3.90237 12.3166 3.90237 11.6834 4.29289 11.2929C4.65338 10.9324 5.22061 10.9047 5.6129 11.2097L5.70711 11.2929L10 15.585L19.2929 6.29289Z"
                fill="currentColor"
              />
            </svg>
          </button>
        </div>

        {/* Inline, the action bar belongs to the stage — inside it, so the grey
            is one rounded card rather than two blocks that have to be made to
            look like one. Pinned to the card's foot by styles.css. */}
        {SCROLL_VERSION && actionBar}
      </div>





      {/* Blur overlay — behind ck-drawer and action bar, grows as drawer opens */}
      {(() => {
        // While the sheet itself is hidden (an object selected, or the popup
        // up on an empty design) its veil must not linger: otherwise the
        // near-transparent layer swallows every pinch and pan on the canvas.
        const sheetHidden = !SCROLL_VERSION && (!!selectedDesignId || (showPopup && !hasAnyItems));
        const interp = sheetHidden ? 0 : drawerInterp;
        return (
          <div data-ck-veil style={{
            position: "fixed",
            inset: 0,
            zIndex: 17,
            backdropFilter: "none",
            WebkitBackdropFilter: "none",
            background: `rgba(0,0,0,${interp * 0.004})`,
            opacity: interp,
            pointerEvents: interp > 0.05 ? "auto" : "none",
            transition: checkoutDrawerDragging ? "none" : "opacity 0.4s ease",
          }} onClick={() => { setCheckoutDrawerExpanded(false); setCheckoutDrawerHeight(DRAWER_MIN); if (checkoutDrawerScrollRef.current) checkoutDrawerScrollRef.current.scrollTop = 0; }} />
        );
      })()}

      {/* Checkout drawer — overlays editor, sits below action bar */}
      <div
        data-ck-drawer
        // Fixed, a hidden sheet costs no room; in the flow it would leave its
        // full height as a hole. Marked so the inline layout can take it out.
        //
        // Only for the onboarding, though. The sheet also fades while a design
        // is selected — so that it does not cover the canvas — but inline it
        // covers nothing, it is simply below. Taking it out of the flow there
        // would collapse the page under the reader and snap them to the top.
        data-ck-hidden={
          (SCROLL_VERSION ? showPopup && !hasAnyItems : selectedDesignId || (showPopup && !hasAnyItems))
            ? ""
            : undefined
        }
        ref={checkoutDrawerRef}
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          height: checkoutDrawerHeight,
          background: "#F4F4F4",
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          boxShadow: checkoutDrawerShadow,
          display: "flex",
          flexDirection: "column",
          transition: checkoutDrawerDragging ? "opacity 0.18s ease" : "height 0.7s cubic-bezier(0.16,1,0.3,1), opacity 0.5s ease, transform 0.6s cubic-bezier(0.16,1,0.3,1)",
          overscrollBehavior: "none",
          touchAction: "manipulation",
          zIndex: 18,
          opacity: selectedDesignId || (showPopup && !hasAnyItems) ? 0 : 1,
          transform: (showPopup && !hasAnyItems) ? "translateY(24px)" : "translateY(0)",
          pointerEvents: selectedDesignId || (showPopup && !hasAnyItems) ? "none" : "auto",
        }}
      >
        {/* Tap-to-expand overlay — only active when drawer is at MIN */}
        {!checkoutDrawerExpanded && (
          <div
            style={{ position: "absolute", inset: 0, zIndex: 10, cursor: "pointer" }}
            onTouchStart={e => { checkoutDrawerStart(e.touches[0].clientY); }}
            onTouchMove={e => { e.preventDefault(); checkoutDrawerMove(e.touches[0].clientY); }}
            onTouchEnd={e => {
              checkoutDrawerEnd(e.changedTouches[0].clientY);
            }}
            onClick={() => {
              setCheckoutDrawerExpanded(true);
              setCheckoutDrawerHeight(checkoutDrawerMaxH);
              computeHoopframeWarning();
            }}
          />
        )}
        {/* Drag handle */}
        <div
          data-ck-grip
          onMouseDown={onCheckoutDrawerHandleMouseDown}
          onTouchStart={e => { if (SCROLL_VERSION) return; checkoutDrawerStart(e.touches[0].clientY); }}
          onTouchMove={e => { if (SCROLL_VERSION) return; e.preventDefault(); checkoutDrawerMove(e.touches[0].clientY); }}
          onTouchEnd={e => { if (SCROLL_VERSION) return; checkoutDrawerEnd(e.changedTouches[0].clientY); }}
          style={{ height: 20, touchAction: "none", display: "flex", justifyContent: "center", alignItems: "center", cursor: "grab", flexShrink: 0 }}
        >
          <svg ref={checkoutDrawerHandleSvgRef} width="36" height="8" viewBox="0 0 36 4" style={{ overflow: "visible" }}>
            <path ref={checkoutDrawerHandlePathRef} d="M0,2 Q18,2 36,2" stroke="rgb(204,204,204)" strokeWidth="4" strokeLinecap="round" fill="none" />
          </svg>
        </div>

        {/* Header row with toggle button — sticky above scroll */}
        <div
          data-ck-header
          onTouchStart={e => { if (SCROLL_VERSION) return; checkoutDrawerStart(e.touches[0].clientY); }}
          onTouchMove={e => { if (SCROLL_VERSION) return; e.preventDefault(); checkoutDrawerMove(e.touches[0].clientY); }}
          onTouchEnd={e => { if (SCROLL_VERSION) return; checkoutDrawerEnd(e.changedTouches[0].clientY); }}
          style={{ display: "flex", alignItems: "center", padding: checkoutDrawerExpanded ? "0 20px 12px" : "0 16px", gap: 0, flexShrink: 0, touchAction: "none", boxShadow: checkoutDrawerExpanded && checkoutDrawerContentScrolled ? "0 2px 6px rgba(0,0,0,0.06)" : "none", transition: "box-shadow 0.3s ease, padding 0.3s ease" }}>
            <h2 data-ck-title style={{
              margin: 0,
              fontFamily: "MADEOuterSans, sans-serif",
              fontSize: 14, lineHeight: 1.4, fontWeight: 500, letterSpacing: "-0.02em", color: "#000",
              opacity: 0.4 + drawerInterp * 0.4,
              flex: 1, overflow: "hidden", marginLeft: checkoutDrawerExpanded ? 0 : 4,
              whiteSpace: checkoutDrawerHeight <= DRAWER_MIN + 5 ? "nowrap" : "normal",
              textOverflow: "clip",
              maxHeight: `${19.6 + drawerInterp * 19.6}px`,
              WebkitMaskImage: checkoutDrawerHeight <= DRAWER_MIN + 5 ? "linear-gradient(to right, black 80%, transparent 100%)" : "none",
              maskImage: checkoutDrawerHeight <= DRAWER_MIN + 5 ? "linear-gradient(to right, black 80%, transparent 100%)" : "none",
            }}>
              {selectedProduct.name}
            </h2>
            {/* Inline there is nothing to close, so the price takes the
                toggle's place — and the one under the colour line goes, rather
                than being said twice. */}
            {SCROLL_VERSION && (
              <div
                style={{
                  marginLeft: 12,
                  flexShrink: 0,
                  fontSize: 22,
                  fontWeight: 700,
                  color: "#111",
                  whiteSpace: "nowrap",
                  // The title's own line box. Left at its natural height the
                  // price makes the row taller than the title, and the colour
                  // label below it then sits that much further down than the
                  // gap it was given.
                  lineHeight: "19.6px",
                }}
              >
                {currentPrice.toFixed(2).replace(".", ",") + " €"}
              </div>
            )}
            {/* Second row of the left column, under the title — see the grid in
                styles.css. It is the same line that sits under the price on the
                default layout, moved up here and hidden there. */}
            {SCROLL_VERSION && (
              <div style={{ fontSize: 14, color: "#6a6a6a" }}>
                Color: {selectedProduct.colors.find(c => c.key === selectedColor)?.label}
              </div>
            )}
            <div data-ck-cartpill style={{
              display: "flex", alignItems: "center", gap: 8, overflow: "hidden", flexShrink: 0,
              maxWidth: `${(1 - drawerInterp) * 200}px`,
              marginLeft: `${(1 - drawerInterp) * 8}px`,
              opacity: 1 - drawerInterp,
              transition: "max-width 0.3s ease, margin-left 0.3s ease, opacity 0.3s ease",
            }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#6A6A6A", flexShrink: 0, background: "#E3E3E3", borderRadius: 9999, padding: "6px 10px", display: "inline-flex", alignItems: "center", gap: 6 }}>
                <img src="/icons/icon-cart.svg" alt="" style={{ width: 18, height: 18, filter: "invert(42%)" }} />
                {currentPrice.toFixed(2).replace(".", ",") + " €"}
              </span>
            </div>
            <button
              type="button"
              data-ck-toggle
              onClick={() => {
                const next = !checkoutDrawerExpanded;
                setCheckoutDrawerExpanded(next);
                setCheckoutDrawerHeight(next ? checkoutDrawerMaxH : DRAWER_MIN);
                if (next) computeHoopframeWarning();
                if (!next && checkoutDrawerScrollRef.current) checkoutDrawerScrollRef.current.scrollTop = 0;
              }}
              style={{ width: 28, height: 28, borderRadius: 999, border: "none", background: "#E3E3E3", color: "#6A6A6A", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, flexShrink: 0, cursor: "pointer", marginLeft: 4 }}
            >
              <span style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ position: "absolute", display: "flex", alignItems: "center", justifyContent: "center", transition: "opacity 0.2s, transform 0.2s", opacity: checkoutDrawerExpanded ? 0 : 1, transform: checkoutDrawerExpanded ? "scale(0.6)" : "scale(1)" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 11 12 6 7 11" /><polyline points="17 18 12 13 7 18" /></svg>
                </span>
                <span style={{ display: "flex", alignItems: "center", justifyContent: "center", transition: "opacity 0.2s, transform 0.2s", opacity: checkoutDrawerExpanded ? 1 : 0, transform: checkoutDrawerExpanded ? "scale(1)" : "scale(0.6)" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </span>
              </span>
            </button>
          </div>

        {/* Scrollable content */}
        <div
          data-ck-scroll
          ref={checkoutDrawerScrollRef}
          onScroll={e => {
            const el = e.currentTarget as HTMLDivElement;
            setCheckoutDrawerContentScrolled(el.scrollTop > 0);
            setCheckoutDrawerScrolledToBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 4);
          }}
          onTouchStart={SCROLL_VERSION ? undefined : onCheckoutDrawerScrollTouchStart}
          onTouchMove={SCROLL_VERSION ? undefined : onCheckoutDrawerScrollTouchMove}
          onTouchEnd={SCROLL_VERSION ? undefined : onCheckoutDrawerScrollTouchEnd}
          style={{
            flex: 1,
            overflowY: checkoutDrawerExpanded ? "auto" : "hidden",
            overscrollBehavior: "none",
            overscrollBehaviorY: "contain" as any,
            WebkitOverflowScrolling: "touch" as any,
            touchAction: "pan-y",
            paddingBottom: checkoutDrawerExpanded ? 36 : 0,
          }}
        >
          {/* Price + color label */}
          {(() => {
            const interp = drawerInterp;
            return (
              <div data-ck-meta style={{ opacity: interp, overflow: "hidden", maxHeight: `${interp * 80}px`, transition: "opacity 0.3s ease, max-height 0.3s ease" }}>
                <div style={{ paddingLeft: 20, marginTop: 0, marginBottom: 16 }}>
                  <div style={{ fontSize: 14, color: "#6a6a6a", marginBottom: 10 }}>
                    Color: {selectedProduct.colors.find(c => c.key === selectedColor)?.label}
                  </div>
                  <div data-ck-bigprice style={{ fontSize: 22, fontWeight: 700, color: "#111", marginBottom: 2 }}>
                    {currentPrice.toFixed(2).replace(".", ",") + " €"}
                  </div>
                  <div data-ck-shipping style={{ fontSize: 14, color: "#6a6a6a" }}>Plus shipping</div>
                </div>
              </div>
            );
          })()}
          {(() => { const interp = drawerInterp; return (
          <div onTouchStart={onHorizontalTouchStart} onTouchMove={onHorizontalTouchMove} onTouchEnd={onHorizontalTouchEnd} style={{ display: "flex", overflowX: "auto",
            // Inline the tiles butt up against each other, and the row starts
            // on the header's 20px edge — so the selected tile's frame lines
            // up with the title above instead of sticking out past it.
            gap: SCROLL_VERSION ? 0 : 4, padding: SCROLL_VERSION ? "0 20px" : "0 16px", marginBottom: 14, marginTop: `${8 - interp * 8}px`, scrollbarWidth: "none", touchAction: checkoutDrawerExpanded ? "auto" : "pan-x", transition: checkoutDrawerDragging ? "none" : "margin-top 0.3s ease" }}>
            {selectedProduct.colors.map(({ key, label, hex }) =>
              /* Inline, the colours are the product in that colour rather than
                 a disc of it — create-omat's desktop swatch: a 50px tile, the
                 thumbnail contained inside it, and the chosen one framed. */
              SCROLL_VERSION ? (
                <button
                  key={key}
                  type="button"
                  aria-label={label}
                  onClick={() => setSelectedColor(key)}
                  style={{
                    flexShrink: 0,
                    width: 50,
                    height: 50,
                    padding: 6,
                    boxSizing: "border-box",
                    borderRadius: 8,
                    border: `1px solid ${key === selectedColor ? "#000" : "transparent"}`,
                    background: key === selectedColor ? "#fff" : "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                    cursor: "pointer",
                  }}
                >
                  <img
                    src={selectedProduct.thumbnail(key)}
                    alt={label}
                    style={{
                      maxWidth: "100%",
                      maxHeight: "100%",
                      objectFit: "contain",
                      display: "block",
                    }}
                  />
                </button>
              ) : (
                <button
                  key={key}
                  type="button"
                  aria-label={label}
                  onClick={() => setSelectedColor(key)}
                  style={{
                    flexShrink: 0, width: 44, height: 44, aspectRatio: "1 / 1",
                    borderRadius: "50%",
                    border: "none",
                    background: "none",
                    padding: 0, boxSizing: "border-box", overflow: "visible",
                    cursor: "pointer", position: "relative",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  <div style={{ width: "75%", height: "75%", borderRadius: "50%", background: hex || "#ccc", boxShadow: key === selectedColor ? `0 0 0 2px #F4F4F4, 0 0 0 3px #111` : `0 0 0 2px #F4F4F4, 0 0 0 3px #d0d0d0`, display: "flex", alignItems: "center", justifyContent: "center", transition: "box-shadow 0.2s ease" }}>
                    {key === selectedColor && (
                      <svg width="45%" height="45%" viewBox="0 0 24 24" fill="none" stroke={isLightHex(hex) ? "#555" : "#fff"} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                </button>
              )
            )}
          </div>
          ); })()}

          {/* Available sizes + CTA buttons — fade in as ck-drawer expands */}
          {(() => {
            const interp = drawerInterp;
            const oos = selectedProduct.outOfStock[selectedColor] ?? [];
            return (
              <div>
                {/* Buttons */}
                <div style={{ padding: `0 ${Math.round(16 + interp * 4)}px`, display: "flex", flexDirection: "column", gap: 8 }}>
                  {hasItemsOnPrintAreas && embroiderySupported && (
                    <div style={{ display: "flex", flexDirection: "column" }}>
                    <span style={{ display: "inline-block", alignSelf: "flex-start", background: "#111", color: "#fff", fontSize: 12, fontWeight: 500, padding: "3px 8px", fontFamily: '"Inter Variable", sans-serif', opacity: interp }}>Print technique</span>
                    <button
                      type="button"
                      onClick={async () => { const { dataUrl, bbox } = await flattenDesignItems(); setEmbroideryDataUrl(dataUrl || null); setDesignBbox(bbox); const warn = savedPrintTechnique === "embroidery" && bbox ? (() => { const area = bbox.width * bbox.height; if (area <= 1/7) return false; return Math.sqrt((1/7) / area) < 0.8; })() : false; setHoopframeWarning(warn); setEmbroideryRenderedUrl(null); setPreviewLoading(true); setPreviewDrawerOpen(true); setTimeout(() => setPreviewLoading(false), 1500); }}
                      style={{ width: "100%", height: 54, borderRadius: 0, border: "2px solid #111", background: "none", color: "#111", display: "flex", alignItems: "center", padding: "0 16px", gap: 10, fontSize: 14, fontWeight: 600, cursor: "pointer", opacity: interp }}
                    >
                      <img src={savedPrintTechnique === "embroidery" ? "/icons/icon-needle-embroidery.svg" : "/icons/icon-droplet.svg"} width={20} height={20} alt="" style={{ filter: "brightness(0)" }} />
                      <span style={{ flex: 1, textAlign: "left" }}>{savedPrintTechnique === "embroidery" ? "Embroidery" : "Standard print"}</span>
                      <img src="/icons/icon-chevron-down.svg" width={18} height={18} alt="" style={{ filter: "brightness(0)" }} />
                    </button>
                    </div>
                  )}
                  {/* The main proto's desktop selector row (its basket-hypotheses
                      layout): a bordered "Select size & quantity" trigger that
                      flexes, and beside it the black cart-plus button. Icon only
                      until sizes are picked; then it grows to reveal "Add to
                      basket" + a green count, via the 0fr → 1fr grid-track trick. */}
                  <div style={{ display: "flex", alignItems: "stretch", gap: 8, marginBottom: 10 }}>
                    <button
                      type="button"
                      onClick={() => setSizeDrawerOpen(true)}
                      style={{
                        // 54px, not the proto's 48: a thumb-sized row on mobile,
                        // level with the Print technique box above it.
                        display: "inline-flex", minWidth: 0, flex: 1, height: 54,
                        alignItems: "center", justifyContent: "space-between", gap: 12,
                        padding: "0 12px", border: "2px solid #3C3C3C", borderRadius: 0,
                        background: "transparent", color: "#000", cursor: "pointer",
                        fontFamily: '"Inter Variable", sans-serif', fontSize: 14, fontWeight: 600,
                      }}
                    >
                      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        Select size &amp; quantity
                      </span>
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
                        <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      aria-label="Add to basket"
                      // Nothing chosen yet: the tap goes to the size picker,
                      // since there is nothing to add.
                      onClick={() => (totalSelectedQty > 0 ? addCurrentToCart() : setSizeDrawerOpen(true))}
                      className="cart-cta"
                      style={{
                        display: "flex", height: 54, flexShrink: 0,
                        alignItems: "center", justifyContent: "center",
                        padding: "0 16px", border: "none", borderRadius: 0,
                        background: "#000", color: "#fff", cursor: "pointer",
                        fontFamily: '"Inter Variable", sans-serif',
                      }}
                    >
                      {/* Shopping Cart Plus — the proto's glyph, on currentColor. */}
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
                        <path
                          d="M6 2C6.51284 2 6.9354 2.38645 6.99316 2.88379L7 3V4.06836L12.0762 4.43164C12.6269 4.47101 13.0421 4.94927 13.0029 5.5C12.9664 6.01143 12.5509 6.40544 12.0508 6.42773L11.9336 6.42676L7 6.07324V12H18.1328L18.1533 11.8604C18.2261 11.3527 18.6684 10.9886 19.1689 11.002L19.2852 11.0117C19.7926 11.0846 20.1559 11.527 20.1426 12.0273L20.1328 12.1436L19.9902 13.1416C19.9251 13.5962 19.5602 13.9425 19.1133 13.9932L19 14H7V16H17C18.6569 16 20 17.3431 20 19C20 20.6569 18.6569 22 17 22C15.3431 22 14 20.6569 14 19C14 18.649 14.0631 18.3131 14.1738 18H8.82617C8.93694 18.3131 9 18.649 9 19C9 20.6569 7.65685 22 6 22C4.34315 22 3 20.6569 3 19C3 17.6941 3.83532 16.5859 5 16.1738V4H4C3.48716 4 3.0646 3.61355 3.00684 3.11621L3 3C3 2.48716 3.38645 2.0646 3.88379 2.00684L4 2H6ZM6 18C5.44772 18 5 18.4477 5 19C5 19.5523 5.44772 20 6 20C6.55228 20 7 19.5523 7 19C7 18.4477 6.55228 18 6 18ZM17 18C16.4477 18 16 18.4477 16 19C16 19.5523 16.4477 20 17 20C17.5523 20 18 19.5523 18 19C18 18.4477 17.5523 18 17 18ZM18 2C18.5128 2 18.9354 2.38645 18.9932 2.88379L19 3V5H21C21.5523 5 22 5.44772 22 6C22 6.51284 21.6135 6.9354 21.1162 6.99316L21 7H19V9C19 9.55228 18.5523 10 18 10C17.4872 10 17.0646 9.61355 17.0068 9.11621L17 9V7H15C14.4477 7 14 6.55228 14 6C14 5.48716 14.3865 5.0646 14.8838 5.00684L15 5H17V3C17 2.44772 17.4477 2 18 2Z"
                          fill="currentColor"
                        />
                      </svg>
                      <span
                        aria-hidden={totalSelectedQty === 0}
                        style={{
                          display: "grid",
                          gridTemplateColumns: totalSelectedQty > 0 ? "1fr" : "0fr",
                          transition: "grid-template-columns 0.3s cubic-bezier(0.34,1.56,0.64,1)",
                        }}
                      >
                        <span style={{ display: "flex", minWidth: 0, alignItems: "center", overflow: "hidden", whiteSpace: "nowrap", opacity: totalSelectedQty > 0 ? 1 : 0, transition: "opacity 0.2s" }}>
                          <span style={{ paddingLeft: 12, fontSize: 14, fontWeight: 600 }}>Add to basket</span>
                          {/* #007D38 — the header cart badge's green in the proto. */}
                          <span style={{ marginLeft: 12, display: "flex", height: 24, minWidth: 24, boxSizing: "border-box", flexShrink: 0, alignItems: "center", justifyContent: "center", borderRadius: 999, background: "#007D38", padding: "0 6px", fontSize: 14, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                            {totalSelectedQty}
                          </span>
                        </span>
                      </span>
                    </button>
                  </div>
                  {oos.length > 0 && (
                    <div style={{ fontSize: 15, color: "#6a6a6a", opacity: interp }}>
                      {oos.slice(0, -1).join(", ")}{oos.length > 1 ? " and " : ""}{oos[oos.length - 1]} out of stock
                    </div>
                  )}
                </div>
                <div style={{ opacity: interp }}>

                {/* Shipping info */}
                <div style={{ border: `1px solid rgba(199,199,199,${interp})`, borderRadius: 0, overflow: "hidden", margin: `16px ${Math.round(16 + interp * 4)}px 0`, transition: "border-color 0.3s ease" }}>
                  <div style={{ padding: "16px", display: "flex", alignItems: "flex-start", gap: 12 }}>
                    <img src="/icons/icon-truck.svg" alt="" style={{ width: 24, height: 24, flexShrink: 0, marginTop: 2 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", gap: 12, marginBottom: 6 }}>
                        <span style={{ fontSize: 14, color: "#3a8a3a", fontWeight: 500 }}>Express</span>
                        <span style={{ fontSize: 14, fontWeight: 700 }}>Apr 16 – Apr 18</span>
                      </div>
                      <div style={{ display: "flex", gap: 12, marginBottom: 10 }}>
                        <span style={{ fontSize: 14, color: "#111" }}>Standard</span>
                        <span style={{ fontSize: 14, fontWeight: 700 }}>Apr 20 – Apr 22</span>
                      </div>
                      <span style={{ fontSize: 14, color: "#111", textDecoration: "underline", cursor: "pointer" }}>See options</span>
                    </div>
                  </div>
                  <div style={{ height: 1, background: `rgba(199,199,199,${interp})`, margin: "0 16px", transition: "background 0.3s ease" }} />
                  <div style={{ padding: "16px", display: "flex", alignItems: "center", gap: 12 }}>
                    <img src="/icons/icon-refresh.svg" alt="" style={{ width: 24, height: 24, flexShrink: 0 }} />
                    <span style={{ fontSize: 14, color: "#111", textDecoration: "underline", cursor: "pointer" }}>30-day return guarantee</span>
                  </div>
                </div>

                {/* Accordion — product details, size & fit, reviews */}
                <div style={{ border: `1px solid rgba(199,199,199,${interp})`, borderRadius: 0, overflow: "hidden", margin: "16px 20px 8px" }}>
                  {[
                    {
                      key: "product-details",
                      label: "Product details",
                      content: (
                        <div style={{ padding: "0 16px 16px", fontSize: 14, color: "#555", lineHeight: 1.7 }}>
                          <p style={{ margin: "0 0 10px" }}>Made from 100% organic ring-spun cotton, this oversized unisex tee offers a relaxed, modern fit with a dropped shoulder and slightly elongated body.</p>
                          <p style={{ margin: 0 }}>Pre-shrunk fabric ensures a consistent fit after washing. Printed using water-based inks for a soft feel that lasts. GOTS certified and produced under fair working conditions.</p>
                        </div>
                      ),
                    },
                    {
                      key: "size-fit",
                      label: "Size & fit",
                      content: (
                        <div style={{ padding: "0 16px 16px", fontSize: 14, color: "#555", lineHeight: 1.7 }}>
                          <p style={{ margin: "0 0 10px" }}>Oversized fit — we recommend sizing down one size if you prefer a more regular look. The dropped shoulders and wide body give it a relaxed, streetwear-inspired silhouette.</p>
                          <p style={{ margin: 0 }}>Model is 188 cm and wears size M. Chest width at M: 58 cm. Body length at M: 74 cm.</p>
                        </div>
                      ),
                    },
                    {
                      key: "product-views",
                      label: "Reviews",
                      extra: (
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                          {[1,2,3,4].map(i => <svg key={i} width="16" height="16" viewBox="0 0 24 24" fill="#EA580C"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>)}
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#EA580C" strokeWidth="1.5"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                          <span style={{ fontSize: 13, color: "#555" }}>4.5 · 128 reviews</span>
                        </div>
                      ),
                      content: (
                        <div style={{ padding: "0 16px 16px" }}>
                          {[
                            { name: "Jonas M.", stars: 5, text: "Super comfortable and the print quality is excellent. Washed it 10 times and it still looks great." },
                            { name: "Sarah K.", stars: 5, text: "Fits exactly as described. Went one size down and it's perfect. Really happy with the material." },
                            { name: "Luca B.", stars: 4, text: "Great shirt overall. The oversized fit is very on-trend. Delivery was fast too." },
                            { name: "Emma R.", stars: 5, text: "Bought this as a gift and the person loved it. The custom print came out beautifully." },
                            { name: "Tobias H.", stars: 4, text: "Good quality for the price. Fabric feels premium, colours are vibrant. Would order again." },
                          ].map(({ name, stars, text }, i, arr) => (
                            <div key={name}>
                              <div style={{ paddingTop: 12, paddingBottom: 12 }}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                                  <span style={{ fontSize: 13, fontWeight: 600, color: "#111" }}>{name}</span>
                                  <div style={{ display: "flex", gap: 2 }}>
                                    {Array.from({ length: stars }).map((_, s) => <svg key={s} width="13" height="13" viewBox="0 0 24 24" fill="#EA580C"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>)}
                                  </div>
                                </div>
                                <p style={{ margin: 0, fontSize: 13, color: "#555", lineHeight: 1.6 }}>{text}</p>
                              </div>
                              {i < arr.length - 1 && <div style={{ height: 1, background: "#f0f0f0" }} />}
                            </div>
                          ))}
                          <button type="button" style={{ marginTop: 12, background: "none", border: "none", padding: 0, fontSize: 13, color: "#111", textDecoration: "underline", cursor: "pointer" }}>See more</button>
                        </div>
                      ),
                    },
                  ].map(({ key, label, content, extra }: { key: string; label: string; content: React.ReactNode; extra?: React.ReactNode }, i) => (
                    <div key={key} style={{ borderTop: i === 0 ? "none" : `1px solid rgba(199,199,199,${interp})` }}>
                      <button
                        type="button"
                        onClick={() => setOpenAccordions(prev => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next; })}
                        style={{ width: "100%", background: "none", border: "none", padding: "16px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
                      >
                        <div style={{ textAlign: "left" }}>
                          <div style={{ fontSize: 16, fontWeight: 500, color: "#111" }}>{label}</div>
                          {!openAccordions.has(key) && extra}
                        </div>
                        <img src="/icons/icon-chevron-down.svg" alt="" style={{ width: 20, height: 20, filter: "invert(20%)", flexShrink: 0, transition: "transform 0.2s", transform: openAccordions.has(key) ? "rotate(180deg)" : "none" }} />
                      </button>
                      <div style={{ overflow: "hidden", maxHeight: openAccordions.has(key) ? 600 : 0, transition: "max-height 0.4s cubic-bezier(0.16,1,0.3,1)" }}>
                        {content}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Other products */}
                <div style={{ marginBottom: 8 }}>
                  <div style={{ height: 1, background: `rgba(199,199,199,${interp})`, margin: "24px 0", transition: "background 0.3s ease" }} />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", color: "#6a6a6a", textTransform: "uppercase", padding: "0 20px", marginBottom: 10 }}>Other products</div>
                    <div style={{ position: "relative" }}>
                      {!otherProductsScrollPos.atStart && (
                        <button type="button" onClick={() => otherProductsScrollRef.current?.scrollBy({ left: -200, behavior: "smooth" })} style={{ position: "absolute", left: 12, top: 75, transform: "translateY(-50%)", zIndex: 5, width: 32, height: 32, borderRadius: "50%", border: "none", background: "rgba(255,255,255,1)", boxShadow: "0 2px 20px rgba(0,0,0,0.15)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", opacity: 1 }}>
                          <img src="/icons/icon-chevron-down.svg" width={16} height={16} alt="" style={{ transform: "rotate(90deg)", filter: "brightness(0)" }} />
                        </button>
                      )}
                      {!otherProductsScrollPos.atEnd && (
                        <button type="button" onClick={() => otherProductsScrollRef.current?.scrollBy({ left: 200, behavior: "smooth" })} style={{ position: "absolute", right: 12, top: 75, transform: "translateY(-50%)", zIndex: 5, width: 32, height: 32, borderRadius: "50%", border: "none", background: "rgba(255,255,255,1)", boxShadow: "0 2px 20px rgba(0,0,0,0.15)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", opacity: 1 }}>
                          <img src="/icons/icon-chevron-down.svg" width={16} height={16} alt="" style={{ transform: "rotate(-90deg)", filter: "brightness(0)" }} />
                        </button>
                      )}
                    <div ref={otherProductsScrollRef} onTouchStart={onHorizontalTouchStart} onTouchMove={onHorizontalTouchMove} onTouchEnd={onHorizontalTouchEnd} onScroll={e => { const el = e.currentTarget; setOtherProductsScrollPos({ atStart: el.scrollLeft <= 0, atEnd: el.scrollLeft + el.clientWidth >= el.scrollWidth - 1 }); }} style={{ overflowX: "auto", display: "flex", gap: 8, padding: "0 20px 4px", scrollbarWidth: "none", touchAction: checkoutDrawerExpanded ? "auto" : "pan-x" }}>
                      {products.filter(p => p.id !== selectedProductId).map(p => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setSelectedProductId(p.id);
                            setSelectedColor(p.defaultColor);
                            setIndex(0);
                            setActiveIndex(0);
                            scrollBackToProduct();
                          }}
                          style={{ flexShrink: 0, width: 130, background: "none", border: "none", borderRadius: 0, overflow: "visible", cursor: "pointer", textAlign: "left", padding: 0 }}
                        >
                          <div style={{ width: "100%", height: 150, background: "#e9e9e9", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <img src={p.thumbnail(p.defaultColor)} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
                          </div>
                          <div style={{ paddingTop: 8, fontSize: 12, fontWeight: 500, color: "#6a6a6a", lineHeight: 1.4, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{p.name}</div>
                        </button>
                      ))}
                    </div>
                    </div>{/* end position relative */}
                    <div style={{ height: 12 }} />
                  </div>
                  <div style={{ padding: "0 20px 0" }}>
                    <button
                      type="button"
                      onClick={() => setAllProductsDrawerOpen(true)}
                      style={{ width: "100%", height: 54, borderRadius: 0, border: "2px solid #111", background: "none", color: "#111", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
                    >
                      See all products
                    </button>
                  </div>
                </div>

                </div>{/* end opacity interp */}
              </div>
            );
          })()}
        </div>{/* end scrollable content */}
        {/* Bottom fade — visible only when collapsed */}
        <div data-ck-fade style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 10,
          background: "linear-gradient(to bottom, rgba(0,0,0,0), rgba(0,0,0,0.1))",
          pointerEvents: "none",
          opacity: checkoutDrawerExpanded ? (checkoutDrawerScrolledToBottom ? 0 : 1) : 1,
          transition: "opacity 0.4s ease",
          zIndex: 1,
        }} />
      </div>

      {/* Gradient blur above action bar — visible when drawer at max */}
      <div style={{
        position: "fixed",
        bottom: checkoutDrawerHeight,
        left: 0, right: 0,
        height: 80,
        zIndex: 19,
        backdropFilter: "blur(25px)",
        WebkitBackdropFilter: "blur(25px)",
        maskImage: "linear-gradient(to bottom, transparent, black)",
        WebkitMaskImage: "linear-gradient(to bottom, transparent, black)",
        opacity: drawerOpen ? 1 : 0,
        pointerEvents: "none",
        transition: checkoutDrawerDragging ? "none" : "opacity 0.7s cubic-bezier(0.16,1,0.3,1), bottom 0.7s cubic-bezier(0.16,1,0.3,1)",
      }} />

      {!SCROLL_VERSION && actionBar}

      {showPopup && !hasAnyItems && (
        <>
          <div onTouchStart={(e) => { e.preventDefault(); dismissPopup(); }} onClick={dismissPopup} style={{ position: "fixed", inset: 0, zIndex: 50, touchAction: "none", cursor: "pointer" }} />
          <div id="onboarding-popup" style={{
            position: "absolute",
            bottom: 16,
            left: 16,
            right: 16,
            background: "#fff",
            borderRadius: 20,
            padding: "24px 20px 20px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
            zIndex: 51,
            fontFamily: '"MADEOuterSans", sans-serif',
          }}>
          <p style={{ margin: "0 0 20px", fontSize: 18, fontWeight: 500, textAlign: "center", lineHeight: 1.3 }}>
            <span style={{ color: "#111" }}>Design your </span><span style={{ textDecoration: "underline wavy", fontWeight: 900, color: "#FF3D2E" }}>embroidery</span><span style={{ color: "#111" }}> product!</span>
          </p>
          <div style={{
            overflow: "hidden",
            maxHeight: showDesignRow ? 100 : 0,
            opacity: showDesignRow ? 1 : 0,
            marginBottom: showDesignRow ? 10 : 0,
            transition: "max-height 0.35s cubic-bezier(0.4,0,0.2,1), opacity 0.25s ease, margin-bottom 0.35s ease",
          }}>
            <div style={{ background: "#f0f0f0", borderRadius: 16, padding: "12px 8px", display: "flex", justifyContent: "space-around" }}>
              {[
                { icon: "icon-graphics.svg", label: "Graphics" },
                { icon: "icon-text.svg", label: "Text" },
                { icon: "icon-uploads.svg", label: "Uploads" },
                { icon: "icon-sparkles-ai.svg", label: "AI Design" },
              ].map(({ icon, label }) => (
                <div key={label} onClick={() => { if (label === "Graphics") { dismissPopup(); setGraphicsDrawerOpen(true); } if (label === "Text") { dismissPopup(); addNewTextItem(); } }} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, cursor: "pointer" }}>
                  <img src={`/icons/${icon}`} width={24} height={24} alt={label} />
                  <span style={{ fontSize: 11, color: "#111", fontWeight: 600, fontFamily: '"Inter Variable", sans-serif' }}>{label}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" onClick={() => setAllProductsDrawerOpen(true)} style={{ flex: 1, height: 48, borderRadius: 999, border: "none", background: "#f0f0f0", display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 600, color: "#111", cursor: "pointer", padding: "4px 16px 4px 4px" }}>
              <img src="/icons/products.png" height={40} width="auto" style={{ display: "block", flexShrink: 0 }} alt="" />
              <span style={{ flex: 1, textAlign: "center" }}>All products</span>
            </button>
            <button type="button" onClick={() => setShowDesignRow(v => !v)} style={{ flex: 1, height: 48, borderRadius: 999, border: "none", background: "#f0f0f0", display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 600, color: "#111", cursor: "pointer", padding: "4px 16px 4px 4px" }}>
              <div style={{ width: 40, height: 40, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <div style={{ width: 24, height: 24, background: "linear-gradient(90deg, #DC2626 -0.88%, #4D52D2 49.94%, #16A34A 101.36%)", WebkitMaskImage: "url(/icons/icon-plus.svg)", WebkitMaskSize: "contain", WebkitMaskRepeat: "no-repeat", WebkitMaskPosition: "center", maskImage: "url(/icons/icon-plus.svg)", maskSize: "contain", maskRepeat: "no-repeat", maskPosition: "center" }} />
              </div>
              <span style={{ flex: 1, textAlign: "center" }}>Add design</span>
            </button>
          </div>
          </div>
        </>
      )}

      <Drawer.Root open={colorDrawerOpen} onOpenChange={setColorDrawerOpen}>
        <Drawer.Portal>
          <Drawer.Overlay style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 9998 }} />
          <Drawer.Content style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 9999,
            background: "#fff",
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            outline: "none",
            fontFamily: '"Inter Variable", sans-serif',
            display: "flex",
            flexDirection: "column",
            height: 400,
          }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "20px 16px 16px", boxShadow: colorDrawerScrolled ? "0 2px 8px rgba(0,0,0,0.08)" : "none", transition: "box-shadow 0.2s ease" }}>
              <div className="font-outer-sans" style={{ fontSize: 16, fontWeight: 500, color: "#111" }}>{selectedProduct.name}</div>
              <img src="/icons/icon-close-x.svg" alt="Close" style={{ width: 24, height: 24, cursor: "pointer", flexShrink: 0 }} onClick={() => setColorDrawerOpen(false)} />
            </div>
            <div style={{ overflowY: "auto", flex: 1, paddingTop: 16 }} onScroll={e => setColorDrawerScrolled((e.currentTarget as HTMLDivElement).scrollTop > 0)}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", color: "#111", textTransform: "uppercase", paddingLeft: 16, marginBottom: 12 }}>
                COLOR: {selectedProduct.colors.find(c => c.key === selectedColor)?.label.toUpperCase()}
              </div>
              <div style={{ position: "relative", marginBottom: 14 }}>
              <div style={{
                display: "flex",
                gap: 0,
                overflowX: "auto",
                paddingBottom: 4,
                paddingLeft: 16,
                scrollbarWidth: "none",
                WebkitOverflowScrolling: "touch" as any,
              }}>
                {selectedProduct.colors.map(({ key, label }, i) => (
                  <button
                    key={key}
                    type="button"
                    aria-label={label}
                    onClick={() => setSelectedColor(key)}
                    style={{
                      width: 58,
                      height: 58,
                      borderTopLeftRadius: i === 0 ? 8 : 0,
                      borderBottomLeftRadius: i === 0 ? 8 : 0,
                      borderTopRightRadius: i === selectedProduct.colors.length - 1 ? 8 : 0,
                      borderBottomRightRadius: i === selectedProduct.colors.length - 1 ? 8 : 0,
                      border: key === selectedColor ? "2px solid #111" : "1px solid #dedede",
                      background: key === selectedColor ? "#F4F4F4" : "none",
                      padding: 8,
                      flexShrink: 0,
                      boxSizing: "border-box",
                      overflow: "hidden",
                      cursor: "pointer",
                      marginRight: -1,
                      position: "relative",
                      zIndex: key === selectedColor ? 1 : 0,
                    }}
                  >
                    <img
                      src={selectedProduct.thumbnail(key)}
                      alt={label}
                      style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 6, display: "block" }}
                    />
                  </button>
                ))}
                <div style={{ width: 12, flexShrink: 0 }} />
              </div>
              <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 48, background: "linear-gradient(to right, transparent, #fff)", pointerEvents: "none" }} />
              </div>{/* end color scroll wrapper */}
              <div style={{ border: "1px solid #dedede", borderRadius: 12, overflow: "hidden", marginLeft: 16, marginRight: 16, marginBottom: 14, padding: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", color: "#111", textTransform: "uppercase", marginBottom: 8 }}>
                  Available Sizes:
                </div>
                <div style={{ fontSize: 14, lineHeight: 1.8 }}>
                  {selectedProduct.sizes.map((size, i) => {
                    const oos = (selectedProduct.outOfStock[selectedColor] ?? []).indexOf(size) !== -1;
                    return (
                      <span key={size}>
                        {i > 0 && <span style={{ color: "#bbb", margin: "0 4px" }}> · </span>}
                        <span style={{ color: oos ? "#bbb" : "#111", textDecoration: oos ? "line-through" : "none" }}>{size}</span>
                      </span>
                    );
                  })}
                </div>
              </div>
              <div style={{ border: "1px solid #dedede", borderRadius: 12, overflow: "hidden", marginBottom: 34, marginLeft: 16, marginRight: 16 }}>
                {[
                  { key: "product-details", label: "Product details", content: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua." },
                  { key: "size-fit", label: "Size & fit", content: "Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat." },
                  { key: "product-views", label: "Product views", extra: (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                      {[1,2,3,4].map(i => <svg key={i} width="18" height="18" viewBox="0 0 24 24" fill="#EA580C"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>)}
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#EA580C" strokeWidth="1.5"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                      <span style={{ fontSize: 14, color: "#111" }}>4.5 (128 reviews)</span>
                    </div>
                  ), content: "Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur." },
                ].map(({ key, label, content, extra }: { key: string; label: string; content: string; extra?: React.ReactNode }, i) => (
                  <div key={key} style={{ borderTop: i === 0 ? "none" : "1px solid #dedede" }}>
                    <button
                      type="button"
                      onClick={() => setOpenAccordions(prev => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next; })}
                      style={{ width: "100%", background: "none", border: "none", padding: "16px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
                    >
                      <div style={{ textAlign: "left" }}>
                        <div style={{ fontSize: 16, fontWeight: 500, color: "#111" }}>{label}</div>
                        {!openAccordions.has(key) && extra}
                      </div>
                      <img src="/icons/icon-chevron-down.svg" alt="" style={{ width: 20, height: 20, filter: "invert(20%)", flexShrink: 0, transition: "transform 0.2s", transform: openAccordions.has(key) ? "rotate(180deg)" : "none" }} />
                    </button>
                    <div style={{ overflow: "hidden", maxHeight: openAccordions.has(key) ? 200 : 0, transition: "max-height 0.3s cubic-bezier(0.16,1,0.3,1)" }}>
                      <p style={{ margin: "0 16px 16px", fontSize: 14, color: "#555", lineHeight: 1.6 }}>{content}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

      <Drawer.Root open={previewDrawerOpen} onOpenChange={(open) => { if (!open) setPrintTechnique(savedPrintTechnique); setPreviewDrawerOpen(open); }}>
        <Drawer.Portal>
          <Drawer.Overlay style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 9998 }} />
          <Drawer.Content onContextMenu={e => e.preventDefault()} style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 9999, background: "#fff", borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: "0 0 24px", outline: "none", fontFamily: '"Inter Variable", sans-serif' }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 16px 12px" }}>
              <span className="font-outer-sans" style={{ fontSize: 16, fontWeight: 500, color: "#111" }}>Print technique</span>
              <img src="/icons/icon-close-x.svg" alt="Close" style={{ width: 24, height: 24, cursor: "pointer" }} onClick={() => setPreviewDrawerOpen(false)} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", padding: "4px 16px 0" }}>
              {([
                { key: "standard", label: "Standard print", icon: "/icons/icon-droplet.svg" },
                { key: "embroidery", label: "Embroidery", icon: "/icons/icon-needle-embroidery.svg" },
              ] as const).map(({ key, label, icon }) => {
                const selected = savedPrintTechnique === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => { setPrintTechnique(key); setSavedPrintTechnique(key); setPreviewDrawerOpen(false); }}
                    style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", height: 60, padding: "0 16px", marginBottom: 8, borderRadius: 12, border: selected ? "2px solid #111" : "1px solid #e0e0e0", background: selected ? "#f7f7f7" : "#fff", cursor: "pointer", fontFamily: '"Inter Variable", sans-serif' }}
                  >
                    <img src={icon} width={22} height={22} alt="" style={{ filter: "brightness(0)" }} />
                    <span style={{ flex: 1, textAlign: "left", fontSize: 15, fontWeight: selected ? 600 : 500, color: "#111" }}>{label}</span>
                    {selected && (
                      <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

      </div>{/* end blur wrapper */}


      {/* Mobile edit sheet — the main proto's bottom drawer with the Font /
          Format / Size / Color / Curve panels, opened at whichever item of
          the editor bar was tapped. Non-modal, no overlay: the canvas stays
          visible and live while styling. */}
      {selectedItem?.type === "text" && <MobileEditSheet
        open={!editingTextId && !!mobileSheetPanel}
        initialTab={mobileSheetPanel ?? "Font"}
        onClose={() => setMobileSheetPanel(null)}
        text={
          selectedItem?.type === "text"
            ? {
                fontFamily: textItemFamily(selectedItem),
                fontSize: selectedItem.fontSize,
                color: selectedItem.color ?? "#000000",
                colorSet: selectedItem.colorSet !== false,
                textAlign: selectedItem.textAlign ?? "center",
                bold: !!selectedItem.bold,
                italic: !!selectedItem.italic,
                underline: !!selectedItem.underline,
              }
            : null
        }
        canBold={fontCaps.canBold}
        canItalic={fontCaps.canItalic}
        maxFontSize={maxFontSize}
        onFontFamilyChange={family => updateSelectedText({ fontFamily: family })}
        onFontSizeChange={size => updateSelectedText({ fontSize: size })}
        onColorChange={color => updateSelectedText({ color, colorSet: true })}
        // Same rule as the proto: on a path, alignment pins to center.
        onTextAlignChange={align =>
          updateSelectedText({ textAlign: selectedItem?.textPath ? "center" : align })
        }
        onToggleBold={() => updateSelectedText({ bold: !selectedItem?.bold })}
        onToggleItalic={() => updateSelectedText({ italic: !selectedItem?.italic })}
        onToggleUnderline={() => updateSelectedText({ underline: !selectedItem?.underline })}
        onDuplicate={duplicateSelectedItem}
        onDelete={deleteSelectedItem}
        onWrite={() => {
          if (!selectedItem || selectedItem.type !== "text") return;
          const id = selectedItem.id;
          // Two separate synchronous commits, in this order, both inside the
          // tap: the sheet closes and commits first, so the drawer's focus
          // management is finished before the textarea exists; then the
          // textarea mounts and takes focus — the proto's exact sequence.
          flushSync(() => setMobileSheetPanel(null));
          flushSync(() => setEditingTextId(id));
          document.querySelector<HTMLTextAreaElement>("[data-text-edit]")?.focus();
        }}
        curveId={curveIdForPath(selectedItem?.textPath)}
        onCurveChange={changeTextCurve}
      />}

      {/* Graphics drawer */}
      <Drawer.Root open={graphicsDrawerOpen} onOpenChange={setGraphicsDrawerOpen}>
        <Drawer.Portal>
          <Drawer.Overlay style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 9998 }} />
          <Drawer.Content style={{
            position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 9999,
            background: "#fff", borderTopLeftRadius: 16, borderTopRightRadius: 16,
            outline: "none", fontFamily: '"Inter Variable", sans-serif',
            display: "flex", flexDirection: "column", maxHeight: "80dvh",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 16px 16px", borderBottom: "1px solid #f0f0f0", flexShrink: 0 }}>
              <span className="font-outer-sans" style={{ fontSize: 16, fontWeight: 500, color: "#111" }}>Choose graphic</span>
              <img src="/icons/icon-close-x.svg" alt="Close" style={{ width: 24, height: 24, cursor: "pointer" }} onClick={() => setGraphicsDrawerOpen(false)} />
            </div>
            <div ref={graphicsScrollRef} onScroll={e => { graphicsScrollPos.current = (e.currentTarget as HTMLDivElement).scrollTop; }} style={{ overflowY: "auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
              {[
                "/img/graphics/croco.png",
                ...Array.from({ length: 16 }, (_, i) => `/img/graphics/graphics${i + 1}.png`),
                ...Array.from({ length: 32 }, (_, i) => `/img/graphics/graphics${i + 17}.webp`),
              ].map(src => (
                <button
                  key={src}
                  type="button"
                  onClick={() => addGraphicItem(src)}
                  style={{
                    height: 120, borderRadius: 0, border: "none", borderRight: "1px solid #e8e8e8", borderBottom: "1px solid #e8e8e8",
                    background: "#fff", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    padding: 12, overflow: "hidden",
                  }}
                >
                  <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", display: "block", userSelect: "none" }} />
                </button>
              ))}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

      {/* Design options drawer */}
      <Drawer.Root open={designDrawerOpen} onOpenChange={setDesignDrawerOpen}>
        <Drawer.Portal>
          <Drawer.Overlay style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 9998 }} />
          <Drawer.Content style={{
            position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 9999,
            background: "#fff", borderTopLeftRadius: 16, borderTopRightRadius: 16,
            padding: "20px 16px 40px", outline: "none", fontFamily: '"Inter Variable", sans-serif',
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
              <span className="font-outer-sans" style={{ fontSize: 16, fontWeight: 500, color: "#111" }}>Add design</span>
              <img src="/icons/icon-close-x.svg" alt="Close" style={{ width: 24, height: 24, cursor: "pointer" }} onClick={() => setDesignDrawerOpen(false)} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-around" }}>
              {[
                { icon: "icon-graphics.svg", label: "Graphics" },
                { icon: "icon-text.svg", label: "Text" },
                { icon: "icon-uploads.svg", label: "Uploads" },
                { icon: "icon-sparkles-ai.svg", label: "AI Design" },
              ].map(({ icon, label }) => (
                <div key={label} onClick={() => {
                  if (label === "Graphics") { setDesignDrawerOpen(false); setGraphicsDrawerOpen(true); }
                  if (label === "Text") { setDesignDrawerOpen(false); addNewTextItem(); }
                }} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, cursor: "pointer" }}>
                  <div style={{ width: 60, height: 60, borderRadius: 16, background: "#f4f4f4", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <img src={`/icons/${icon}`} width={28} height={28} alt={label} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#111" }}>{label}</span>
                </div>
              ))}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

      <SizeSelection
        open={sizeDrawerOpen}
        onOpenChange={setSizeDrawerOpen}
        quantities={quantities}
        setQuantities={setQuantities}
        unitPrice={currentPrice}
        outOfStock={selectedProduct.outOfStock[selectedColor] ?? []}
        sizes={selectedProduct.sizes}
        onAddToCart={addCurrentToCart}
      />

      {/* Slide selection drawer */}
      <Drawer.Root open={slidePopoverOpen} onOpenChange={setSlidePopoverOpen}>
        <Drawer.Portal>
          <Drawer.Overlay style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 9998 }} />
          <Drawer.Content style={{
            position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 9999,
            background: "#fff", borderTopLeftRadius: 16, borderTopRightRadius: 16,
            outline: "none", fontFamily: '"Inter Variable", sans-serif',
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 16px 12px" }}>
              <span className="font-outer-sans" style={{ fontSize: 16, fontWeight: 500, color: "#111" }}>Select view</span>
              <img src="/icons/icon-close-x.svg" alt="Close" style={{ width: 24, height: 24, cursor: "pointer" }} onClick={() => setSlidePopoverOpen(false)} />
            </div>
            <div style={{ width: "100%", height: 1, background: "#e8e8e8" }} />
            <div style={{ padding: "16px 16px 32px", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
              {slides.map((slide: { label: string; src: string }, i: number) => {
                const thumb = sideThumbnails.find(t => t.label === slide.label);
                const isActive = i === index;
                return (
                  <button
                    key={slide.label}
                    type="button"
                    onClick={() => { goToSlide(i); setSlidePopoverOpen(false); }}
                    style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, border: "none", background: "none", padding: 0, cursor: "pointer" }}
                  >
                    <div style={{ background: "#e9e9e9", aspectRatio: "1/1", width: "100%", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, outline: isActive ? "2px solid #111" : "none" }}>
                      <img src={thumb?.thumbnail ?? slide.src} alt={slide.label} style={{ width: "100%", height: "100%", objectFit: "contain", padding: 8, boxSizing: "border-box", borderRadius: 16 }} />
                    </div>
                    <span style={{ fontSize: 14, fontWeight: isActive ? 700 : 500, color: "#111", textAlign: "center", width: "100%" }}>{slide.label}</span>
                  </button>
                );
              })}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

      {/* All-products drawer — the main proto's ProductsDrawer (categories,
          search, filters, sort, volume-discount calculator), ported verbatim
          into src/products-drawer/. */}
      <ProductsDrawer
        open={allProductsDrawerOpen}
        onOpenChange={setAllProductsDrawerOpen}
        tiles={allTilesWithModel}
        products={rawProducts}
        onSelect={sel => {
          const next = products.find(p => p.id === sel.id);
          if (!next) return;
          setSelectedProductId(next.id);
          // The tile's shown colour when the product has it, else its default.
          setSelectedColor(
            next.colors.some(c => c.key === sel.appearanceId)
              ? sel.appearanceId
              : next.defaultColor
          );
          setIndex(0);
          setActiveIndex(0);
          setCheckoutDrawerExpanded(true);
          setCheckoutDrawerHeight(checkoutDrawerMaxH);
          computeHoopframeWarning();
          if (showPopup) dismissPopup();
          scrollBackToProduct(450);
        }}
      />

      {/* Cart drawer */}
      <Drawer.Root open={cartDrawerOpen} onOpenChange={setCartDrawerOpen}>
        <Drawer.Portal>
          <Drawer.Overlay style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 9998 }} />
          <Drawer.Content style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 9999, background: "#fff", borderTopLeftRadius: 16, borderTopRightRadius: 16, outline: "none", fontFamily: '"Inter Variable", sans-serif', display: "flex", flexDirection: "column", maxHeight: "85dvh" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 16px 16px", borderBottom: "1px solid #f0f0f0", flexShrink: 0 }}>
              <span className="font-outer-sans" style={{ fontSize: 16, fontWeight: 500, color: "#111" }}>Basket {cartCount > 0 && `(${cartCount})`}</span>
              <img src="/icons/icon-close-x.svg" alt="Close" style={{ width: 24, height: 24, cursor: "pointer" }} onClick={() => setCartDrawerOpen(false)} />
            </div>
            {cartItems.length === 0 ? (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 40, fontSize: 14, color: "#888" }}>Your basket is empty</div>
            ) : (
              <div style={{ overflowY: "auto", flex: 1, padding: "16px 16px 40px" }}>
                {cartItems.map((item, i) => {
                  const qKeys = (Object.keys(item.quantities) as string[]).filter(k => (item.quantities[k] ?? 0) > 0);
                  const totalQty = qKeys.reduce((a: number, k: string) => a + (item.quantities[k] ?? 0), 0);
                  const totalPrice = (totalQty * item.unitPrice).toFixed(2).replace(".", ",") + " €";
                  return (
                    <div key={i}>
                      <div style={{ display: "flex", gap: 14, paddingTop: i > 0 ? 20 : 0, paddingBottom: 20 }}>
                        <img src={item.thumbnail} alt={item.product} style={{ width: 110, height: 144, objectFit: "contain", padding: "0 4px", boxSizing: "border-box", borderRadius: 8, flexShrink: 0, background: "#f5f5f5" }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {/* Price + delete row */}
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                            <span style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>{totalPrice}</span>
                            <button type="button" onClick={() => { setCartItems(prev => prev.filter((_, j) => j !== i)); setCartCount(c => Math.max(0, c - totalQty)); }} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", flexShrink: 0, marginLeft: 8 }}>
                              <img src="/icons/icon-trash.svg" alt="Remove" style={{ width: 18, height: 18, opacity: 0.4 }} />
                            </button>
                          </div>
                          <div style={{ fontSize: 14, fontWeight: 600, color: "#111", marginBottom: 4, lineHeight: 1.4 }}>{item.product}</div>
                          <div style={{ fontSize: 14, color: "#888", marginBottom: item.printTechnique === "embroidery" ? 8 : 12 }}>{item.colorLabel}</div>
                          {item.printTechnique === "embroidery" && (
                            <div style={{ display: "inline-block", background: "#EDE9FE", color: "#5B21B6", fontSize: 12, fontWeight: 600, padding: "4px", borderRadius: 2, marginBottom: 12 }}>Embroidered</div>
                          )}
                          {/* Per-size quantity rows — same style as SizeSelection stepper */}
                          {qKeys.map((size: string) => {
                            const qty = item.quantities[size] ?? 0;
                            return (
                              <div key={size} style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 8 }}>
                                <span style={{ fontSize: 14, fontWeight: 500, color: "#111", flex: 1 }}>{size}</span>
                                <button type="button" disabled={qty <= 1} onClick={() => {
                                  const newQty = qty - 1;
                                  setCartItems(prev => prev.map((it, j) => {
                                    if (j !== i) return it;
                                    const newQ = { ...it.quantities, [size]: newQty };
                                    if (newQty <= 0) delete newQ[size];
                                    return { ...it, quantities: newQ };
                                  }).filter(it => Object.keys(it.quantities).some(k => (it.quantities[k] ?? 0) > 0)));
                                  setCartCount(c => Math.max(0, c - 1));
                                }} style={{ width: 36, height: 36, borderRadius: 0, border: "1px solid #d0d0d0", background: "#fff", fontSize: 22, fontWeight: 300, display: "flex", alignItems: "center", justifyContent: "center", cursor: qty <= 1 ? "default" : "pointer", color: "#111", opacity: qty <= 1 ? 0.4 : 1 }}>−</button>
                                <span style={{ width: 36, height: 36, boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", fontSize: 15, fontWeight: 600, borderTop: "1px solid #d0d0d0", borderBottom: "1px solid #d0d0d0", borderLeft: "none", borderRight: "none" }}>{qty}</span>
                                <button type="button" onClick={() => {
                                  setCartItems(prev => prev.map((it, j) => j !== i ? it : { ...it, quantities: { ...it.quantities, [size]: qty + 1 } }));
                                  setCartCount(c => c + 1);
                                }} style={{ width: 36, height: 36, borderRadius: 0, border: "1px solid #d0d0d0", background: "#fff", fontSize: 22, fontWeight: 300, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#111" }}>+</button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      {i < cartItems.length - 1 && <div style={{ height: 1, background: "#f0f0f0" }} />}
                    </div>
                  );
                })}
              </div>
            )}
            {cartItems.length > 0 && (
              <div style={{ padding: "12px 16px 40px", borderTop: "1px solid #f0f0f0", flexShrink: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16, fontSize: 15, fontWeight: 700, color: "#111" }}>
                  <span>Total</span>
                  <span>{cartItems.reduce((sum: number, item) => sum + (Object.keys(item.quantities) as string[]).reduce((a: number, k: string) => a + (item.quantities[k] ?? 0), 0) * item.unitPrice, 0).toFixed(2).replace(".", ",") + " €"}</span>
                </div>
                <button type="button" style={{ width: "100%", height: 52, borderRadius: 0, border: "none", background: "#111", color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>
                  Checkout
                </button>
              </div>
            )}
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

      <Drawer.Root open={moreMenuDrawerOpen} onOpenChange={setMoreMenuDrawerOpen}>
        <Drawer.Portal>
          <Drawer.Overlay style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 9998 }} />
          <Drawer.Content style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 9999, background: "#f2f2f2", borderTopLeftRadius: 16, borderTopRightRadius: 16, outline: "none", fontFamily: '"Inter Variable", sans-serif', paddingBottom: 40 }}>
            <div style={{ width: 36, height: 4, borderRadius: 99, background: "#d0d0d0", margin: "12px auto 12px" }} />
            <div style={{ padding: "0 16px", display: "flex", flexDirection: "column", gap: 12 }}>
              {/* See all products — solo group */}
              <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden" }}>
                <button type="button" onClick={() => { setMoreMenuDrawerOpen(false); setAllProductsDrawerOpen(true); }} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "0 16px 0 8px", height: 64, background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
                  <img src="/icons/products.png" height={48} width="auto" style={{ display: "block", flexShrink: 0 }} alt="" />
                  <span style={{ fontSize: 15, fontWeight: 500, color: "#111" }}>See all products</span>
                </button>
              </div>
              {/* Share + Add to favourites group */}
              <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden" }}>
                {[
                  { label: "Share", icon: "/icons/icon-share.svg" },
                  { label: "Add to favourites", icon: "/icons/icon-heart.svg" },
                ].map(({ label, icon }, i) => (
                  <div key={label}>
                    <button type="button" style={{ width: "100%", display: "flex", alignItems: "center", gap: 14, padding: "0 16px", height: 56, background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
                      <img src={icon} alt="" style={{ width: 22, height: 22 }} />
                      <span style={{ fontSize: 15, fontWeight: 500, color: "#111" }}>{label}</span>
                    </button>
                    {i === 0 && <div style={{ height: 1, background: "#f0f0f0", margin: "0 16px" }} />}
                  </div>
                ))}
              </div>
              {/* Contact customer service — solo group */}
              <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden" }}>
                <button type="button" style={{ width: "100%", display: "flex", alignItems: "center", gap: 14, padding: "0 16px", height: 56, background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
                  <img src="/icons/icon-phone.svg" alt="" style={{ width: 22, height: 22 }} />
                  <span style={{ fontSize: 15, fontWeight: 500, color: "#111" }}>Contact customer service</span>
                </button>
              </div>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

      {/* Toast */}
      <div style={{
        position: "fixed", bottom: 24, left: 16, right: 16,
        transform: `translateY(${toastVisible ? 0 : 100}px)`,
        transition: "transform 0.35s cubic-bezier(0.34,1.56,0.64,1)",
        background: "#16A34A", color: "#fff", borderRadius: 8,
        padding: "14px 20px", display: "flex", alignItems: "center", gap: 10,
        fontSize: 14, fontWeight: 600, fontFamily: '"Inter Variable", sans-serif',
        zIndex: 99999, pointerEvents: "none",
        boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
      }}>
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M4 10.5L8.5 15L16 6" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        Added to cart
      </div>

      {modelPopupOpen && (() => {
        const modelSrc = selectedProduct.thumbnail(selectedColor);
        const previewUrl = printTechnique === "embroidery" ? embroideryRenderedUrl : embroideryDataUrl;
        return (
          <div onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()} onPointerUp={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()} onTouchEnd={e => e.stopPropagation()} className={modelPopupClosing ? "popup-dismiss" : "popup-reveal"} style={{ position: "fixed", inset: 0, zIndex: 100000, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "all" }}>
            {/* Image container — zooms and clips */}
            <div
              ref={popupImgRef}
              style={{ position: "absolute", inset: 0, overflow: "hidden", touchAction: "none" }}
            >
              <div style={{ width: "100%", height: "100%", transform: `scale(${popupZoom}) translate(${popupPan.x / popupZoom}px, ${popupPan.y / popupZoom}px)`, transformOrigin: "center center" }}>
                <img src={modelSrc} alt="Model" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                {previewUrl && (
                  <div style={{ position: "absolute", top: "35%", left: 0, right: 0, display: "flex", justifyContent: "center" }}>
                    <img src={previewUrl} style={{ maxWidth: "25%", display: "block", objectFit: "contain" }} />
                  </div>
                )}
              </div>
            </div>
            {/* X button — fixed, outside zoom container */}
            <button
              type="button"
              onClick={e => { e.stopPropagation(); setModelPopupClosing(true); setTimeout(() => { setModelPopupOpen(false); setModelPopupClosing(false); }, 300); }}
              style={{ position: "absolute", top: 20, right: 16, width: 36, height: 36, borderRadius: "50%", background: "#fff", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.3)", zIndex: 1 }}
            >
              <img src="/icons/icon-close-x.svg" alt="Close" style={{ width: 20, height: 20 }} />
            </button>
          </div>
        );
      })()}

    </div>
  );
}
