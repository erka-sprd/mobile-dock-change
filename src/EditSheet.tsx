/**
 * The mobile edit bottom sheet, ported whole from the main proto
 * (components/mobile/mobile-edit-sheet.tsx and the pieces it draws on):
 * MobileDrawer (the kit-style sheet), the colour bubbles + custom picker,
 * the lazy-loading FontButton tiles, the curve preset strip, and the sheet
 * itself — pill tabs (Write / Font / Format / Size / Color / Curve) with
 * duplicate/delete at the row's end and a fixed 184px panel area. No dim
 * overlay and non-modal, so the canvas stays visible while editing.
 *
 * The proto's Tailwind is inline styles here; press states and the picker
 * restyle live in styles.css.
 */
import { ArrowLeft, X } from "lucide-react";
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { HexColorPicker } from "react-colorful";

import { DeleteIcon, DuplicateIcon, KeyboardIcon } from "./EditorBar";
import { WedgeSlider } from "./WedgeSlider";
import { FONTS, FontDef, MAX_FONT_SIZE, MIN_FONT_SIZE, loadFont } from "./fonts";
import { PathMetrics, TEXT_CURVES, TextCurveId, pathMetrics } from "./textPath";

/**
 * A horizontal strip — the tab row, the font strip, the curve strip. Scrolled
 * natively, as in the main proto (iOS runs it off the main thread); see the
 * pan-x note in styles.css for why that works on /scrollversion too.
 */
function HScroll({ style, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className="eb-scroller"
      data-hscroll=""
      style={{ ...style, touchAction: "pan-x", overscrollBehaviorX: "contain" }}
      {...rest}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------------- *
 * Icons the sheet's panels use (proto: mobile/icons.tsx + ui/editor-bar).
 * ------------------------------------------------------------------------- */

const MinusIcon = () => (
  <svg viewBox="0 0 20 20" width="24" height="24" fill="currentColor" aria-hidden="true">
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M15.8333 9.16663C16.2935 9.16663 16.6666 9.53972 16.6666 9.99996C16.6666 10.4273 16.3449 10.7795 15.9305 10.8277L15.8333 10.8333H4.16665C3.70641 10.8333 3.33331 10.4602 3.33331 9.99996C3.33331 9.5726 3.65501 9.22037 4.06946 9.17223L4.16665 9.16663H15.8333Z"
    />
  </svg>
);

const PlusIcon = () => (
  <svg viewBox="0 0 20 20" width="24" height="24" fill="currentColor" aria-hidden="true">
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M10.8277 4.06952C10.7796 3.65507 10.4273 3.33337 9.99998 3.33337C9.53974 3.33337 9.16665 3.70647 9.16665 4.16671V9.16671H4.16665L4.06946 9.17231C3.65501 9.22045 3.33331 9.57268 3.33331 10C3.33331 10.4603 3.70641 10.8334 4.16665 10.8334H9.16665V15.8334L9.17225 15.9306C9.22039 16.345 9.57262 16.6667 9.99998 16.6667C10.4602 16.6667 10.8333 16.2936 10.8333 15.8334V10.8334H15.8333L15.9305 10.8278C16.3449 10.7796 16.6666 10.4274 16.6666 10C16.6666 9.5398 16.2935 9.16671 15.8333 9.16671H10.8333V4.16671L10.8277 4.06952Z"
    />
  </svg>
);

const BoldIcon = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 4h7a4 4 0 0 1 0 8H6z" />
    <path d="M6 12h8a4 4 0 0 1 0 8H6z" />
  </svg>
);

const ItalicIcon = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="19" y1="4" x2="10" y2="4" />
    <line x1="14" y1="20" x2="5" y2="20" />
    <line x1="15" y1="4" x2="9" y2="20" />
  </svg>
);

const UnderlineIcon = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 3v7a6 6 0 0 0 12 0V3" />
    <line x1="4" y1="21" x2="20" y2="21" />
  </svg>
);

