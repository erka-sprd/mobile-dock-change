import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Drawer } from "vaul";
import EmbroideryPreview from "./EmbroideryPreview";
import SizeSelection from "./SizeSelection";

const BASE_PRODUCT_PRICE = 17.98;
const SURCHARGE_EMBROIDERY = 6;
const SURCHARGE_STANDARD = 2;


const HEADER = 56;
const EDITOR_MIN = 170;
const THRESHOLD = 10;
const EDITOR_BOTTOM_OFFSET = 80; // extra bottom padding to shift product upward from center

type ProductColor = { key: string; label: string };
type ProductConfig = {
  id: string;
  name: string;
  folder: string;
  prefix: string;
  colors: ProductColor[];
  defaultColor: string;
  sizes: readonly string[];
  outOfStock: Record<string, string[]>;
  hasCloseup: (key: string) => boolean;
  printAreas: Record<string, { x: number; y: number; w: number; h: number }>;
  thumbnail: (colorKey: string) => string;
};

const PRODUCT_CONFIGS: Record<string, ProductConfig> = {
  "oversized-unisex-tshirt": {
    id: "oversized-unisex-tshirt",
    name: "Stanley/Stella Oversized Unisex Organic T-shirt Blaster 2.0",
    folder: "oversized-unisex-tshirt",
    prefix: "tshirt-oversize-unisex",
    colors: [
      { key: "black",       label: "Black" },
      { key: "heathergrey", label: "Heather Grey" },
      { key: "khaki",       label: "Khaki" },
      { key: "mocha",       label: "Mocha" },
      { key: "navyblue",    label: "Navy Blue" },
      { key: "pinkjoy",     label: "Pink Joy" },
      { key: "softEcru",    label: "Soft Ecru" },
      { key: "stone",       label: "Stone" },
      { key: "violet",      label: "Violet" },
      { key: "white",       label: "White" },
    ],
    defaultColor: "softEcru",
    sizes: ["XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL"],
    outOfStock: {
      black:       ["XS", "3XL", "4XL"],
      heathergrey: ["S", "XXL"],
      khaki:       ["XS", "S", "4XL"],
      mocha:       ["3XL", "4XL"],
      navyblue:    ["XS", "4XL"],
      pinkjoy:     ["S", "M", "3XL", "4XL"],
      softEcru:    ["XL", "XXL", "3XL"],
      stone:       ["XS", "S"],
      violet:      ["4XL"],
      white:       ["XS", "M", "3XL", "4XL"],
    },
    hasCloseup: (key) => key !== "mocha",
    printAreas: {
      "Front":     { x: 0.27,  y: 0.22, w: 0.44, h: 0.50 },
      "Back":      { x: 0.275, y: 0.22, w: 0.44, h: 0.50 },
      "Left Arm":  { x: 0.43,  y: 0.34, w: 0.20, h: 0.40 },
      "Right Arm": { x: 0.37,  y: 0.34, w: 0.20, h: 0.40 },
    },
    thumbnail: (key) => `/img/product-images/oversized-unisex-tshirt/tshirt-oversize-unisex-${key}-front.webp`,
  },
  "unisex-hoodie": {
    id: "unisex-hoodie",
    name: "Unisex Hoodie",
    folder: "unisex-hoodie",
    prefix: "unisex-hoodie",
    colors: [
      { key: "gray",     label: "Gray" },
      { key: "graugrun", label: "Graugrün" },
      { key: "yellow",   label: "Yellow" },
    ],
    defaultColor: "gray",
    sizes: ["XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL", "5XL"],
    outOfStock: {
      gray:     ["XS", "5XL"],
      graugrun: ["S", "4XL", "5XL"],
      yellow:   ["XS", "M", "3XL", "5XL"],
    },
    hasCloseup: () => false,
    // NOTE: approximate print areas — adjust x/y/w/h as needed
    printAreas: {
      "Front":     { x: 0.28,  y: 0.25, w: 0.42, h: 0.36 },
      "Back":      { x: 0.275, y: 0.25, w: 0.43, h: 0.42 },
      "Left Arm":  { x: 0.43,  y: 0.28, w: 0.15, h: 0.28 },
      "Right Arm": { x: 0.39,  y: 0.28, w: 0.15, h: 0.28 },
    },
    thumbnail: (key) => `/img/product-images/unisex-hoodie/unisex-hoodie-${key}-front.webp`,
  },
};


