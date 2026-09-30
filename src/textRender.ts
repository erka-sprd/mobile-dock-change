/**
 * Canvas-side text drawing, shared by the flattener, the side thumbnails and
 * the bbox measurement — one place that knows how a text item renders, now
 * that items carry the main proto's full text model (font family, bold,
 * italic, underline, alignment, curve, rotation).
 *
 * Curved text is drawn glyph by glyph along its baseline path, using the same
 * curvedLayout/samplePath geometry the on-canvas SVG renderer (CurvedText)
 * reads, so the flattened artwork and the live canvas cannot disagree.
 */
import { DEFAULT_FONT_FAMILY } from "./fonts";
import { curvedLayout, samplePath, textBoundaryWidths } from "./textPath";

export type TextAlign = "left" | "center" | "right";

export type TextLike = {
  content: string;
  fontSize: number;
  color?: string;
  fontFamily?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  textAlign?: TextAlign;
  textPath?: string | null;
  rotation?: number;
};

/** The line height every text render uses — the span's 0.9 leading. */
export const TEXT_LINE_HEIGHT = 0.9;

export const textItemFamily = (t: TextLike) => t.fontFamily ?? DEFAULT_FONT_FAMILY;

/** The ctx.font string for an item — style, weight, size, family. */
export const textItemFont = (t: TextLike) =>
  `${t.italic ? "italic " : ""}${t.bold ? "700" : "400"} ${t.fontSize}px "${textItemFamily(t)}"`;

let sharedCtx: CanvasRenderingContext2D | null = null;
const ctx2d = () => {
  if (!sharedCtx) sharedCtx = document.createElement("canvas").getContext("2d");
  return sharedCtx;
};

/** Unrotated box of a FLAT text block, plus its line metrics. */
export function measureFlatText(t: TextLike) {
  const ctx = ctx2d();
  const lines = t.content.split("\n");
  const lineH = t.fontSize * TEXT_LINE_HEIGHT;
  let maxW = t.fontSize * 0.5;
  let ascent = t.fontSize * 0.8;
  let descent = t.fontSize * 0.2;
  if (ctx) {
    ctx.font = textItemFont(t);
    const m0 = ctx.measureText(lines[0] || "M");
    if (m0.actualBoundingBoxAscent) ascent = m0.actualBoundingBoxAscent;
    if (m0.actualBoundingBoxDescent || m0.actualBoundingBoxDescent === 0)
      descent = m0.actualBoundingBoxDescent;
    maxW = Math.max(maxW, ...lines.map(l => ctx.measureText(l).width));
  }
  const totalH = (lines.length - 1) * lineH + ascent + descent;
  return { lines, lineH, maxW, ascent, descent, totalH };
}

/** Unrotated {w, h} of a text item — curved items take their layout's box. */
export function textItemSize(t: TextLike): { w: number; h: number } {
  if (t.textPath) {
    const layout = curvedLayout(t.content, t.textPath, t.fontSize, textItemFamily(t));
    if (layout) return { w: layout.width, h: layout.height };
  }
  const m = measureFlatText(t);
  return { w: m.maxW, h: m.totalH };
}

/** Axis-aligned box of a (possibly rotated) w×h rectangle. */
export function rotatedExtent(w: number, h: number, rotation?: number): { w: number; h: number } {
  const rad = ((rotation ?? 0) * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  return { w: w * cos + h * sin, h: w * sin + h * cos };
}

/**
 * Draw a text item centred at (cx, cy) in the current ctx space, honouring
 * rotation, alignment, underline and curve.
 */
export function drawTextItem(ctx: CanvasRenderingContext2D, t: TextLike, cx: number, cy: number) {
  const color = t.color ?? "#000";
  ctx.save();
  ctx.translate(cx, cy);
  if (t.rotation) ctx.rotate((t.rotation * Math.PI) / 180);
  ctx.font = textItemFont(t);
  ctx.fillStyle = color;
  ctx.textBaseline = "alphabetic";

  const layout = t.textPath
    ? curvedLayout(t.content, t.textPath, t.fontSize, textItemFamily(t))
    : null;

  if (t.textPath && layout) {
    // Glyph by glyph along the baseline: each character sits at the midpoint
    // of its own advance, rotated to the path's tangent — the canvas
    // equivalent of SVG textPath with textAnchor="middle" at 50%.
    const widths = textBoundaryWidths(t.content, t.fontSize, textItemFamily(t));
    const lengths: number[] = [];
    for (let i = 0; i < t.content.length; i++) {
      lengths.push((layout.runStartPx + (widths[i] + widths[i + 1]) / 2) / layout.scale);
    }
    const pts = samplePath(t.textPath, lengths);
    ctx.textAlign = "center";
    ctx.translate(-layout.width / 2, -layout.height / 2);
    pts.forEach((p, i) => {
      if (!p) return;
      ctx.save();
      ctx.translate((p.x - layout.viewX) * layout.scale, (p.y - layout.viewY) * layout.scale);
      ctx.rotate((p.angle * Math.PI) / 180);
      ctx.fillText(t.content[i], 0, 0);
      ctx.restore();
    });
    ctx.restore();
    return;
  }

  const m = measureFlatText(t);
  const align: TextAlign = t.textAlign ?? "center";
  ctx.textAlign = align;
  // Lines align within the block's own width; the block is centred on (0,0).
  const anchorX = align === "left" ? -m.maxW / 2 : align === "right" ? m.maxW / 2 : 0;
  const topY = -m.totalH / 2;
  m.lines.forEach((line, i) => {
    const y = topY + m.ascent + i * m.lineH;
    ctx.fillText(line, anchorX, y);
    if (t.underline && line.length) {
      const lineW = ctx.measureText(line).width;
      const x0 =
        align === "left" ? anchorX : align === "right" ? anchorX - lineW : anchorX - lineW / 2;
      ctx.fillRect(x0, y + t.fontSize * 0.06, lineW, Math.max(1, t.fontSize / 16));
    }
  });
  ctx.restore();
}