export type TextAlign = "left" | "center" | "right";

// Alignment icon — three lines shifted to match the alignment.
const AlignIcon = ({ align }: { align: TextAlign }) => {
  const lines =
    align === "center"
      ? [
          [4, 16],
          [6.5, 13.5],
          [5, 15],
        ]
      : align === "right"
        ? [
            [3, 17],
            [9, 17],
            [7, 17],
          ]
        : [
            [3, 17],
            [3, 11],
            [3, 13],
          ];
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
      {lines.map(([x1, x2], i) => (
        <line
          key={i}
          x1={x1}
          x2={x2}
          y1={5 + i * 5}
          y2={5 + i * 5}
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
};

/* ------------------------------------------------------------------------- *
 * Colour bubbles — proto's mobile/color-bubbles.tsx: create-omat's mobile
 * text palette (COLOR_PALETTE in its Constants.ts), verbatim.
 * ------------------------------------------------------------------------- */

export const COLOR_PALETTE = [
  // Row 1: Lightest shades
  "#FFFFFF", "#B8C9FF", "#FFBBE2", "#FFBABB", "#FFE3BD", "#FAECBC", "#D7F4D0", "#AEF1FA",
  // Row 2: Medium-light shades
  "#E3E3E3", "#88A6FC", "#FF94D2", "#FF9495", "#FFD299", "#FFE899", "#B6F2AB", "#1BE5FF",
  // Row 3: Medium-dark shades
  "#9C9C9C", "#3669F8", "#FF5EB9", "#FF4E50", "#FFB55A", "#FFD95E", "#85DC77", "#1EC5DB",
  // Row 4: Darkest shades
  "#000000", "#0027BF", "#B5095E", "#BD060B", "#CF6F1E", "#B28217", "#298C27",
];

/** create-omat's isColorDarkTone, on hex: perceived luminance under half. */
export function isDarkTone(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b < 128;
}

const CheckIcon = ({ color }: { color: string }) => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

function ColorBubble({
  color,
  isActive,
  onClick,
}: {
  color: string;
  isActive: boolean;
  onClick: () => void;
}) {
  const dark = isDarkTone(color);
  return (
    <button
      type="button"
      aria-label={`Color ${color}`}
      onClick={onClick}
      style={{
        position: "relative",
        display: "flex",
        width: 32,
        height: 32,
        flexShrink: 0,
        cursor: "pointer",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 999,
        border: "1px solid rgba(0,0,0,0.2)",
        padding: 0,
        background: color,
        boxShadow: isActive
          ? `inset 0 0 0 2px ${dark ? "#fff" : "#000"}`
          : "inset 0 0 0 1px rgba(0,0,0,0.1)",
      }}
    >
      {isActive && <CheckIcon color={dark ? "#fff" : "#000"} />}
    </button>
  );
}

function RainbowBubble({
  lastCustomColor,
  onClick,
}: {
  lastCustomColor: string | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label="Choose custom color"
      onClick={onClick}
      style={{
        position: "relative",
        display: "flex",
        width: 32,
        height: 32,
        flexShrink: 0,
        cursor: "pointer",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 999,
        border: "none",
        padding: 0,
        background:
          "conic-gradient(from 90deg, rgba(43, 113, 247, 1) 0deg, rgba(254, 48, 195, 1) 83.07deg, rgba(254, 28, 31, 1) 157.5deg, rgba(244, 245, 71, 1) 240.57deg, rgba(1, 241, 87, 1) 294.23deg, rgba(102, 102, 102, 1) 360deg)",
      }}
    >
      <div
        style={{
          borderRadius: 999,
          ...(lastCustomColor
            ? { width: 24, height: 24, border: "3px solid #fff", backgroundColor: lastCustomColor }
            : { width: 16, height: 16, backgroundColor: "#fff" }),
        }}
      />
    </button>
  );
}

/* ------------------------------------------------------------------------- *
 * Custom colour panel — proto's mobile/custom-color-panel.tsx: react-colorful
 * restyled by .custom-picker-wrapper, a hex field with a live swatch, and the
 * native EyeDropper where the browser has one.
 * ------------------------------------------------------------------------- */

const isValidHex = (v: string) => /^#[0-9a-f]{6}$/i.test(v);

const PipetteIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m2 22 1-1h3l9-9" />
    <path d="M3 21v-3l9-9" />
    <path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z" />
  </svg>
);

function CustomColorPanel({
  currentColor,
  onColorChange,
}: {
  currentColor: string;
  onColorChange: (color: string) => void;
}) {
  const [isSupported, setIsSupported] = useState(false);
  const [hexInput, setHexInput] = useState(currentColor);
  useEffect(() => setHexInput(currentColor), [currentColor]);

  useEffect(() => {
    setIsSupported(typeof window !== "undefined" && "EyeDropper" in window);
  }, []);

  const handlePipetteClick = async () => {
    if (!isSupported) return;
    try {
      // @ts-ignore - EyeDropper is a newer browser API
      const eyeDropper = new window.EyeDropper();
      const result = await eyeDropper.open();
      onColorChange(result.sRGBHex);
    } catch {
      // Picking cancelled — nothing to do.
    }
  };

  return (
    <div className="slide-in-right" style={{ display: "flex", height: 232, flexDirection: "column", gap: 8 }}>
      <div className="custom-picker-wrapper" data-vaul-no-drag>
        <HexColorPicker
          color={currentColor}
          onChange={onColorChange}
          style={{ height: "100%", width: "100%" }}
        />
      </div>

      <div style={{ display: "flex", width: "100%", alignItems: "center", gap: 8, padding: "0 16px" }}>
        <div
          style={{
            display: "flex",
            height: 48,
            flex: 1,
            alignItems: "center",
            gap: 12,
            borderRadius: 8,
            border: "1px solid #d4d4d4",
            background: "#fff",
            padding: 8,
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              flexShrink: 0,
              borderRadius: 999,
              border: "1px solid rgba(0,0,0,0.05)",
              backgroundColor: currentColor,
            }}
          />
          <input
            style={{
              width: "100%",
              fontSize: 12,
              lineHeight: "16px",
              fontWeight: 400,
              textTransform: "uppercase",
              outline: "none",
              border: "none",
              background: "none",
              fontFamily: "inherit",
              WebkitUserSelect: "text",
              userSelect: "text",
            }}
            value={hexInput}
            onChange={e => {
              // Any '#' typed anywhere is stripped, then one is put back in
              // front — as in create-omat.
              const value = `#${e.target.value.replace(/#/g, "")}`;
              if (value.length > 7) return; // '#' + 6 hex digits, no alpha
              setHexInput(value);
              if (isValidHex(value)) onColorChange(value);
            }}
            maxLength={7}
            pattern="^#[0-9A-Fa-f]{6}$"
            aria-label="Hex color"
          />
        </div>

        {isSupported && (
          <button
            type="button"
            aria-label="Pick color from screen"
            onClick={handlePipetteClick}
            className="press-dim"
            style={{
              display: "flex",
              width: 48,
              height: 48,
              flexShrink: 0,
              cursor: "pointer",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 8,
              border: "1px solid #d4d4d4",
              background: "#fff",
              color: "#111",
            }}
          >
            <PipetteIcon />
          </button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------- *
 * Font tile — proto's ui/font-panel/FontButton.tsx: lazy-loads its family
 * when it scrolls near, then binary-searches the biggest size that fits.
 * ------------------------------------------------------------------------- */

function FontButton({
  font,
  isSelected,
  onClick,
}: {
  font: FontDef;
  isSelected: boolean;
  onClick: (font: FontDef) => void;
}) {
  const [fontFamily, setFontFamily] = useState<string | null>(null);
  const ref = useRef<HTMLButtonElement | null>(null);
  const spanRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      async ([entry]) => {
        if (entry.isIntersecting) {
          const family = await loadFont(font.family);
          setFontFamily(family);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [font.family]);

  useLayoutEffect(() => {
    const span = spanRef.current;
    const btn = ref.current;
    if (!span || !btn || !fontFamily) return;

    const padding = 32; // 16px each side
    const availW = btn.clientWidth - padding;
    const availH = btn.clientHeight - padding;

    let lo = 8;
    let hi = 40;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      span.style.fontSize = `${mid}px`;
      if (span.scrollWidth <= availW && span.scrollHeight <= availH) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    span.style.fontSize = `${lo}px`;
  }, [fontFamily]);

  return (
    <button
      ref={ref}
      type="button"
      onClick={() => onClick(font)}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        height: 100,
        width: 96,
        flexShrink: 0,
        cursor: "pointer",
        borderRadius: 2,
        background: "#f5f5f5",
        padding: 16,
        border: isSelected ? "1px solid #000" : "1px solid transparent",
        color: "#111",
      }}
    >
      {fontFamily ? (
        <span
          ref={spanRef}
          key={fontFamily}
          style={{ fontFamily: `"${fontFamily}"`, width: "100%", textAlign: "center" }}
        >
          {font.family}
        </span>
      ) : (
        <div style={{ display: "flex", width: "100%", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <div className="skeleton-pulse" style={{ height: 16, width: "75%", borderRadius: 4, background: "#e5e5e5" }} />
          <div className="skeleton-pulse" style={{ height: 16, width: "50%", borderRadius: 4, background: "#e5e5e5" }} />
        </div>
      )}
    </button>
  );
}

/* ------------------------------------------------------------------------- *
 * Curve tiles — proto's ui/text-path/curve-tiles.tsx.
 * ------------------------------------------------------------------------- */

const EMPTY_METRICS: PathMetrics = { length: 0, x: 0, y: 0, width: 0, height: 0 };

// The "no curve" tile's icon: a plain straight baseline.
const STRAIGHT_PATH = "M 0,0 L 120,0";

/** Rendered weight of every preview stroke, in CSS px. */
const STROKE_PX = 2;

function CurvePreview({ path, width = 48, height = 28 }: { path: string; width?: number; height?: number }) {
  const [m, setM] = useState(EMPTY_METRICS);
  useEffect(() => setM(pathMetrics(path)), [path]);

  if (!m.width && !m.height) {
    return <svg width={width} height={height} aria-hidden="true" />;
  }
  // A straight baseline has no height at all; give it a sliver to sit in.
  const h = m.height || Math.max(m.width * 0.04, 1);
  const pad = Math.max(m.width, h) * 0.06;
  const viewW = m.width + pad * 2;
  const viewH = h + pad * 2;
  const scale = Math.min(width / viewW, height / viewH);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`${m.x - pad} ${m.y - pad} ${viewW} ${viewH}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth={scale > 0 ? STROKE_PX / scale : STROKE_PX}
        strokeLinecap="round"
      />
    </svg>
  );
}

function CurveStrip({
  curveId,
  onCurveChange,
}: {
  curveId: TextCurveId | null;
  onCurveChange: (id: TextCurveId | null) => void;
}) {
  return (
    <HScroll style={{ display: "flex", width: "100%", alignItems: "center", overflowX: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 16px" }}>
        {[null, ...TEXT_CURVES].map(curve => {
          const id = curve?.id ?? null;
          const active = id === curveId;
          return (
            <button
              key={id ?? "none"}
              type="button"
              aria-pressed={active}
              onClick={() => onCurveChange(id)}
              style={{
                display: "flex",
                height: 100,
                width: 96,
                flexShrink: 0,
                cursor: "pointer",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                borderRadius: 2,
                background: "#f5f5f5",
                padding: "0 8px",
                border: active ? "1px solid #000" : "1px solid transparent",
                color: "#111",
              }}
            >
              <CurvePreview path={curve ? (curve.iconPath ?? curve.path) : STRAIGHT_PATH} />
              <span style={{ fontSize: 12, fontWeight: 600 }}>{curve?.label ?? "Do not curve"}</span>
            </button>
          );
        })}
      </div>
    </HScroll>
  );
}

/* ------------------------------------------------------------------------- *
 * The sheet
 * ------------------------------------------------------------------------- */

type TextValues = {
  fontFamily: string;
  fontSize: number;
  color: string;
  colorSet: boolean;
  textAlign: TextAlign;
  bold: boolean;
  italic: boolean;
  underline: boolean;
};

const TEXT_TABS = ["Font", "Format", "Size", "Color", "Curve"] as const;
export type TextTab = (typeof TEXT_TABS)[number];

type MobileEditSheetProps = {
  open: boolean;
  onClose: () => void;
  text: TextValues | null;
  canBold: boolean;
  canItalic: boolean;
  onFontFamilyChange: (family: string) => void;
  /** Largest size the print area allows. */
  maxFontSize: number;
  onFontSizeChange: (size: number) => void;
  onColorChange: (color: string) => void;
  onTextAlignChange: (align: TextAlign) => void;
  onToggleBold: () => void;
  onToggleItalic: () => void;
  onToggleUnderline: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  /** Enter inline text editing (create-omat's "Write" keyboard pill). */
  onWrite: () => void;
  /** Which panel to show — set by whichever editor-bar item opened the sheet. */
  initialTab?: TextTab;
  /** Active curve preset, or null while the text is on a straight baseline. */
  curveId: TextCurveId | null;
  onCurveChange: (id: TextCurveId | null) => void;
};

const tabPill: React.CSSProperties = {
  display: "inline-flex",
  flexShrink: 0,
  cursor: "pointer",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 999,
  padding: "8px 16px",
  fontSize: 14,
  fontWeight: 600,
  border: "none",
  background: "none",
  color: "#111",
  fontFamily: "inherit",
  transition: "background-color 0.15s",
};

const roundIconBtn: React.CSSProperties = {
  display: "flex",
  height: 36,
  width: 36,
  flexShrink: 0,
  cursor: "pointer",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 999,
  border: "none",
  background: "none",
  color: "#111",
  padding: 0,
};

const formatBtn = (active: boolean, disabled: boolean): React.CSSProperties => ({
  display: "flex",
  height: 52,
  maxWidth: 62,
  flex: 1,
  cursor: disabled ? "not-allowed" : "pointer",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 8,
  border: "1px solid #e5e5e5",
  background: active && !disabled ? "#f5f5f5" : "#fff",
  color: "#111",
  opacity: disabled ? 0.3 : 1,
  transition: "background-color 0.15s",
});

export default function MobileEditSheet({
  open,
  onClose,
  text,
  canBold,
  canItalic,
  maxFontSize,
  onFontFamilyChange,
  onFontSizeChange,
  onColorChange,
  onTextAlignChange,
  onToggleBold,
  onToggleItalic,
  onToggleUnderline,
  onDuplicate,
  onDelete,
  onWrite,
  initialTab = "Font",
  curveId,
  onCurveChange,
}: MobileEditSheetProps) {
  const [activeTab, setActiveTab] = useState<TextTab>("Font");
  // The custom colour view replaces the whole sheet body, create-omat style;
  // the last colour picked there becomes the rainbow bubble's centre dot.
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [lastCustomColor, setLastCustomColor] = useState<string | null>(null);

  // Open on whichever panel the editor bar asked for.
  useEffect(() => {
    if (open) setActiveTab(initialTab);
  }, [open, initialTab]);

  // Leaving the tab (or the sheet) drops the picker view.
  useEffect(() => {
    setShowCustomPicker(false);
  }, [activeTab, open]);

  // The size slider paints an SVG track, so it needs a pixel width. Measured
  // through a callback ref — the drawer mounts its content on its own
  // schedule, so an effect keyed on open could run before the cell exists.
  const [sliderWidth, setSliderWidth] = useState(0);
  const sliderObserverRef = useRef<ResizeObserver | null>(null);
  const sliderCellRef = useCallback((node: HTMLDivElement | null) => {
    sliderObserverRef.current?.disconnect();
    sliderObserverRef.current = null;
    if (!node) {
      setSliderWidth(0);
      return;
    }
    const measure = () => setSliderWidth(node.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    sliderObserverRef.current = ro;
  }, []);

  // No rounding to whole pixels: the readout and the step buttons both work
  // in percent, and snapping the size to integers would make a "1%" step land
  // on anything but 1%.
  const sizeMax = Math.max(MIN_FONT_SIZE + 1, Math.min(MAX_FONT_SIZE, Math.floor(maxFontSize)));
  const clampSize = (v: number) => Math.min(sizeMax, Math.max(MIN_FONT_SIZE, v));
  const sizeValue = clampSize(text?.fontSize ?? MIN_FONT_SIZE);
  /** Move the size by whole percentage points of the slider's range. */
  const stepSizePercent = (delta: number) => {
    const range = sizeMax - MIN_FONT_SIZE;
    const pct = ((sizeValue - MIN_FONT_SIZE) / range) * 100;
    const next = Math.min(100, Math.max(0, Math.round(pct) + delta));
    onFontSizeChange(clampSize(MIN_FONT_SIZE + (next / 100) * range));
  };

  const title = showCustomPicker ? (
    <span style={{ display: "flex", height: "100%", alignItems: "center", gap: 8, paddingTop: 4 }}>
      <button
        type="button"
        aria-label="Back"
        onClick={() => setShowCustomPicker(false)}
        style={{ marginLeft: -4, cursor: "pointer", padding: 4, border: "none", background: "none", display: "flex", color: "#111" }}
      >
        <ArrowLeft size={24} strokeWidth={1.8} />
      </button>
      Custom color
    </span>
  ) : (
    "Text style"
  );

  return (
    // A hand-rolled sheet, not vaul: a vaul Root living beside this app's
    // other drawers loops radix Presence's ref on touch devices ("Maximum
    // update depth exceeded"), so the sheet is a plain fixed panel animated
    // by transform — the same idiom as the app's own checkout drawer. No
    // overlay and no modality: the canvas stays visible and interactive
    // while editing, like create-omat's mobile edit drawer.
    <div
      // Touches on the sheet belong to it — never to the stage behind.
      onTouchStart={e => e.stopPropagation()}
      onTouchMove={e => e.stopPropagation()}
      onTouchEnd={e => e.stopPropagation()}
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        borderTopLeftRadius: 12,
        borderTopRightRadius: 12,
        border: "1px solid #e5e5e5",
        borderBottom: "none",
        background: "#fff",
        outline: "none",
        maxHeight: "calc(100% - 6rem)",
        fontFamily: '"Inter Variable", sans-serif',
        transform: open ? "translateY(0)" : "translateY(110%)",
        transition: "transform 0.45s cubic-bezier(0.32, 0.72, 0, 1)",
        pointerEvents: open ? "auto" : "none",
        boxShadow: "0 -2px 16px rgba(0,0,0,0.06)",
      }}
    >
          {/* Header row — kit anatomy: left-aligned MADE-font title + X.
              Dragging the header down dismisses, in place of vaul's swipe. */}
          <div
            style={{ padding: "4px 6px 4px 16px", touchAction: "none" }}
            onTouchStart={e => {
              e.stopPropagation();
              const startY = e.touches[0].clientY;
              const onMove = (ev: TouchEvent) => {
                if (ev.touches[0].clientY - startY > 60) {
                  cleanup();
                  onClose();
                }
              };
              const cleanup = () => {
                document.removeEventListener("touchmove", onMove);
                document.removeEventListener("touchend", cleanup);
              };
              document.addEventListener("touchmove", onMove);
              document.addEventListener("touchend", cleanup);
            }}
          >
            <div style={{ display: "flex", minHeight: 44, alignItems: "center", justifyContent: "space-between", textAlign: "left" }}>
              <div className="font-outer-sans" style={{ fontSize: 16, fontWeight: 500, margin: 0 }}>
                {title}
              </div>
              <button
                type="button"
                onClick={onClose}
                style={{ cursor: "pointer", padding: 10, color: "#000", border: "none", background: "none", display: "flex" }}
                aria-label="Close"
              >
                <X size={24} aria-hidden strokeWidth={1.8} />
              </button>
            </div>
          </div>

          <div style={{ display: "flex", minHeight: 0, flex: 1, flexDirection: "column", overflowY: "auto" }}>
            {text && showCustomPicker ? (
              <div style={{ paddingBottom: "calc(8px + env(safe-area-inset-bottom))" }}>
                <CustomColorPanel
                  currentColor={text.colorSet ? text.color : "#000000"}
                  onColorChange={color => {
                    onColorChange(color);
                    setLastCustomColor(color);
                  }}
                />
              </div>
            ) : text ? (
              <div style={{ display: "flex", flexDirection: "column", paddingBottom: "calc(8px + env(safe-area-inset-bottom))" }}>
                {/* Pill tabs + duplicate/delete at the row's end, one scroller. */}
                <HScroll
                  data-sheet-tabs="true"
                  style={{ display: "flex", alignItems: "center", gap: 8, overflowX: "auto", padding: "0 16px", whiteSpace: "nowrap" }}
                >
                  <button
                    type="button"
                    onClick={onWrite}
                    style={{ ...tabPill, gap: 8, padding: "8px 16px 8px 0" }}
                  >
                    <KeyboardIcon />
                    Write
                  </button>
                  {TEXT_TABS.map(tab => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setActiveTab(tab)}
                      style={{ ...tabPill, background: activeTab === tab ? "#f5f5f5" : "none" }}
                    >
                      {tab}
                    </button>
                  ))}
                  <div style={{ display: "flex", alignItems: "center", gap: 4, background: "#fff", paddingLeft: 8 }}>
                    <button
                      type="button"
                      aria-label="Duplicate text"
                      onClick={onDuplicate}
                      className="press-dim"
                      style={roundIconBtn}
                    >
                      <DuplicateIcon />
                    </button>
                    <button
                      type="button"
                      aria-label="Delete text"
                      onClick={() => {
                        onDelete();
                        onClose();
                      }}
                      className="press-dim"
                      style={{ ...roundIconBtn, color: "#DC2626" }}
                    >
                      <DeleteIcon />
                    </button>
                  </div>
                </HScroll>

                {/* Panel area — the fixed height create-omat's drawer keeps
                    (184px), panels centred inside it. */}
                <div style={{ display: "flex", height: 184, alignItems: "center", justifyContent: "center" }}>
                  {activeTab === "Font" && (
                    /* create-omat's FontGrid mobile: one horizontal strip of
                       96px-wide tiles. */
                    <HScroll style={{ display: "flex", width: "100%", alignItems: "center", overflowX: "auto" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 16px" }}>
                        {FONTS.map(font => (
                          <FontButton
                            key={font.family}
                            font={font}
                            isSelected={font.family === text.fontFamily}
                            onClick={f => onFontFamilyChange(f.family)}
                          />
                        ))}
                      </div>
                    </HScroll>
                  )}

                  {activeTab === "Size" && (
                    <div style={{ display: "flex", width: "100%", alignItems: "center", gap: 8, padding: "0 16px" }}>
                      <button
                        type="button"
                        aria-label="Decrease font size"
                        onClick={() => stepSizePercent(-1)}
                        className="press-dim"
                        style={{ ...roundIconBtn, width: 44, height: 44 }}
                      >
                        <MinusIcon />
                      </button>
                      <div ref={sliderCellRef} style={{ minWidth: 0, flex: 1 }}>
                        {sliderWidth > 0 && (
                          <WedgeSlider
                            min={MIN_FONT_SIZE}
                            max={sizeMax}
                            value={sizeValue}
                            onChange={v => onFontSizeChange(clampSize(v))}
                            width={sliderWidth}
                            jumpOnTrackClick
                            showPercentage
                          />
                        )}
                      </div>
                      <button
                        type="button"
                        aria-label="Increase font size"
                        onClick={() => stepSizePercent(1)}
                        className="press-dim"
                        style={{ ...roundIconBtn, width: 44, height: 44 }}
                      >
                        <PlusIcon />
                      </button>
                    </div>
                  )}

                  {activeTab === "Curve" && <CurveStrip curveId={curveId} onCurveChange={onCurveChange} />}

                  {activeTab === "Color" && (
                    /* create-omat's text ColorPanel: COLOR_PALETTE in an
                       8-column bubble grid, rainbow bubble last. */
                    <div
                      style={{
                        display: "grid",
                        width: "100%",
                        gridTemplateColumns: "repeat(8, 1fr)",
                        justifyItems: "center",
                        rowGap: 8,
                        padding: "0 16px",
                      }}
                    >
                      {COLOR_PALETTE.map(color => (
                        <ColorBubble
                          key={color}
                          color={color}
                          isActive={text.colorSet && text.color.toLowerCase() === color.toLowerCase()}
                          onClick={() => onColorChange(color)}
                        />
                      ))}
                      <RainbowBubble lastCustomColor={lastCustomColor} onClick={() => setShowCustomPicker(true)} />
                    </div>
                  )}

                  {activeTab === "Format" && (
                    /* create-omat's FormatPanel: bordered B / I / U buttons,
                       then the labelled alignment box. */
                    <div className="sheet-fade-in" style={{ display: "flex", width: "100%", flexDirection: "column", gap: 16, padding: "0 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <button type="button" aria-label="Bold" onClick={onToggleBold} disabled={!canBold} style={formatBtn(text.bold, !canBold)}>
                          <BoldIcon />
                        </button>
                        <button type="button" aria-label="Italic" onClick={onToggleItalic} disabled={!canItalic} style={formatBtn(text.italic, !canItalic)}>
                          <ItalicIcon />
                        </button>
                        <button type="button" aria-label="Underline" onClick={onToggleUnderline} style={formatBtn(text.underline, false)}>
                          <UnderlineIcon />
                        </button>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          minHeight: 81,
                          maxWidth: 342,
                          alignItems: "center",
                          overflow: "hidden",
                          borderRadius: 8,
                          border: "1px solid #e5e5e5",
                          background: "#fff",
                          padding: "0 4px",
                        }}
                      >
                        {(["left", "center", "right"] as const).map(align => (
                          <button
                            key={align}
                            type="button"
                            aria-label={`Align ${align}`}
                            onClick={() => onTextAlignChange(align)}
                            className={text.textAlign === align ? "" : "press-dim"}
                            style={{
                              position: "relative",
                              display: "flex",
                              minHeight: 69,
                              flex: 1,
                              cursor: "pointer",
                              flexDirection: "column",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: 4,
                              borderRadius: 8,
                              padding: "8px 0",
                              border: "none",
                              background: text.textAlign === align ? "#f5f5f5" : "none",
                              color: "#111",
                              transition: "background-color 0.3s",
                            }}
                          >
                            <AlignIcon align={align} />
                            <span style={{ fontSize: 11, lineHeight: 1.2, fontWeight: 400, color: "#000", textTransform: "capitalize" }}>
                              {align}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
    </div>
  );
}
