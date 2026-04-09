import React, { useEffect, useRef, useState } from "react";
import { Drawer } from "vaul";

const BAR_BTN_INITIAL = 130;

const DEFAULT_COLOR = "softEcru";

const HEADER = 56;
const EDITOR_MIN = 170;
const THRESHOLD = 10;

const COLORS = [
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
];

const colorHasCloseup = (key: string) => key !== "mocha";

const getSlidesForColor = (key: string) => [
  { label: "Front", src: `/img/product-images/${key}-front.png` },
  { label: "Back", src: `/img/product-images/${key}-back.png` },
  { label: "Left Arm", src: `/img/product-images/${key}-leftarm.png` },
  { label: "Right Arm", src: `/img/product-images/${key}-rightarm.png` },
  ...(colorHasCloseup(key) ? [{ label: "Close Up", src: `/img/product-images/${key}-closeup.png` }] : []),
];

const FRONT_PRINT_AREA     = { x: 0.27,  y: 0.22, w: 0.44, h: 0.5 };
const BACK_PRINT_AREA      = { x: 0.275, y: 0.22, w: 0.44, h: 0.5 };
const LEFT_ARM_PRINT_AREA  = { x: 0.43,  y: 0.34, w: 0.20, h: 0.4 };
const RIGHT_ARM_PRINT_AREA = { x: 0.37,  y: 0.34, w: 0.20, h: 0.4 };

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

  const [selectedColor] = useState(DEFAULT_COLOR);
  const slides = getSlidesForColor(selectedColor);
  const [index, setIndex] = useState(0);
  const [showSlideLabel, setShowSlideLabel] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [targetIndex, setTargetIndex] = useState<number | null>(null);
  const [slideDirection, setSlideDirection] = useState<"left" | "right">("right");
  const [phase, setPhase] = useState<"idle" | "out" | "in">("idle");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const horizontalGesture = useRef({ startX: 0, startY: 0, locked: false });
  const barScrollRef = useRef<HTMLDivElement>(null);
  const [barScrollProgress, setBarScrollProgress] = useState(0);
  const [scrollAtEnd, setScrollAtEnd] = useState(false);
  const [colorDrawerOpen, setColorDrawerOpen] = useState(false);

  const [showPopup, setShowPopup] = useState(true);
  const [animating, setAnimating] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const dismissPopup = () => {
    setShowPopup(false);
    setAnimating(true);
    setTimeout(() => setAnimating(false), 750);
    requestAnimationFrame(() => requestAnimationFrame(() => setRevealed(true)));
  };

  const blackBtnRef = useRef<HTMLButtonElement>(null);
  const blackBtnExpandedWidth = useRef<number | null>(null);
  const blackBtnAnimRef = useRef<number | null>(null);
  const blackBtnCurrentWidth = useRef<number | null>(null);
  const isCompactRef = useRef(false);
  const isAnimatingRef = useRef(false);

  const COMPACT_WIDTH = 46;
  const ANIM_DURATION = 500;

  // Elastic out spring — overshoots then settles (for button width only)
  const spring = (t: number) => {
    if (t === 0) return 0;
    if (t === 1) return 1;
    const p = 0.35;
    return Math.pow(2, -10 * t) * Math.sin((t - p / 4) * (2 * Math.PI) / p) + 1;
  };

  // Smooth ease-out (for padding, no overshoot)
  const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

  const animateBtnWidth = (fromWidth: number, toWidth: number, useSpring = true) => {
    const btn = blackBtnRef.current;
    const scroll = barScrollRef.current;
    if (!btn || !scroll) return;
    if (blackBtnAnimRef.current !== null) cancelAnimationFrame(blackBtnAnimRef.current);
    isAnimatingRef.current = true;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / ANIM_DURATION, 1);
      const w = fromWidth + (toWidth - fromWidth) * (useSpring ? spring(t) : easeOut(t));
      const paddingW = fromWidth + (toWidth - fromWidth) * easeOut(t);
      btn.style.width = `${w}px`;
      blackBtnCurrentWidth.current = w;
      scroll.style.paddingLeft = `${16 + paddingW + 8}px`;
      if (t < 1) {
        blackBtnAnimRef.current = requestAnimationFrame(tick);
      } else {
        blackBtnAnimRef.current = null;
        isAnimatingRef.current = false;
      }
    };
    blackBtnAnimRef.current = requestAnimationFrame(tick);
  };

  const handleBarScroll = () => {
    const el = barScrollRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const progress = max > 0 ? el.scrollLeft / max : 0;
    setBarScrollProgress(progress);
    setScrollAtEnd(max <= 0 || el.scrollLeft >= max - 4);

    if (isAnimatingRef.current) return;

    const btn = blackBtnRef.current;
    if (!btn) return;

    const shouldBeCompact = progress > 0;
    if (shouldBeCompact === isCompactRef.current) return;
    isCompactRef.current = shouldBeCompact;

    if (shouldBeCompact) {
      blackBtnExpandedWidth.current = btn.offsetWidth;
      animateBtnWidth(btn.offsetWidth, COMPACT_WIDTH);
    } else {
      const expandedWidth = blackBtnExpandedWidth.current ?? btn.offsetWidth;
      animateBtnWidth(blackBtnCurrentWidth.current ?? COMPACT_WIDTH, expandedWidth, false);
    }
  };

  useEffect(() => {
    const btn = blackBtnRef.current;
    const scroll = barScrollRef.current;
    if (!btn || !scroll) return;
    const w = btn.offsetWidth;
    blackBtnExpandedWidth.current = w;
    blackBtnCurrentWidth.current = w;
    scroll.style.paddingLeft = `${16 + w + 8}px`;
  }, []);

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
    setSlideDirection(clampedIndex > activeIndex ? "right" : "left");
    setTargetIndex(clampedIndex);
    setIndex(clampedIndex);
    setShowSlideLabel(true);
    window.setTimeout(() => setShowSlideLabel(false), 900);
    setPhase("out");
  };

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
      {/* Orange banner */}
      <div style={{ background: "#E8502A", color: "#fff", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, height: 36, flexShrink: 0 }}>
        Winter Sale 20%
        <img src="/icons/icon-chevrons-right.svg" alt="" style={{ width: 16, height: 16, filter: "invert(1)" }} />
      </div>

      {/* Header */}
      <div style={{ background: "#fff", height: HEADER, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", flexShrink: 0, zIndex: 10 }}>
        <img src="/icons/Logo.svg" alt="Spreadshirt" style={{ height: 22, objectFit: "contain" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button type="button" style={{ background: "none", border: "none", padding: 6, cursor: "pointer", display: "flex" }}>
            <img src="/icons/icon-cart.svg" alt="Cart" style={{ width: 24, height: 24 }} />
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
          {slides.map((slide, slideIdx) => {
            const isActive = slideIdx === activeIndex;
            const isTarget = targetIndex !== null && slideIdx === targetIndex;
            if (!isActive && !isTarget) return null;

            let opacity = 0;
            let transform = "translate3d(0,0,0)";
            const zIndex = isTarget ? 1 : 0;
            let visibility: "visible" | "hidden" = "visible";

            if (isActive) {
              if (phase === "out") { opacity = 0; transform = `translate3d(${slideDirection === "right" ? 24 : -24}px,0,0)`; }
              else { opacity = 1; }
            }
            if (isTarget) {
              if (phase === "out") { opacity = 0; visibility = "hidden"; transform = `translate3d(${slideDirection === "right" ? 24 : -24}px,0,0)`; }
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
                  position: "absolute", inset: 0, width: "100%", height: "100%",
                  objectFit: "contain", transformOrigin: "center center",
                  opacity, visibility,
                  transform: `${transform} translate3d(${zoom <= 1 ? 0 : pan.x}px, ${zoom <= 1 ? 0 : pan.y}px, 0) scale(${zoom})`,
                  zIndex,
                  transition: "opacity 180ms ease-in-out",
                  backfaceVisibility: "hidden",
                  WebkitBackfaceVisibility: "hidden",
                  willChange: "opacity, transform",
                  pointerEvents: "none",
                }}
              />
            );
          })}

          {/* Print area overlay */}
          {editorSize.width > 0 && (() => {
            const label = slides[activeIndex].label;
            const area = label === "Front" ? FRONT_PRINT_AREA : label === "Back" ? BACK_PRINT_AREA : label === "Left Arm" ? LEFT_ARM_PRINT_AREA : label === "Right Arm" ? RIGHT_ARM_PRINT_AREA : null;
            if (!area) return null;
            const rect = getContainRect(editorSize.width, editorSize.height, imageNaturalSize.width, imageNaturalSize.height);
            return (
              <div
                style={{
                  position: "absolute",
                  left: rect.left + rect.width * area.x,
                  top: rect.top + rect.height * area.y,
                  width: rect.width * area.w,
                  height: rect.height * area.h,
                  border: "1.5px dashed rgba(0,0,0,0.35)",
                  borderRadius: 4,
                  pointerEvents: "none",
                  zIndex: 5,
                  opacity: phase === "out" ? 0 : 1,
                  transition: "opacity 100ms ease-in-out",
                  transform: `translate3d(${zoom <= 1 ? 0 : pan.x}px, ${zoom <= 1 ? 0 : pan.y}px, 0) scale(${zoom})`,
                  transformOrigin: `${editorSize.width / 2 - (rect.left + rect.width * area.x)}px ${editorSize.height / 2 - (rect.top + rect.height * area.y)}px`,
                }}
              />
            );
          })()}
        </div>

        {/* Product view indicators */}
        <div style={{ position: "absolute", bottom: 16, left: 0, right: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 16, pointerEvents: "auto", zIndex: 10 }}>
          <button type="button" aria-label="Previous slide" onClick={() => goToSlide(index - 1)} style={{ background: "none", border: "none", fontSize: 28, cursor: "pointer", color: "#000", WebkitTextFillColor: "#000", WebkitAppearance: "none", appearance: "none", padding: 0, lineHeight: 1 }}>‹</button>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {slides.map((_, i) => (
              <button key={i} type="button" aria-label={slides[i].label} onClick={() => goToSlide(i)} style={{ width: 6, height: 6, borderRadius: "50%", background: i === index ? "#fff" : "#000", border: i === index ? "2px solid #000" : "none", cursor: "pointer", padding: 0, flexShrink: 0 }} />
            ))}
          </div>
          <button type="button" aria-label="Next slide" onClick={() => goToSlide(index + 1)} style={{ background: "none", border: "none", fontSize: 28, cursor: "pointer", color: "#000", WebkitTextFillColor: "#000", WebkitAppearance: "none", appearance: "none", padding: 0, lineHeight: 1 }}>›</button>
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
            <img src="/icons/icon-dots-horizontal.svg" alt="More" style={{ width: 20, height: 20 }} />
          </button>
        </div>

        {/* Slide label */}
        <div style={{ position: "absolute", bottom: 42, left: 0, right: 0, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#000", letterSpacing: 0.6, textTransform: "uppercase", opacity: showSlideLabel ? 1 : 0, transform: `translateY(${showSlideLabel ? 0 : -4}px)`, transition: "opacity 220ms ease-out, transform 220ms ease-out" }}>
            {slides[index].label.replace(/\s+/g, "").toUpperCase()}
          </div>
        </div>
      </div>

      {/* Bottom gradient backdrop */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 200, background: "linear-gradient(to top, rgba(0,0,0,0.07) 0%, rgba(242,242,242,0.07) 100%)", zIndex: 1, pointerEvents: "none" }} />

      {/* Bottom action bar */}
      <div id="action-bar" style={{ position: "relative", paddingTop: 12, paddingBottom: 20, flexShrink: 0, overflow: "visible", zIndex: 2 }}>
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
            paddingLeft: 16 + BAR_BTN_INITIAL + 8, /* kept as initial value; updated dynamically via animateBtnWidth */
            paddingTop: 8,
            paddingBottom: 8,
            marginTop: -8,
            marginBottom: -8,
            alignItems: "center",
            scrollbarWidth: "none",
            WebkitOverflowScrolling: "touch",
            touchAction: "pan-x",
          }}
        >
          <button type="button" className="action-bar-btn" onClick={() => setColorDrawerOpen(true)} style={{ height: 46, padding: "2px 16px 2px 8px", borderRadius: 999, border: "none", background: "#F4F4F4", color: "#000", display: "flex", alignItems: "center", gap: 4, fontSize: 14, fontWeight: 600, flexShrink: 0, boxShadow: "0 1px 5px rgba(0,0,0,0.02)", transform: revealed ? "translateY(0)" : "translateY(80px)", transition: revealed ? "transform 0.5s cubic-bezier(0.34,1.56,0.64,1) 0ms" : "none" }}>
            <img src={`/img/product-images/${selectedColor}-front.png`} width={28} height={28} alt="" style={{ borderRadius: 999, display: "block", objectFit: "cover" }} />
            <span>Color</span>
            <img src="/icons/icon-chevron-down.svg" width={16} height={16} alt="" />
          </button>
          <button type="button" className="action-bar-btn" style={{ height: 46, padding: "2px 16px 2px 4px", borderRadius: 999, border: "none", background: "#F4F4F4", color: "#000", display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 600, flexShrink: 0, boxShadow: "0 1px 5px rgba(0,0,0,0.02)", transform: revealed ? "translateY(0)" : "translateY(80px)", transition: revealed ? "transform 0.5s cubic-bezier(0.34,1.56,0.64,1) 60ms" : "none" }}>
            <img src="/img/preview.png" width={38} height={38} alt="" style={{ borderRadius: 999, display: "block" }} />
            <span>Preview</span>
          </button>
          <button type="button" className="action-bar-btn" style={{ height: 46, padding: "2px 16px 2px 4px", borderRadius: 999, border: "none", background: "#F4F4F4", color: "#000", display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 600, flexShrink: 0, boxShadow: "0 1px 5px rgba(0,0,0,0.02)", transform: revealed ? "translateY(0)" : "translateY(80px)", transition: revealed ? "transform 0.5s cubic-bezier(0.34,1.56,0.64,1) 120ms" : "none" }}>
            <img src="/icons/embroidery.png" width={38} height={38} alt="" style={{ borderRadius: 999, display: "block" }} />
            <span>Embroidery</span>
            <img src="/icons/icon-chevron-down.svg" width={16} height={16} alt="" />
          </button>
          <button type="button" className="action-bar-btn" style={{ height: 46, padding: "0 16px 0px 4px", borderRadius: 999, border: "none", background: "#F4F4F4", color: "#000", display: "flex", alignItems: "center", gap: 10, fontSize: 14, fontWeight: 600, flexShrink: 0, boxShadow: "0 1px 5px rgba(0,0,0,0.02)", transform: revealed ? "translateY(0)" : "translateY(80px)", transition: revealed ? "transform 0.5s cubic-bezier(0.34,1.56,0.64,1) 0ms" : "none" }}>
            <img src="/icons/products.png" width={"auto"} height={40} style={{ marginTop: -2 }} alt="" />
            <span>All products</span>
          </button>
          <div style={{ width: 16, flexShrink: 0 }} />
        </div>

        {/* Right-edge fade hint */}
        <div style={{
          position: "absolute",
          right: 0,
          top: 0,
          bottom: 0,
          width: 64,
          background: "linear-gradient(to right, transparent, #e8e8e8)",
          pointerEvents: "none",
          opacity: scrollAtEnd ? 0 : 1,
          transition: "opacity 0.35s ease",
          zIndex: 1,
        }} />

        {/* Price label above compact button */}
        <span style={{
          position: "absolute",
          left: 18,
          top: 12,
          transform: "translateY(calc(-100% - 74px))",
          fontSize: 14,
          fontWeight: 700,
          color: "black",
          opacity: barScrollProgress > 0 ? 1 : 0,
          transition: "opacity 0.25s ease-in-out",
          pointerEvents: "none",
          whiteSpace: "nowrap",
        }}>17,98 €</span>

        {/* Gradient plus button */}
        <button
          type="button"
          style={{
            transform: revealed ? "translateX(0)" : "translateX(20px)",
            opacity: revealed ? 1 : 0,
            transition: revealed ? "transform 0.5s cubic-bezier(0.34,1.56,0.64,1) 600ms, opacity 0.3s ease 600ms" : "none",
            position: "absolute",
            right: 16,
            top: -64,
            width: 56,
            height: 56,
            borderRadius: 999,
            border: "none",
            background: "linear-gradient(90deg, #DC2626 -0.88%, #4D52D2 49.94%, #16A34A 101.36%)",
            boxShadow: "0 4px 14px 0 rgba(0, 0, 0, 0.25)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            flexShrink: 0,
            zIndex: 3,
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 5V19M5 12H19" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
        </button>

        {/* Fixed black button */}
        <button
          id="action-bar-black-btn"
          ref={blackBtnRef}
          type="button"
          style={{
            position: "absolute",
            left: 16,
            height: 46,
            padding: barScrollProgress > 0 ? "26px" : "0 16px",
            borderRadius: 999,
            border: "none",
            background: "#000",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            fontSize: 14,
            fontWeight: 600,
            overflow: "hidden",
            flexShrink: 0,
            zIndex: 2,
            boxSizing: "border-box",
            whiteSpace: "nowrap",
            boxShadow: barScrollProgress > 0 ? "0 4px 16px rgba(0,0,0,0.35)" : "none",
            top: revealed ? (barScrollProgress > 0 ? -56 : 12) : 80,
            transition: revealed ? "box-shadow 0.4s ease, top 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)" : "none",
          }}
        >
          <img src="/icons/icon-cart.svg" alt="Cart" style={{ width: 18, height: 18, filter: "invert(1)", flexShrink: 0 }} />
          <span style={{ opacity: barScrollProgress > 0 ? 0 : 1, transition: "opacity 0.15s ease", ...(barScrollProgress > 0 ? { position: "absolute", left: 38 } : {}) }}>17,98 €</span>
        </button>

      </div>

      {showPopup && (
        <>
          <div onClick={dismissPopup} style={{ position: "absolute", inset: 0, zIndex: 9 }} />
          <div id="onboarding-popup" style={{
            position: "absolute",
            bottom: 16,
            left: 16,
            right: 16,
            background: "#fff",
            borderRadius: 20,
            padding: "24px 20px 20px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
            zIndex: 10,
            fontFamily: '"MADEOuterSans", sans-serif',
          }}>
          <p style={{ margin: "0 0 20px", fontSize: 18, fontWeight: 500, textAlign: "center", lineHeight: 1.3 }}>
            <span className="onboarding-text-gradient">Start here to customize your product.</span>
          </p>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" style={{ flex: 1, height: 48, borderRadius: 999, border: "none", background: "#f0f0f0", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 14, fontWeight: 600, color: "#111", cursor: "pointer" }}>
              <img src="/icons/icon-tag.svg" width={20} height={20} alt="" />
              All products
            </button>
            <button type="button" style={{ flex: 1, height: 48, borderRadius: 999, border: "none", background: "#f0f0f0", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 14, fontWeight: 600, color: "#111", cursor: "pointer" }}>
              <img src="/icons/icon-plus.svg" width={20} height={20} alt="" />
              Add design
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
            padding: "20px 16px 40px",
            outline: "none",
            fontFamily: '"Inter Variable", sans-serif',
          }}>
            <div style={{ width: 40, height: 4, borderRadius: 999, background: "#e0e0e0", margin: "0 auto 20px" }} />
            <div style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "center",
              gap: 8,
            }}>
              {COLORS.map(({ key, label }) => (
                <div key={key} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, width: "calc(25% - 6px)" }}>
                  <img src={`/img/product-images/${key}-front.png`} alt={label} style={{ width: "100%", display: "block" }} />
                  <span style={{ fontSize: 12, color: "#111", textAlign: "center" }}>{label}</span>
                </div>
              ))}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </div>
  );
}