const getSlidesForProduct = (productId: string, colorKey: string) => {
  const cfg = PRODUCT_CONFIGS[productId];
  const base = `/img/product-images/${cfg.folder}/${cfg.prefix}-${colorKey}`;
  return [
    { label: "Front",     src: `${base}-front.webp` },
    { label: "Back",      src: `${base}-back.webp` },
    { label: "Left Arm",  src: `${base}-leftarm.webp` },
    { label: "Right Arm", src: `${base}-rightarm.webp` },
    ...(cfg.hasCloseup(colorKey) ? [{ label: "Close Up", src: `${base}-closeup.webp` }] : []),
  ];
};

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

  const [selectedProductId, setSelectedProductId] = useState(() => {
    const saved = localStorage.getItem("selectedProductId");
    return saved && PRODUCT_CONFIGS[saved] ? saved : "unisex-hoodie";
  });
  const selectedProduct = PRODUCT_CONFIGS[selectedProductId];
  const [selectedColor, setSelectedColor] = useState(() => {
    const savedProduct = localStorage.getItem("selectedProductId");
    const cfg = savedProduct && PRODUCT_CONFIGS[savedProduct] ? PRODUCT_CONFIGS[savedProduct] : PRODUCT_CONFIGS["unisex-hoodie"];
    const savedColor = localStorage.getItem("selectedColor");
    return savedColor && cfg.colors.find(c => c.key === savedColor) ? savedColor : cfg.defaultColor;
  });
  const slides = getSlidesForProduct(selectedProductId, selectedColor);
  const savedSlideIndex = parseInt(localStorage.getItem("activeSlideIndex") ?? "0", 10) || 0;
  const [index, setIndex] = useState(savedSlideIndex);
  const [showSlideLabel, setShowSlideLabel] = useState(false);
  const [activeIndex, setActiveIndex] = useState(savedSlideIndex);
  const [targetIndex, setTargetIndex] = useState<number | null>(null);
  const [phase, setPhase] = useState<"idle" | "out" | "in">("idle");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const horizontalGesture = useRef({ startX: 0, startY: 0, locked: false });
  const barScrollRef = useRef<HTMLDivElement>(null);
  const addDesignBtnRef = useRef<HTMLButtonElement>(null);
  const addDesignExpandedWidth = useRef<number | null>(null);
  const addDesignCurrentWidth = useRef<number | null>(null);
  const addDesignAnimRef = useRef<number | null>(null);
  const isBarCompactRef = useRef(false);
  const isBarAnimatingRef = useRef(false);
  const COMPACT_WIDTH = 54;
  const ANIM_DURATION = 500;

  // Checkout drawer state
  const DRAWER_MIN = 70;
  const [checkoutDrawerHeight, setCheckoutDrawerHeight] = useState(DRAWER_MIN);
  const [checkoutDrawerMaxH, setCheckoutDrawerMaxH] = useState(DRAWER_MIN);
  const [checkoutDrawerExpanded, setCheckoutDrawerExpanded] = useState(false);
  const [checkoutDrawerDragging, setCheckoutDrawerDragging] = useState(false);
  const checkoutDrawerRef = useRef<HTMLDivElement>(null);
  const checkoutDrawerScrollRef = useRef<HTMLDivElement>(null);
  const checkoutDrawerHandlePathRef = useRef<SVGPathElement>(null);
  const checkoutDrawerHandleSvgRef = useRef<SVGSVGElement>(null);
  const checkoutDrawerDrag = useRef({ startY: 0, startH: DRAWER_MIN, active: false });
  const checkoutDrawerDragDirection = useRef<"up" | "down" | "none">("none");
  const checkoutDrawerChevronState = useRef({ bend: 0, gray: 0.8, scale: 1, rafId: 0 });
  const checkoutDrawerScrollGesture = useRef({ startY: 0, startScrollTop: 0, draggingSheet: false, lockedAtTop: false });

  const [scrollAtEnd, setScrollAtEnd] = useState(false);
  const [barScrollProgress, setBarScrollProgress] = useState(0);
  const [colorDrawerOpen, setColorDrawerOpen] = useState(false);
  const [allProductsDrawerOpen, setAllProductsDrawerOpen] = useState(false);
  const [colorDrawerScrolled, setColorDrawerScrolled] = useState(false);
  const [openAccordions, setOpenAccordions] = useState<Set<string>>(new Set());
  const [designDrawerOpen, setDesignDrawerOpen] = useState(false);
  const [textOptionsDrawerOpen, setTextOptionsDrawerOpen] = useState(false);
  const [graphicsDrawerOpen, setGraphicsDrawerOpen] = useState(false);
  const graphicsScrollRef = useRef<HTMLDivElement>(null);
  const graphicsScrollPos = useRef(0);
  const textScrollRef = useRef<HTMLDivElement>(null);
  const textScrollPos = useRef(0);
  const [sizeDrawerOpen, setSizeDrawerOpen] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [cartCount, setCartCount] = useState(0);
  const [toastVisible, setToastVisible] = useState(false);
  const [, setHandleTick] = useState(0);
  const [previewDrawerOpen, setPreviewDrawerOpen] = useState(false);
  const [modelPopupOpen, setModelPopupOpen] = useState(false);
  const [modelPopupClosing, setModelPopupClosing] = useState(false);
  const popupZoomRef = useRef(1);
  const popupPanRef = useRef({ x: 0, y: 0 });
  const popupGestureRef = useRef<{ initDist: number; initScale: number; startX: number; startY: number; initPanX: number; initPanY: number; } | null>(null);
  const popupImgRef = useRef<HTMLDivElement>(null);
  const [popupZoom, setPopupZoom] = useState(1);
  const [popupPan, setPopupPan] = useState({ x: 0, y: 0 });
  const [previewLoading, setPreviewLoading] = useState(false);
  const [printTechnique, setPrintTechnique] = useState<"embroidery" | "standard">("embroidery");
  const [savedPrintTechnique, setSavedPrintTechnique] = useState<"embroidery" | "standard">("embroidery");
  const [embroideryDataUrl, setEmbroideryDataUrl] = useState<string | null>(null);
  const [embroideryRenderedUrl, setEmbroideryRenderedUrl] = useState<string | null>(null);
  const [designBbox, setDesignBbox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  type DesignItem = { id: string; type: "text" | "image"; content: string; src?: string; x: number; y: number; w: number; fontSize: number; color?: string; };
  const [allDesignItems, setAllDesignItems] = useState<Record<string, DesignItem[]>>(() => {
    try {
      const saved = localStorage.getItem("designItems");
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  const currentSlideLabel = slides[activeIndex]?.label ?? "Front";
  const designItems: DesignItem[] = allDesignItems[currentSlideLabel] ?? [];
  const setDesignItems = (updater: DesignItem[] | ((prev: DesignItem[]) => DesignItem[])) => {
    setAllDesignItems(all => {
      const prev = all[currentSlideLabel] ?? [];
      const next = typeof updater === "function" ? updater(prev) : updater;
      return { ...all, [currentSlideLabel]: next };
    });
  };

  const designSidesCount = Object.keys(allDesignItems).filter(k => (allDesignItems[k] as DesignItem[]).length > 0).length;
  const currentPrice = BASE_PRODUCT_PRICE + designSidesCount * (savedPrintTechnique === "embroidery" ? SURCHARGE_EMBROIDERY : SURCHARGE_STANDARD);

  const [selectedDesignId, setSelectedDesignId] = useState<string | null>(null);
  const [designGestureActive, setDesignGestureActive] = useState(false);

  const hasAnyItems = Object.keys(allDesignItems).some((k) => (allDesignItems[k] as DesignItem[]).length > 0);
  const activeIsEmpty = designItems.length === 0;
  const [showPopup, setShowPopup] = useState(!hasAnyItems);
  const [showDesignRow, setShowDesignRow] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [revealed, setRevealed] = useState(hasAnyItems);
  const [slidePopoverOpen, setSlidePopoverOpen] = useState(false);

  const dismissPopup = () => {
    setShowPopup(false);
    setAnimating(true);
    setTimeout(() => setAnimating(false), 750);
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
  >({ type: "idle" });

  const handleBarScroll = () => {
    const el = barScrollRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const progress = max > 0 ? el.scrollLeft / max : 0;
    setScrollAtEnd(max <= 0 || el.scrollLeft >= max - 4);
    setBarScrollProgress(progress);
    if (isBarAnimatingRef.current) return;
    const btn = addDesignBtnRef.current;
    if (!btn) return;
    const shouldBeCompact = progress > 0;
    if (shouldBeCompact === isBarCompactRef.current) return;
    isBarCompactRef.current = shouldBeCompact;
    if (shouldBeCompact) {
      addDesignExpandedWidth.current = btn.offsetWidth;
      animateAddDesignWidth(btn.offsetWidth, COMPACT_WIDTH);
    } else {
      const expandedWidth = addDesignExpandedWidth.current ?? btn.offsetWidth;
      animateAddDesignWidth(addDesignCurrentWidth.current ?? COMPACT_WIDTH, expandedWidth);
    }
  };

  const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

  const animateAddDesignWidth = (fromWidth: number, toWidth: number) => {
    const btn = addDesignBtnRef.current;
    const scroll = barScrollRef.current;
    if (!btn || !scroll) return;
    if (addDesignAnimRef.current !== null) cancelAnimationFrame(addDesignAnimRef.current);
    isBarAnimatingRef.current = true;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / ANIM_DURATION, 1);
      const w = fromWidth + (toWidth - fromWidth) * easeOut(t);
      btn.style.width = `${w}px`;
      addDesignCurrentWidth.current = w;
      scroll.style.paddingLeft = `${16 + w + 8}px`;
      if (t < 1) {
        addDesignAnimRef.current = requestAnimationFrame(tick);
      } else {
        addDesignAnimRef.current = null;
        isBarAnimatingRef.current = false;
      }
    };
    addDesignAnimRef.current = requestAnimationFrame(tick);
  };

  // Set initial paddingLeft of scroll bar based on Add design button width
  useEffect(() => {
    const btn = addDesignBtnRef.current;
    const scroll = barScrollRef.current;
    if (!btn || !scroll) return;
    const w = btn.offsetWidth;
    addDesignCurrentWidth.current = w;
    addDesignExpandedWidth.current = w;
    scroll.style.paddingLeft = `${16 + w + 8}px`;
  }, []);

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
    ? "0 -20px 80px rgba(0,0,0,0.32), 0 -4px 24px rgba(0,0,0,0.10)"
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
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    document.documentElement.style.overscrollBehavior = "none";

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

  const onHorizontalTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    horizontalGesture.current = {
      startX: e.touches[0].clientX,
      startY: e.touches[0].clientY,
      locked: false,
    };
  };

  const onHorizontalTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const dx = e.touches[0].clientX - horizontalGesture.current.startX;
    const dy = e.touches[0].clientY - horizontalGesture.current.startY;
    if (!horizontalGesture.current.locked && Math.abs(dx) > THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
      horizontalGesture.current.locked = true;
    }
    if (horizontalGesture.current.locked) e.stopPropagation();
  };

  const onHorizontalTouchEnd = () => {
    horizontalGesture.current.locked = false;
  };

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
    if (selectedDesignId) { setSelectedDesignId(null); return; }
    if (e.touches.length === 2) {
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
    }
  };

  const onEditorTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (designGestureRef.current.type !== "idle") {
      handleDesignMove(e);
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

  const onEditorTouchEnd = () => {
    if (designGestureRef.current.type !== "idle") {
      handleDesignEnd();
      return;
    }
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
    setShowSlideLabel(true);
    window.setTimeout(() => setShowSlideLabel(false), 900);
    setPhase("out");
  };

  const currentPA = useMemo(() => {
    if (editorSize.width === 0) return null;
    const label = slides[activeIndex]?.label;
    const area = label ? selectedProduct.printAreas[label] ?? null : null;
    if (!area) return null;
    const contentH = editorSize.height - EDITOR_BOTTOM_OFFSET;
    const rect = getContainRect(editorSize.width, contentH, imageNaturalSize.width, imageNaturalSize.height);
    return {
      left: rect.left + rect.width * area.x,
      top: rect.top + rect.height * area.y,
      width: rect.width * area.w,
      height: rect.height * area.h,
    };
  }, [editorSize, activeIndex, imageNaturalSize, selectedColor]);



  useEffect(() => { currentPARef.current = currentPA; }, [currentPA]);

  const TEXT_OPTIONS = [
    { content: "Love",           color: "#F06292" },
    { content: "So\ngood",        color: "#FFFFFF", stroke: "#D9D9D9" },
    { content: "Rise\nup",       color: "#E53935" },
    { content: "Team\nGreen",    color: "#81C784" },
    { content: "You\ngot this",   color: "#FFFFF0", stroke: "#D9D9CC" },
    { content: "Hustle",         color: "#FFA726" },
    { content: "Let's\ngo",       color: "#F0F8FF", stroke: "#CCD3D9" },
    { content: "Happy\nbirthday", color: "#E57373" },
    { content: "Legend",         color: "#FF7043" },
    { content: "Main\ncharacter", color: "#F5F5F5", stroke: "#D0D0D0" },
    { content: "Carpe\ndiem",    color: "#7986CB" },
    { content: "Merry\nXmas",   color: "#FFB74D" },
    { content: "Vibes\nonly",     color: "#F8F8FF", stroke: "#D3D3E8" },
    { content: "Squad",          color: "#AB47BC" },
    { content: "Thank\nyou",     color: "#64B5F6" },
    { content: "Born\nready",     color: "#F8F8F8", stroke: "#D3D3D3" },
    { content: "Legends\nonly",  color: "#EF5350" },
    { content: "Viva la\nvida",  color: "#FFD54F" },
    { content: "Always\non",      color: "#FAF0E6", stroke: "#D5CCC4" },
    { content: "Iconic",         color: "#7E57C2" },
    { content: "Best\nFriend",   color: "#4DB6AC" },
    { content: "That\ngirl",      color: "#EDEDED", stroke: "#C9C9C9" },
    { content: "Dance\nwith me", color: "#EF9A9A" },
    { content: "Brave",          color: "#42A5F5" },
    { content: "Too\ncool",       color: "#FAFAF0", stroke: "#D5D5CC" },
    { content: "Free\nHugs",     color: "#BA68C8" },
    { content: "Dream\nbig",     color: "#43A047" },
    { content: "Simply\nthe best",color: "#F0F0F0", stroke: "#CCCCCC" },
    { content: "No\nregrets",    color: "#80DEEA" },
    { content: "Fearless",       color: "#5C6BC0" },
    { content: "Look\nat me",    color: "#4DD0E1" },
    { content: "Made\nwith love",color: "#EC407A" },
    { content: "Shine\non",      color: "#FFCA28" },
    { content: "Tabula\nrasa",   color: "#AED581" },
    { content: "Chill\nout",     color: "#29B6F6" },
    { content: "Good\nvibes",    color: "#80CBC4" },
    { content: "Wild\nheart",    color: "#F4511E" },
    { content: "Keep\ngoing",    color: "#FFAB91" },
    { content: "Born\nfree",     color: "#9CCC65" },
    { content: "Stay\nwild",     color: "#CE93D8" },
    { content: "Do it",          color: "#26C6DA" },
    { content: "Seize\nthe day", color: "#FF8A65" },
    { content: "Power",          color: "#E53935" },
    { content: "Own it",         color: "#66BB6A" },
    { content: "Glow\nup",       color: "#F48FB1" },
    { content: "Namaste",        color: "#8D6E63" },
    { content: "Be\nbold",       color: "#FFF176" },
    { content: "Fresh",          color: "#26A69A" },
    { content: "No\nlimits",     color: "#1E88E5" },
    { content: "Rare",           color: "#EC407A" },
    { content: "Good\nday",      color: "#D4E157" },
    { content: "Fly\nhigh",      color: "#FFA000" },
    { content: "Just\ngo",       color: "#26A69A" },
    { content: "Cool\nkid",      color: "#00ACC1" },
    { content: "Mellow",         color: "#A5D6A7" },
    { content: "Pure\njoy",      color: "#F9A825" },
    { content: "Classic",        color: "#795548" },
    { content: "Unbeatable",     color: "#5E35B1" },
  ] as { content: string; color: string; stroke?: string }[];

  const addTextItem = (content = "Team\nGreen", color = "#3F920C") => {
    const pa = currentPARef.current;
    if (!pa) return;
    const id = `text-${Date.now()}`;
    setDesignItems(prev => [...prev, {
      id, type: "text" as const, content,
      x: pa.width / 2, y: pa.height / 2,
      w: 0, fontSize: 28, color,
    }]);
    setSelectedDesignId(id);
    setTextOptionsDrawerOpen(false);
    setDesignDrawerOpen(false);
    requestAnimationFrame(() => setHandleTick(v => v + 1));
  };

  const addGraphicItem = (src: string) => {
    const pa = currentPARef.current;
    if (!pa) return;
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
        const mctx = document.createElement("canvas").getContext("2d")!;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        for (const item of designItems) {
          if (item.type === "image") {
            const img = loadedImgs.get(item.src ?? "");
            const aspect = img && img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1;
            const iH = item.w / aspect;
            minX = Math.min(minX, item.x - item.w / 2);
            minY = Math.min(minY, item.y - iH / 2);
            maxX = Math.max(maxX, item.x + item.w / 2);
            maxY = Math.max(maxY, item.y + iH / 2);
          } else {
            mctx.font = `400 ${item.fontSize}px "CarterOne", cursive`;
            const lines = item.content.split("\n");
            const lineH = item.fontSize * 0.9;
            const m0 = mctx.measureText(lines[0] || "M");
            const ascent = m0.actualBoundingBoxAscent;
            const descent = m0.actualBoundingBoxDescent;
            const totalH = (lines.length - 1) * lineH + ascent + descent;
            const halfW = Math.max(...lines.map(l => mctx.measureText(l).width)) / 2;
            minX = Math.min(minX, item.x - halfW);
            minY = Math.min(minY, item.y - totalH / 2);
            maxX = Math.max(maxX, item.x + halfW);
            maxY = Math.max(maxY, item.y + totalH / 2);
          }
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
            ctx.drawImage(img, item.x - drawW / 2, item.y - drawH / 2, drawW, drawH);
            renderNext(index + 1);
          } else if (item.type === "text") {
            ctx.save();
            ctx.font = `400 ${item.fontSize}px "CarterOne", cursive`;
            ctx.fillStyle = item.color ?? "#3F920C";
            ctx.textAlign = "center";
            ctx.textBaseline = "alphabetic";
            const lines = item.content.split("\n");
            const lineH = item.fontSize * 0.9;
            const m0 = ctx.measureText(lines[0] || "M");
            const ascent = m0.actualBoundingBoxAscent;
            const totalH = (lines.length - 1) * lineH + m0.actualBoundingBoxAscent + m0.actualBoundingBoxDescent;
            const topY = item.y - totalH / 2;
            lines.forEach((line, i) => {
              ctx.fillText(line, item.x, topY + ascent + i * lineH);
            });
            ctx.restore();
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

  useEffect(() => {
    if (!selectedDesignId) return;
    const handler = (e: TouchEvent) => {
      const el = itemElRefs.current.get(selectedDesignId);
      if (el && el.contains(e.target as Node)) return;
      if (doneBtnRef.current && doneBtnRef.current.contains(e.target as Node)) return;
      setSelectedDesignId(null);
    };
    document.addEventListener("touchstart", handler, { passive: true });
    return () => document.removeEventListener("touchstart", handler);
  }, [selectedDesignId]);

  const handleDesignMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const g = designGestureRef.current;
    if (g.type === "idle") return;
    e.preventDefault();
    const dx = (e.touches[0].clientX - g.startTx) / zoom;
    const dy = (e.touches[0].clientY - g.startTy) / zoom;
    const pa = currentPARef.current;
    if (!pa) return;
    setDesignItems(items => items.map(item => {
      if (item.id !== g.itemId) return item;
      const measured = itemSizeRefs.current.get(item.id);
      const itemW = measured?.w ?? g.startW;
      const itemH = measured?.h ?? (item.type === "image" ? item.w : item.fontSize * 1.5);
      // x,y is the CSS left/top, but items use translate(-50%,-50%) for images
      // and translateX(-50%) for text, so constrain from the visual center/edge
      const halfW = itemW / 2;
      const halfH = itemH / 2;
      if (g.type === "move") {
        return {
          ...item,
          x: Math.max(halfW, Math.min(pa.width - halfW, g.startX + dx)),
          y: Math.max(halfH, Math.min(pa.height - halfH, g.startY + dy)),
        };
      }
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
    if (g.type !== "idle") pendingSnapItemId.current = g.itemId;
    setDesignGestureActive(false);
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
    if (textOptionsDrawerOpen) {
      requestAnimationFrame(() => {
        if (textScrollRef.current) {
          textScrollRef.current.scrollTop = textScrollPos.current;
        }
      });
    }
  }, [textOptionsDrawerOpen]);

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

  return (
    <div
      style={{
        height: "100dvh",
        position: "relative",
        display: "flex",
        flexDirection: "column",
        overflowX: "hidden",
        overflowY: "clip",
        fontFamily: '"Inter Variable", sans-serif',
        background: "linear-gradient(300deg, #f2f2f2 0%, #e3e3e3 100%)",
        overscrollBehavior: "none",
        touchAction: "manipulation",
      }}
    >
      {/* Page content — blurred when design menu is open */}
      <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      {/* Orange banner */}
      <div style={{ background: "#E8502A", color: "#fff", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, height: 36, flexShrink: 0 }}>
        Winter Sale 20%
        <img src="/icons/icon-chevrons-right.svg" alt="" style={{ width: 16, height: 16, filter: "invert(1)" }} />
      </div>

      {/* Header */}
      <div style={{ background: "#fff", height: HEADER, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", flexShrink: 0, zIndex: 10 }}>
        <img src="/icons/Logo.svg" alt="Spreadshirt" style={{ height: 22, objectFit: "contain" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button type="button" style={{ background: "none", border: "none", padding: 6, cursor: "pointer", display: "flex", position: "relative" }}>
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
        <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", overflow: "clip" }}>
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
                  position: "absolute", top: 0, left: 0, width: "100%", height: `calc(100% - ${EDITOR_BOTTOM_OFFSET}px)`,
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
                opacity: phase === "out" ? 0 : (activeIsEmpty || selectedDesignId || designGestureActive) ? 1 : 0,
                transition: "opacity 180ms ease-in-out",
                transform: `translate3d(${zoom <= 1 ? 0 : pan.x}px, ${zoom <= 1 ? 0 : pan.y}px, 0) scale(${zoom})`,
                transformOrigin: `${editorSize.width / 2 - currentPA.left}px ${(editorSize.height - EDITOR_BOTTOM_OFFSET) / 2 - currentPA.top}px`,
              }} />

              {/* Design items — same transform as print area so they zoom/pan in sync and stay locked to their position */}
              <div style={{
                position: "absolute",
                left: 0, top: 0, width: "100%", height: "100%",
                pointerEvents: "none",
                transform: `translate3d(${zoom <= 1 ? 0 : pan.x}px, ${zoom <= 1 ? 0 : pan.y}px, 0) scale(${zoom})`,
                transformOrigin: `${editorSize.width / 2}px ${(editorSize.height - EDITOR_BOTTOM_OFFSET) / 2}px`,
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
                        transform: "translate(-50%, -50%)",
                        pointerEvents: "all",
                        touchAction: "none",
                        outline: isSelected ? `${1.5 / zoom}px solid #4D52D2` : `${1.5 / zoom}px solid transparent`,
                        borderRadius: 0,
                        boxSizing: "border-box",
                        overflow: "visible",
                        textAlign: "center",
                        zIndex: isSelected ? 10 : 1,
                      }}
                      onTouchStart={(e) => {
                        e.stopPropagation();
                        setSelectedDesignId(item.id);
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
                        <img src={item.src} alt="" draggable={false} style={{ display: "block", width: item.w, height: item.w, objectFit: "contain", userSelect: "none", WebkitUserSelect: "none" }} />
                      ) : (
                        <span style={{
                          display: "block",
                          fontSize: item.fontSize,
                          fontFamily: '"CarterOne", cursive',
                          fontWeight: 400,
                          color: item.color ?? "#3F920C",
                          lineHeight: 0.9,
                          whiteSpace: "pre-line",
                          userSelect: "none",
                          WebkitUserSelect: "none",
                          padding: "2px 4px",
                          textAlign: "center",
                        }}>{item.content}</span>
                      )}
                      {isSelected && (
                        <div
                          style={{
                            position: "absolute",
                            top: -(32 + 8) / zoom,
                            left: "50%",
                            transform: `translateX(-50%) scale(${1 / zoom})`,
                            transformOrigin: "center bottom",
                            width: 32, height: 32, borderRadius: 999,
                            background: "#fff",
                            boxShadow: "0 1px 6px rgba(0,0,0,0.18)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            touchAction: "none", zIndex: 2, cursor: "pointer",
                          }}
                          onTouchEnd={(e) => {
                            e.stopPropagation();
                            setDesignItems(prev => prev.filter(d => d.id !== item.id));
                            setSelectedDesignId(null);
                          }}
                        >
                          <img src="/icons/icon-trash.svg" width={16} height={16} alt="Delete" style={{ opacity: 0.6 }} />
                        </div>
                      )}
                      {isSelected && (["tl", "tr", "bl", "br"] as const).map(corner => {
                        const gtype = `resize-${corner}` as "resize-tl" | "resize-tr" | "resize-bl" | "resize-br";
                        const HANDLE = 12;
                        const HIT = 44;
                        const measured = itemSizeRefs.current.get(item.id);
                        // Images: item.w is always current in state, no measurement needed.
                        // Text: use measured DOM size.
                        const iW = item.type === "image" ? item.w : (measured?.w ?? 60);
                        const iH = item.type === "image" ? item.w : (measured?.h ?? 60);
                        // Handles are children of the item container; absolute positioning is
                        // relative to the container's top-left (0,0), not the CSS transform origin.
                        const cornerPos: React.CSSProperties = corner === "tl"
                          ? { top: 0, left: 0 }
                          : corner === "tr" ? { top: 0, left: iW }
                          : corner === "bl" ? { top: iH, left: 0 }
                          : { top: iH, left: iW };
                        return (
                          <div key={corner} style={{
                            position: "absolute",
                            width: HIT, height: HIT,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            touchAction: "none", zIndex: 3,
                            transform: `translate(-50%, -50%) scale(${1 / zoom})`,
                            transformOrigin: "center center",
                            ...cornerPos,
                          }}
                            onTouchStart={(e) => {
                              e.stopPropagation();
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
                              width: HANDLE, height: HANDLE, borderRadius: 999,
                              background: "#fff", border: "2px solid #4D52D2",
                              boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
                              flexShrink: 0, pointerEvents: "none",
                            }} />
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </>
          )}


        </div>


        {/* Editor toolbar */}
        <div style={{ position: "absolute", top: 12, left: 0, right: 0, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 12px", pointerEvents: "auto", zIndex: 10 }}>
          <div style={{ display: "flex", gap: 4 }}>
            <button type="button" style={{ background: "#F4F4F4", border: "none", borderRadius: 999, width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <img src="/icons/icon-arrow-return-back.svg" alt="Undo" style={{ width: 20, height: 20 }} />
            </button>
            <button type="button" style={{ background: "#F4F4F4", border: "none", borderRadius: 999, width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <img src="/icons/icon-arrow-forward.svg" alt="Redo" style={{ width: 20, height: 20 }} />
            </button>
          </div>
          <button type="button" style={{ background: "#F4F4F4", border: "none", borderRadius: 999, width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <img src="/icons/icon-dots-horizontal.svg" width={20} height={20} alt="More" />
          </button>
        </div>

        {/* Slide label */}
        <div style={{ position: "absolute", bottom: 112, left: 0, right: 0, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#000", letterSpacing: 0.6, textTransform: "uppercase", opacity: showSlideLabel ? 1 : 0, transform: `translateY(${showSlideLabel ? 0 : -4}px)`, transition: "opacity 220ms ease-out, transform 220ms ease-out" }}>
            {slides[index].label.replace(/\s+/g, "").toUpperCase()}
          </div>
        </div>
      </div>




      {/* Done button — visible when a design object is selected */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        padding: "12px 16px 28px",
        display: "flex", justifyContent: "center",
        opacity: selectedDesignId ? 1 : 0,
        pointerEvents: selectedDesignId ? "auto" : "none",
        transition: "opacity 0.18s ease",
        zIndex: 3,
      }}>
        <button
          ref={doneBtnRef}
          type="button"
          className="done-btn"
          onTouchEnd={(e) => { e.stopPropagation(); e.preventDefault(); setSelectedDesignId(null); }}
          style={{
            width: "50%", height: 52, borderRadius: 999,
            border: "none", background: "#fff",
            boxShadow: "0 2px 12px rgba(0,0,0,0.12)",
            display: "flex", alignItems: "center", justifyContent: "center",
            gap: 8, fontSize: 16, fontWeight: 700, color: "#111", cursor: "pointer",
            fontFamily: '"Inter Variable", sans-serif',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M4 10.5L8.5 15L16 6" stroke="#111" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Done
        </button>
      </div>

      {/* Blur overlay — behind ck-drawer and action bar, grows as drawer opens */}
      {(() => {
        const interp = Math.min(1, Math.max(0, (checkoutDrawerHeight - DRAWER_MIN) / (checkoutDrawerMaxH - DRAWER_MIN)));
        return (
          <div style={{
            position: "fixed",
            inset: 0,
            zIndex: 17,
            backdropFilter: `blur(${interp * 2}px)`,
            WebkitBackdropFilter: `blur(${interp * 2}px)`,
            background: `rgba(0,0,0,${interp * 0.15})`,
            opacity: interp,
            pointerEvents: interp > 0.05 ? "auto" : "none",
            transition: checkoutDrawerDragging ? "none" : "opacity 0.4s ease",
          }} onClick={() => { setCheckoutDrawerExpanded(false); setCheckoutDrawerHeight(DRAWER_MIN); }} />
        );
      })()}

      {/* Checkout drawer — overlays editor, sits below action bar */}
      <div
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
        {/* Drag handle */}
        <div
          onMouseDown={onCheckoutDrawerHandleMouseDown}
          onTouchStart={e => { checkoutDrawerStart(e.touches[0].clientY); }}
          onTouchMove={e => { e.preventDefault(); checkoutDrawerMove(e.touches[0].clientY); }}
          onTouchEnd={e => { checkoutDrawerEnd(e.changedTouches[0].clientY); }}
          style={{ height: 20, touchAction: "none", display: "flex", justifyContent: "center", alignItems: "center", cursor: "grab", flexShrink: 0 }}
        >
          <svg ref={checkoutDrawerHandleSvgRef} width="36" height="8" viewBox="0 0 36 4" style={{ overflow: "visible" }}>
            <path ref={checkoutDrawerHandlePathRef} d="M0,2 Q18,2 36,2" stroke="rgb(204,204,204)" strokeWidth="4" strokeLinecap="round" fill="none" />
          </svg>
        </div>

        {/* Scrollable content */}
        <div
          ref={checkoutDrawerScrollRef}
          onTouchStart={onCheckoutDrawerScrollTouchStart}
          onTouchMove={onCheckoutDrawerScrollTouchMove}
          onTouchEnd={onCheckoutDrawerScrollTouchEnd}
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
          {/* Header row with toggle button (ck-drawer = checkout-drawer) */}
          <div style={{ display: "flex", alignItems: "center", padding: "0 20px", gap: 0 }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 8, overflow: "hidden", flexShrink: 0,
              maxWidth: `${(1 - Math.min(1, Math.max(0, (checkoutDrawerHeight - DRAWER_MIN) / (checkoutDrawerMaxH - DRAWER_MIN)))) * 200}px`,
              marginRight: `${(1 - Math.min(1, Math.max(0, (checkoutDrawerHeight - DRAWER_MIN) / (checkoutDrawerMaxH - DRAWER_MIN)))) * 8}px`,
              opacity: 1 - Math.min(1, Math.max(0, (checkoutDrawerHeight - DRAWER_MIN) / (checkoutDrawerMaxH - DRAWER_MIN))),
              transition: "max-width 0.3s ease, margin-right 0.3s ease, opacity 0.3s ease",
            }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#000", flexShrink: 0, opacity: 0.7 }}>{currentPrice.toFixed(2).replace(".", ",") + " €"}</span>
              <span style={{ fontSize: 20, color: "#000", flexShrink: 0, opacity: 0.4, lineHeight: 1 }}>·</span>
            </div>
            <h2 style={{
              margin: 0,
              fontFamily: "MADEOuterSans, sans-serif",
              fontSize: 14, lineHeight: 1.4, fontWeight: 500, letterSpacing: "-0.02em", color: "#000",
              opacity: 0.4 + Math.min(1, Math.max(0, (checkoutDrawerHeight - DRAWER_MIN) / (checkoutDrawerMaxH - DRAWER_MIN))) * 0.4,
              flex: 1, overflow: "hidden",
              whiteSpace: checkoutDrawerHeight <= DRAWER_MIN + 5 ? "nowrap" : "normal",
              textOverflow: checkoutDrawerHeight <= DRAWER_MIN + 5 ? "ellipsis" : "clip",
              maxHeight: `${19.6 + Math.min(1, Math.max(0, (checkoutDrawerHeight - DRAWER_MIN) / (checkoutDrawerMaxH - DRAWER_MIN))) * 19.6}px`,
            }}>
              {selectedProduct.name}
            </h2>
            <button
              type="button"
              onClick={() => {
                const next = !checkoutDrawerExpanded;
                setCheckoutDrawerExpanded(next);
                setCheckoutDrawerHeight(next ? checkoutDrawerMaxH : DRAWER_MIN);
              }}
              style={{ width: 28, height: 28, borderRadius: 999, border: "none", background: "#E9E9E9", color: "#6A6A6A", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, flexShrink: 0, cursor: "pointer" }}
            >
              <span style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ position: "absolute", display: "flex", alignItems: "center", justifyContent: "center", transition: "opacity 0.2s, transform 0.2s", opacity: checkoutDrawerExpanded ? 0 : 1, transform: checkoutDrawerExpanded ? "scale(0.6)" : "scale(1)" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15" /></svg>
                </span>
                <span style={{ display: "flex", alignItems: "center", justifyContent: "center", transition: "opacity 0.2s, transform 0.2s", opacity: checkoutDrawerExpanded ? 1 : 0, transform: checkoutDrawerExpanded ? "scale(1)" : "scale(0.6)" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </span>
              </span>
            </button>
          </div>

          {/* Color selection */}
          {(() => {
            const interp = Math.min(1, Math.max(0, (checkoutDrawerHeight - DRAWER_MIN) / (checkoutDrawerMaxH - DRAWER_MIN)));
            return (
              <div style={{
                fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", color: "#111", textTransform: "uppercase", paddingLeft: 20,
                opacity: interp,
                maxHeight: `${interp * 32}px`,
                marginTop: `${interp * 12}px`,
                marginBottom: `${interp * 12}px`,
                overflow: "hidden",
                transition: "opacity 0.3s ease, max-height 0.3s ease, margin-top 0.3s ease, margin-bottom 0.3s ease",
              }}>
                COLOR: {selectedProduct.colors.find(c => c.key === selectedColor)?.label.toUpperCase()}
              </div>
            );
          })()}
          <div style={{ position: "relative", marginBottom: 14 }}>
            <div
              onTouchStart={onHorizontalTouchStart}
              onTouchMove={onHorizontalTouchMove}
              onTouchEnd={onHorizontalTouchEnd}
              style={{ display: "flex", gap: 0, overflowX: "auto", paddingBottom: 4, paddingLeft: 20, scrollbarWidth: "none", WebkitOverflowScrolling: "touch" as any }}
            >
              {selectedProduct.colors.map(({ key, label }, i) => {
                const borderInterp = Math.min(1, Math.max(0, (checkoutDrawerHeight - DRAWER_MIN) / (checkoutDrawerMaxH - DRAWER_MIN)));
                return (
                <button
                  key={key}
                  type="button"
                  aria-label={label}
                  onClick={() => setSelectedColor(key)}
                  style={{
                    width: 58, height: 58,
                    borderTopLeftRadius: i === 0 ? 8 : 0,
                    borderBottomLeftRadius: i === 0 ? 8 : 0,
                    borderTopRightRadius: i === selectedProduct.colors.length - 1 ? 8 : 0,
                    borderBottomRightRadius: i === selectedProduct.colors.length - 1 ? 8 : 0,
                    border: key === selectedColor ? `2px solid rgba(17,17,17,${borderInterp})` : `1px solid rgba(190,190,190,${borderInterp})`,
                    background: key === selectedColor ? "#F4F4F4" : "none",
                    padding: 8, flexShrink: 0, boxSizing: "border-box", overflow: "hidden",
                    cursor: "pointer", marginRight: -1, position: "relative",
                    zIndex: key === selectedColor ? 1 : 0,
                    transition: "border-color 0.3s ease",
                  }}
                >
                  <img src={selectedProduct.thumbnail(key)} alt={label} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 6, display: "block" }} />
                </button>
              );})}
              <div style={{ width: 12, flexShrink: 0 }} />
            </div>
            <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 48, background: "linear-gradient(to right, transparent, #F4F4F4)", pointerEvents: "none" }} />
          </div>

          {/* Available sizes + CTA buttons — fade in as ck-drawer expands */}
          {(() => {
            const interp = Math.min(1, Math.max(0, (checkoutDrawerHeight - DRAWER_MIN) / (checkoutDrawerMaxH - DRAWER_MIN)));
            const oos = selectedProduct.outOfStock[selectedColor] ?? [];
            return (
              <div style={{ opacity: interp, transition: "opacity 0.3s ease" }}>
                {/* Available sizes */}
                <div style={{ margin: "0 20px 16px", overflow: "hidden" }}>
                  <div style={{ fontSize: 14, lineHeight: 1.8 }}>
                    {selectedProduct.sizes.map((size, i) => {
                      const isOos = oos.indexOf(size) !== -1;
                      return (
                        <span key={size}>
                          {i > 0 && <span style={{ color: "#bbb", margin: "0 4px" }}> · </span>}
                          <span style={{ color: isOos ? "#bbb" : "#111", textDecoration: isOos ? "line-through" : "none" }}>{size}</span>
                        </span>
                      );
                    })}
                  </div>
                </div>

                {/* Buttons */}
                <div style={{ padding: "0 20px" }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: "#111", marginBottom: 10 }}>
                    {currentPrice.toFixed(2).replace(".", ",") + " €"}
                  </div>
                  <button
                    type="button"
                    onClick={() => setSizeDrawerOpen(true)}
                    style={{ width: "100%", height: 54, borderRadius: 12, border: "none", background: "#000", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", gap: 12, fontSize: 14, fontWeight: 600, cursor: "pointer" }}
                  >
                    <img src="/icons/icon-cart.svg" alt="" style={{ width: 20, height: 20, filter: "invert(1)" }} />
                    <span>Select size</span>
                  </button>
                </div>

                {/* Shipping info */}
                <div style={{ border: `1px solid rgba(190,190,190,${interp})`, borderRadius: 12, overflow: "hidden", margin: "16px 20px 0", transition: "border-color 0.3s ease" }}>
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
                  <div style={{ height: 1, background: `rgba(190,190,190,${interp})`, margin: "0 16px", transition: "background 0.3s ease" }} />
                  <div style={{ padding: "16px", display: "flex", alignItems: "center", gap: 12 }}>
                    <img src="/icons/icon-refresh.svg" alt="" style={{ width: 24, height: 24, flexShrink: 0 }} />
                    <span style={{ fontSize: 14, color: "#111", textDecoration: "underline", cursor: "pointer" }}>30-day return guarantee</span>
                  </div>
                </div>

                {/* Accordion — product details, size & fit, reviews */}
                <div style={{ border: `1px solid rgba(190,190,190,${interp})`, borderRadius: 12, overflow: "hidden", margin: "16px 20px 8px" }}>
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
                    <div key={key} style={{ borderTop: i === 0 ? "none" : `1px solid rgba(190,190,190,${interp})` }}>
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
              </div>
            );
          })()}
        </div>
        {/* Bottom fade — visible only when collapsed */}
        <div style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 10,
          background: "linear-gradient(to bottom, rgba(0,0,0,0), rgba(0,0,0,0.1))",
          pointerEvents: "none",
          opacity: checkoutDrawerExpanded ? 0 : 1,
          transition: "opacity 0.4s ease",
          zIndex: 1,
        }} />
      </div>

      {/* Bottom action bar */}
      <div id="action-bar" style={{ position: "fixed", bottom: checkoutDrawerHeight, left: 0, right: 0, paddingTop: 12, paddingBottom: 12, overflow: "visible", zIndex: 20, opacity: selectedDesignId ? 0 : 1, pointerEvents: selectedDesignId ? "none" : "auto", transition: checkoutDrawerDragging ? "opacity 0.18s ease" : "bottom 0.7s cubic-bezier(0.16,1,0.3,1), opacity 0.18s ease" }}>

        {/* Customize button — shown only when ck-drawer is at MAX */}
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", opacity: checkoutDrawerExpanded ? 1 : 0, transform: checkoutDrawerExpanded ? "translateY(0)" : "translateY(10px)", pointerEvents: checkoutDrawerExpanded ? "auto" : "none", transition: "opacity 0.35s ease, transform 0.45s cubic-bezier(0.16,1,0.3,1)" }}>
          <button
            type="button"
            onClick={() => { setCheckoutDrawerExpanded(false); setCheckoutDrawerHeight(DRAWER_MIN); }}
            style={{ height: 46, padding: "0 24px", borderRadius: 999, border: "none", background: "#F4F4F4", color: "#111", fontSize: 14, fontWeight: 600, cursor: "pointer", boxShadow: "0 1px 5px rgba(0,0,0,0.06)" }}
          >
            Continue customizing
          </button>
        </div>

        {/* Scrollable gray buttons — offset by black button width */}
        <div
          id="action-bar-scroll"
          ref={barScrollRef}
          onScroll={handleBarScroll}
          onTouchStart={onHorizontalTouchStart}
          onTouchMove={onHorizontalTouchMove}
          onTouchEnd={onHorizontalTouchEnd}
          style={{
            display: "flex",
            gap: 8,
            overflowX: animating ? "visible" : "auto",
            overflowY: "visible",
            paddingLeft: 16,
            paddingTop: 8,
            paddingBottom: 8,
            marginTop: -8,
            marginBottom: -8,
            alignItems: "center",
            scrollbarWidth: "none",
            WebkitOverflowScrolling: "touch",
            touchAction: "pan-x",
            maskImage: scrollAtEnd ? "none" : "linear-gradient(to right, black calc(100% - 76px), transparent 100%)",
            WebkitMaskImage: scrollAtEnd ? "none" : "linear-gradient(to right, black calc(100% - 76px), transparent 100%)",
            opacity: checkoutDrawerExpanded ? 0 : 1,
            pointerEvents: checkoutDrawerExpanded ? "none" : "auto",
            transition: "opacity 0.25s ease",
          }}
        >
          <button type="button" className="action-bar-btn" onClick={() => setSlidePopoverOpen(v => !v)} style={{ height: 46, padding: "0 14px", borderRadius: 999, border: "none", background: "#F4F4F4", color: "#000", display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 600, flexShrink: 0, boxShadow: "0 1px 5px rgba(0,0,0,0.02)", transform: revealed ? "translateY(0)" : "translateY(80px)", transition: revealed ? "transform 0.5s cubic-bezier(0.34,1.56,0.64,1) 0ms" : "none" }}>
            <span>{slides[activeIndex]?.label ?? "Front"}</span>
            <img src="/icons/icon-chevron-down.svg" width={16} height={16} alt="" />
          </button>
          <button type="button" className="action-bar-btn" onClick={async () => { const { dataUrl, bbox } = await flattenDesignItems(); setEmbroideryDataUrl(dataUrl || null); setDesignBbox(bbox); setEmbroideryRenderedUrl(null); setPreviewLoading(true); setPreviewDrawerOpen(true); setTimeout(() => setPreviewLoading(false), 1500); }} style={{ height: 46, padding: "0 14px", borderRadius: 999, border: "none", background: "#F4F4F4", color: "#000", display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 600, flexShrink: 0, boxShadow: "0 1px 5px rgba(0,0,0,0.02)", transform: revealed ? "translateY(0)" : "translateY(80px)", transition: revealed ? "transform 0.5s cubic-bezier(0.34,1.56,0.64,1) 0ms" : "none" }}>
            <img src={savedPrintTechnique === "embroidery" ? "/icons/icon-needle-embroidery.svg" : "/icons/icon-droplet.svg"} width={20} height={20} alt="" style={{ display: "block", filter: "brightness(0) invert(1) brightness(0.416)" }} />
            <span>Print</span>
            <img src="/icons/icon-chevron-down.svg" width={16} height={16} alt="" />
          </button>
          <button type="button" onClick={() => setAllProductsDrawerOpen(true)} className="action-bar-btn" style={{ height: 46, padding: "0 16px 0px 4px", borderRadius: 999, border: "none", background: "#F4F4F4", color: "#000", display: "flex", alignItems: "center", gap: 10, fontSize: 14, fontWeight: 600, flexShrink: 0, boxShadow: "0 1px 5px rgba(0,0,0,0.02)", transform: revealed ? "translateY(0)" : "translateY(80px)", transition: revealed ? "transform 0.5s cubic-bezier(0.34,1.56,0.64,1) 0ms" : "none" }}>
            <img src="/icons/products.png" width={"auto"} height={40} style={{ marginTop: -2 }} alt="" />
            <span>Change product</span>
          </button>
          <div style={{ width: 16, flexShrink: 0 }} />
        </div>

        {/* Add design button — absolutely positioned, floats above bar when scrolled */}
        <button
          ref={addDesignBtnRef}
          type="button"
          className="action-bar-btn"
          onClick={() => setDesignDrawerOpen(true)}
          style={{
            position: "absolute",
            left: 16,
            top: barScrollProgress > 0 ? -62 : 12,
            height: barScrollProgress > 0 ? 54 : 46,
            padding: barScrollProgress > 0 ? "0" : "0 18px",
            borderRadius: 999,
            border: "none",
            background: "linear-gradient(90deg, #DC2626 -0.88%, #4D52D2 49.94%, #16A34A 101.36%)",
            color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
            gap: 8,
            fontSize: 14, fontWeight: 600, flexShrink: 0,
            boxShadow: barScrollProgress > 0 ? "0 4px 16px rgba(0,0,0,0.35)" : "0 4px 14px rgba(0,0,0,0.2)",
            overflow: "hidden",
            boxSizing: "border-box",
            whiteSpace: "nowrap",
            zIndex: 2,
            opacity: checkoutDrawerExpanded ? 0 : 1,
            pointerEvents: checkoutDrawerExpanded ? "none" : "auto",
            transition: "top 0.5s cubic-bezier(0.34,1.56,0.64,1), height 0.4s ease, box-shadow 0.4s ease, opacity 0.25s ease",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}><path d="M12 5V19M5 12H19" stroke="white" strokeWidth="2.5" strokeLinecap="round"/></svg>
          <span style={{ opacity: barScrollProgress > 0 ? 0 : 1, transition: "opacity 0.15s ease", ...(barScrollProgress > 0 ? { position: "absolute" as const, left: 38 } : {}) }}>Add design</span>
        </button>

      </div>

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
                <div key={label} onClick={() => { if (label === "Graphics") { dismissPopup(); setGraphicsDrawerOpen(true); } if (label === "Text") { dismissPopup(); setTextOptionsDrawerOpen(true); } }} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, cursor: "pointer" }}>
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
          <Drawer.Content onContextMenu={e => e.preventDefault()} style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 9999, background: "#fff", borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingTop: 20, paddingBottom: 40, outline: "none", fontFamily: '"Inter Variable", sans-serif' }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, paddingLeft: 16, paddingRight: 16 }}>
              <span className="font-outer-sans" style={{ fontSize: 16, fontWeight: 500, color: "#111" }}>Print technique</span>
              <img src="/icons/icon-close-x.svg" alt="Close" style={{ width: 24, height: 24, cursor: "pointer" }} onClick={() => setPreviewDrawerOpen(false)} />
            </div>
            <div style={{ display: "flex", paddingLeft: 16, paddingRight: 16, marginBottom: 16 }}>
              <div style={{ display: "flex", borderRadius: 999, background: "#f0f0f0", padding: 4, gap: 4, width: "100%" }}>
                <button type="button" onClick={() => { setPrintTechnique("standard"); setSavedPrintTechnique("standard"); }} style={{ flex: 1, height: 40, padding: "0 16px", borderRadius: 999, border: "none", background: printTechnique === "standard" ? "#fff" : "transparent", color: "#111", fontSize: 14, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  <img src="/icons/icon-droplet.svg" width={20} height={20} alt="" style={{ display: "block", filter: "brightness(0) invert(1) brightness(0.416)" }} />
                  Standard print
                </button>
                <button type="button" onClick={() => { setPrintTechnique("embroidery"); setSavedPrintTechnique("embroidery"); }} style={{ flex: 1, height: 40, padding: "0 16px", borderRadius: 999, border: "none", background: printTechnique === "embroidery" ? "#fff" : "transparent", color: "#111", fontSize: 14, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  <img src="/icons/icon-needle-embroidery.svg" width={20} height={20} alt="" style={{ display: "block", filter: "brightness(0) invert(1) brightness(0.416)" }} />
                  Embroidery
                </button>
              </div>
            </div>
            <div style={{ display: "flex", gap: 12, marginBottom: 20, overflowX: previewLoading ? "hidden" : "auto", paddingLeft: 16, paddingRight: 16, scrollbarWidth: "none" }}>
              {previewLoading ? (
                <>
                  {[0, 1, 2].map(i => (
                    <div key={i} style={{ flexShrink: 0, width: 310, height: 245, borderRadius: 12, background: "linear-gradient(90deg, #ebebeb 25%, #d6d6d6 50%, #ebebeb 75%)", backgroundSize: "200% 100%", animation: "skeletonShimmer 1.4s ease infinite" }} />
                  ))}
                </>
              ) : (
                <>
                  {/* 1 — embroidery preview: zoomed garment as background, canvas centered on top */}
                  {(() => {
                    const paKey = slides[activeIndex]?.label ?? "Front";
                    const pa = selectedProduct.printAreas[paKey];
                    const paCx = pa ? pa.x + pa.w / 2 : 0.5;
                    const paCy = pa ? pa.y + pa.h / 2 : 0.5;
                    return (
                      <div style={{ position: "relative", overflow: "hidden", flexShrink: 0, width: 310, height: 245, borderRadius: 12, background: "#e8e8e8" }}>
                        <img
                          src={selectedProduct.thumbnail(selectedColor)}
                          alt=""
                          style={{
                            position: "absolute", width: "100%", height: "100%",
                            objectFit: "contain",
                            transform: `scale(6)`,
                            transformOrigin: `${paCx * 100}% ${paCy * 100}%`,
                            WebkitTouchCallout: "none",
                          } as React.CSSProperties}
                        />
                        {/* Hidden embroidery processor — only runs for embroidery mode */}
                        {printTechnique === "embroidery" && embroideryDataUrl && (
                          <EmbroideryPreview
                            src={embroideryDataUrl}
                            maxSize={500}
                            style={{ position: "absolute", opacity: 0, pointerEvents: "none", width: 1, height: 1 }}
                            onRendered={setEmbroideryRenderedUrl}
                          />
                        )}
                        {(() => {
                          const previewUrl = printTechnique === "embroidery" ? embroideryRenderedUrl : embroideryDataUrl;
                          return previewUrl ? (
                            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <img src={previewUrl} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block" }} />
                            </div>
                          ) : embroideryDataUrl && printTechnique === "embroidery" ? (
                            <span style={{ fontSize: 14, color: "#000", position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)" }}>Processing…</span>
                          ) : null;
                        })()}
                      </div>
                    );
                  })()}
                  {/* 2 — model front */}
                  {/* <div onClick={() => { setModelPopupOpen(true); popupZoomRef.current = 1; popupPanRef.current = { x: 0, y: 0 }; setPopupZoom(1); setPopupPan({ x: 0, y: 0 }); }} style={{ ... popup trigger ... }} /> */}
                  <div style={{ position: "relative", overflow: "hidden", flexShrink: 0, width: 310, height: 245, borderRadius: 12, background: "#f4f4f4" }}>
                    <img src={selectedProductId === "oversized-unisex-tshirt" ? `/img/product-images/oversized-unisex-tshirt/model-images/${selectedColor}-model-front.webp` : selectedProduct.thumbnail(selectedColor)} alt="Model Front" style={{ width: "100%", height: "100%", objectFit: "cover", WebkitTouchCallout: "none" } as React.CSSProperties} />
                    {(() => {
                      const previewUrl = printTechnique === "embroidery" ? embroideryRenderedUrl : embroideryDataUrl;
                      if (!previewUrl) return null;
                      const cardW = 310, cardH = 245;
                      const pa = selectedProduct.printAreas["Front"];
                      const paLeft = pa.x * cardW;
                      const paTop = pa.y * cardH;
                      const paW = pa.w * cardW;
                      const paH = pa.h * cardH;
                      const left   = designBbox ? paLeft + designBbox.left  * paW : paLeft;
                      const top    = designBbox ? paTop  + designBbox.top   * paH : paTop;
                      const width  = designBbox ? designBbox.width  * paW : paW;
                      const height = designBbox ? designBbox.height * paH : paH;
                      return (
                        <div style={{ position: "absolute", left, top, width, height, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <img src={previewUrl} style={{ maxWidth: "100%", maxHeight: "100%", display: "block", objectFit: "contain", WebkitTouchCallout: "none" } as React.CSSProperties} />
                        </div>
                      );
                    })()}
                  </div>
                </>
              )}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

      </div>{/* end blur wrapper */}


      {/* Text options drawer */}
      <Drawer.Root open={textOptionsDrawerOpen} onOpenChange={setTextOptionsDrawerOpen}>
        <Drawer.Portal>
          <Drawer.Overlay style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 9998 }} />
          <Drawer.Content style={{
            position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 9999,
            background: "#fff", borderTopLeftRadius: 16, borderTopRightRadius: 16,
            outline: "none", fontFamily: '"Inter Variable", sans-serif',
            display: "flex", flexDirection: "column", maxHeight: "80dvh",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 16px 16px", borderBottom: "1px solid #f0f0f0", flexShrink: 0 }}>
              <span className="font-outer-sans" style={{ fontSize: 16, fontWeight: 500, color: "#111" }}>Choose text</span>
              <img src="/icons/icon-close-x.svg" alt="Close" style={{ width: 24, height: 24, cursor: "pointer" }} onClick={() => setTextOptionsDrawerOpen(false)} />
            </div>
            <div ref={textScrollRef} onScroll={e => { textScrollPos.current = (e.currentTarget as HTMLDivElement).scrollTop; }} style={{ overflowY: "auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
              {TEXT_OPTIONS.map(({ content, color, stroke }) => (
                <button
                  key={content}
                  type="button"
                  onClick={() => addTextItem(content, color)}
                  style={{
                    height: 90, borderRadius: 0, border: "none", borderRight: "1px solid #e8e8e8", borderBottom: "1px solid #e8e8e8",
                    background: "#fff", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    padding: "8px 12px",
                  }}
                >
                  <span style={{
                    fontFamily: '"CarterOne", cursive',
                    fontSize: 22,
                    color,
                    lineHeight: 0.9,
                    whiteSpace: "pre-line",
                    textAlign: "center",
                    userSelect: "none",
                    ...(stroke ? { WebkitTextStroke: `1px ${stroke}` } : {}),
                  }}>{content}</span>
                </button>
              ))}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

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
                  if (label === "Text") { setDesignDrawerOpen(false); setTextOptionsDrawerOpen(true); }
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
        onAddToCart={() => {
          setCartCount(c => c + 1);
          setCheckoutDrawerExpanded(false);
          setCheckoutDrawerHeight(DRAWER_MIN);
          setTimeout(() => {
            setToastVisible(true);
            setTimeout(() => setToastVisible(false), 2500);
          }, 400);
        }}
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
            <div style={{ paddingBottom: 32 }}>
              {slides.map((slide: { label: string; src: string }, i: number) => (
                <div key={slide.label}>
                  <button
                    type="button"
                    onClick={() => { goToSlide(i); setSlidePopoverOpen(false); }}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "0 20px", height: 52, border: "none", background: "none", fontSize: 15, fontWeight: i === index ? 600 : 400, color: "#111", cursor: "pointer" }}
                  >
                    <span>{slide.label}</span>
                    {i === index && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#111", flexShrink: 0 }} />}
                  </button>
                  {i < slides.length - 1 && <div style={{ height: 1, background: "#f0f0f0", margin: "0 20px" }} />}
                </div>
              ))}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

      <Drawer.Root open={allProductsDrawerOpen} onOpenChange={setAllProductsDrawerOpen}>
        <Drawer.Portal>
          <Drawer.Overlay style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 9998 }} />
          <Drawer.Content style={{
            position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 9999,
            background: "#fff", borderTopLeftRadius: 16, borderTopRightRadius: 16,
            outline: "none", fontFamily: '"Inter Variable", sans-serif',
            display: "flex", flexDirection: "column", height: "calc(100dvh - 32px)",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 16px 16px" }}>
              <span className="font-outer-sans" style={{ fontSize: 16, fontWeight: 500, color: "#111" }}>All products</span>
              <img src="/icons/icon-close-x.svg" alt="Close" style={{ width: 24, height: 24, cursor: "pointer" }} onClick={() => setAllProductsDrawerOpen(false)} />
            </div>
            <div style={{ overflowY: "auto", flex: 1, padding: "0 16px 24px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {[
                  { productId: "oversized-unisex-tshirt", name: "Stanley/Stella Oversized Unisex Organic T-shirt Blaster 2.0", thumbnail: PRODUCT_CONFIGS["oversized-unisex-tshirt"].thumbnail(PRODUCT_CONFIGS["oversized-unisex-tshirt"].defaultColor) },
                  { productId: "unisex-hoodie",           name: "Unisex Hoodie",                thumbnail: PRODUCT_CONFIGS["unisex-hoodie"].thumbnail(PRODUCT_CONFIGS["unisex-hoodie"].defaultColor) },
                  { productId: null, name: "Organic Tote Bag",           thumbnail: `/img/product-images/organic-tote-bag/organic-tote-bag-beige.webp` },
                  { productId: null, name: "Relaxed Vintage Cap",        thumbnail: `/img/product-images/relaxed-vintage-cap/relaxed-vintage cap-green.webp` },
                  { productId: null, name: "Stripped Tennis Socks",      thumbnail: `/img/product-images/stripped-tennis-socks/stripped-tennis-socks-whitemint.webp` },
                  { productId: null, name: "Women Boxy Organic T-shirt", thumbnail: `/img/product-images/women-boxy-organic-tshirt/women-boxy-organic-tshirt-yellow.webp` },
                  { productId: null, name: "Women Cropped Tank",         thumbnail: `/img/product-images/women-cropped-tank/women-cropped-tank-black.webp` },
                ].map(({ productId, name, thumbnail }) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => {
                      if (!productId) return;
                      const cfg = PRODUCT_CONFIGS[productId];
                      setSelectedProductId(productId);
                      setSelectedColor(cfg.defaultColor);
                      setIndex(0);
                      setActiveIndex(0);
                      setAllProductsDrawerOpen(false);
                    }}
                    style={{ background: selectedProductId === productId ? "#f0f0f0" : "#f7f7f7", border: selectedProductId === productId ? "2px solid #111" : "1px solid #e8e8e8", borderRadius: 12, overflow: "hidden", cursor: productId ? "pointer" : "default", textAlign: "left", padding: 0 }}
                  >
                    <img src={thumbnail} alt={name} style={{ width: "100%", aspectRatio: "1/1", objectFit: "cover", display: "block" }} />
                    <div style={{ padding: "8px 10px 10px", fontSize: 12, fontWeight: 500, color: "#111", lineHeight: 1.4 }}>{name}</div>
                  </button>
                ))}
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
        const modelSrc = selectedProductId === "oversized-unisex-tshirt"
          ? `/img/product-images/oversized-unisex-tshirt/model-images/${selectedColor}-model-front.webp`
          : selectedProduct.thumbnail(selectedColor);
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
