/**
 * Text on a path — the prototype's stand-in for CE.SDK's text-on-path feature.
 *
 * The engine's model (@cesdk/engine 1.80.0, BlockAPI):
 *
 *   setTextOnPath(id, svgPath | null)   // the baseline, a single-subpath SVG
 *                                       // path in the block's local space;
 *                                       // null restores straight layout
 *   setTextOnPathOffset(id, offset)     // start offset as a PROPORTION of path
 *                                       // length, clamped to [-1, 1]
 *   setTextOnPathFlipped(id, flipped)   // text on the underside, read reversed
 *
 * plus the reflected properties `text/path`, `text/pathOffset` and
 * `text/pathFlipped`. Which curve is active is identified by the path value
 * itself — CE.SDK compares getTextOnPath() against each preset's `text/path`,
 * which is exactly what curveIdForPath does below.
 *
 * The prototype does not run the engine, so this mirrors that model instead of
 * wrapping it: the same three shipped presets (their real path data, lifted
 * from the CE.SDK bundle), the same [-1, 1] offset, the same identify-by-path.
 * Flipped is not modelled — the panel does not offer it.
 */

export type TextCurveId =
  | "arch-top"
  | "arch-left"
  | "arch-right"
  | "arch-bottom"
  | "wave"
  | "elevate"

export type TextCurve = {
  id: TextCurveId
  /** What the tile says. Positions are named by where the text sits. */
  label: string
  /** The baseline the text is laid on. */
  path: string
  /**
   * What the panel's tab draws, when that should differ from the baseline the
   * preset actually applies. Falls back to `path`.
   */
  iconPath?: string
  /** Per-preset override of PATH_SLACK — how much path the run is given. */
  slack?: number
  /**
   * Set when `path` describes a full circle, which is sized from the font
   * rather than from the text (see CIRCLE_RADIUS_EM).
   */
  circle?: { cx: number; cy: number; r: number }
}

/**
 * The circle CE.SDK's own "circle" preset describes: centre (60,60), r 59.5.
 * All four arch positions ride this one circle; they differ only in where its
 * parameterisation starts, which is what decides where the centred run lands.
 */
const ARCH_CIRCLE = { cx: 60, cy: 60, r: 59.5 }
const deg = (d: number) => (d * Math.PI) / 180

/**
 * The circle each circular path was minted from, remembered by its path string.
 *
 * A circle's geometry has a closed form — point, tangent, length and bounding
 * box are all one line of trigonometry — while the same answers read out of an
 * SVGPathElement cost a flattened walk of the curve. The four arch presets are
 * circles, and they are the presets people actually use, so keeping their
 * parameters lets every query about them skip the DOM entirely: laying out one
 * arch measured 32ms of getPointAtLength before this, and 0.004ms after.
 *
 * Declared above TEXT_CURVES because circlePathFrom fills it while that table
 * is being built.
 */
type CircleGeometry = {
  cx: number
  cy: number
  r: number
  /** Where the parameterisation starts, radians, screen space (y down). */
  start: number
  /** +1 clockwise, -1 anticlockwise — which way length runs from `start`. */
  dir: 1 | -1
  length: number
}
const circleForPath = new Map<string, CircleGeometry>()

/**
 * The four arch positions, and the two open curves.
 *
 * There is no offset control: each position IS a fixed offset, baked into its
 * path. A run is always centred at the halfway point of its own baseline, so
 * starting the circle half a turn away from where the text should sit puts it
 * there — top is CE.SDK's offset 0, left -50, right +50, bottom +100.
 *
 * Bottom additionally runs the circle anticlockwise, which is CE.SDK's
 * `text/pathFlipped`: without it the text would sit under the bottom of the
 * circle upside down and reading backwards. Reversed, it reads left to right
 * along the inside of the lower arc, the way the bottom of a circular badge is
 * always set.
 */
export const TEXT_CURVES: TextCurve[] = [
  {
    id: "arch-top",
    label: "Top",
    // Starting at the bottom of the circle — this is CE.SDK's circle preset
    // path exactly, bar its redundant closing Z.
    path: circlePathFrom(ARCH_CIRCLE, deg(90)),
    iconPath: "M 0,60 A 60,60 0 0,1 120,60",
    circle: ARCH_CIRCLE,
  },
  {
    id: "arch-bottom",
    label: "Bottom",
    path: circlePathFrom(ARCH_CIRCLE, deg(270), false),
    iconPath: "M 0,60 A 60,60 0 0,0 120,60",
    circle: ARCH_CIRCLE,
  },
  {
    id: "arch-left",
    label: "Left",
    path: circlePathFrom(ARCH_CIRCLE, deg(0)),
    iconPath: "M 60,0 A 60,60 0 0,0 60,120",
    circle: ARCH_CIRCLE,
  },
  {
    id: "arch-right",
    label: "Right",
    path: circlePathFrom(ARCH_CIRCLE, deg(180)),
    iconPath: "M 60,0 A 60,60 0 0,1 60,120",
    circle: ARCH_CIRCLE,
  },
  {
    id: "wave",
    label: "Wave",
    path: "M0 12.0918C12.9043 -2.97537 37.6076 -5.05242 54.3124 12.0918C71.0172 29.236 97.392 29.0683 110.711 12.0918",
  },
  {
    id: "elevate",
    label: "Elevate",
    path: "M0 118.777C0 118.777 0.99638 97.3573 16.1221 83.5172C25.5824 74.8611 44.53 59.7505 82.2446 59.3886C119.959 59.0267 144.113 42.2993 155.245 27.5426C166.378 12.7859 164.49 0 164.49 0",
  },
]

export const textCurve = (id: TextCurveId): TextCurve =>
  TEXT_CURVES.find(c => c.id === id) ?? TEXT_CURVES[0]

/**
 * Which preset a stored path belongs to — CE.SDK identifies the active curve by
 * comparing the path value against each entry's, so this does the same. Returns
 * null for no path, or for a path no preset owns.
 */
export function curveIdForPath(path: string | null | undefined): TextCurveId | null {
  if (!path) return null
  return TEXT_CURVES.find(c => c.path === path)?.id ?? null
}

/**
 * The circle, emitted so its parameterisation STARTS at `angle` (radians,
 * screen space: y down, 90° = bottom) and runs clockwise or anticlockwise.
 * Every variant is the same circle geometrically; only where a run laid on it
 * ends up, and which way the glyphs face, differ.
 *
 * The arc stops a hair short of a full turn, as a 360° arc between two
 * identical points is degenerate and renders as nothing. CE.SDK's own circle
 * preset uses the same trick (its 60 -> 60.01 endpoints).
 */
export function circlePathFrom(
  { cx, cy, r }: { cx: number; cy: number; r: number },
  angle: number,
  clockwise = true
): string {
  const gap = (clockwise ? 1 : -1) * (0.01 / r)
  const sx = cx + r * Math.cos(angle)
  const sy = cy + r * Math.sin(angle)
  const ex = cx + r * Math.cos(angle - gap)
  const ey = cy + r * Math.sin(angle - gap)
  const n = (v: number) => Number(v.toFixed(3))
  const d = `M ${n(sx)},${n(sy)} A ${r},${r} 0 1,${clockwise ? 1 : 0} ${n(ex)},${n(ey)}`
  // Remember what this string is, so everything downstream can answer questions
  // about it with trigonometry instead of walking an SVGPathElement.
  circleForPath.set(d, {
    cx,
    cy,
    r,
    start: angle,
    dir: clockwise ? 1 : -1,
    // The arc covers a full turn less the degenerate gap: r × (2π − gap/r).
    length: 2 * Math.PI * r - 0.01,
  })
  return d
}

// --- geometry ---------------------------------------------------------------

export type PathMetrics = {
  length: number
  x: number
  y: number
  width: number
  height: number
}

// The presets are a fixed set of constant strings, so each one is measured once
// and remembered. Measuring needs a laid-out SVG element; there is no
// closed-form length for a cubic bezier.
const metricsCache = new Map<string, PathMetrics>()

const EMPTY: PathMetrics = { length: 0, x: 0, y: 0, width: 0, height: 0 }

/** Length and bounding box of an SVG path, in its own user units. */
export function pathMetrics(d: string): PathMetrics {
  const cached = metricsCache.get(d)
  if (cached) return cached

  // A circle we minted ourselves needs no measuring, and works on the server
  // too — the arc is a full turn bar a hundredth of a unit, so its box is the
  // circle's.
  const circle = circleForPath.get(d)
  if (circle) {
    const m: PathMetrics = {
      length: circle.length,
      x: circle.cx - circle.r,
      y: circle.cy - circle.r,
      width: circle.r * 2,
      height: circle.r * 2,
    }
    metricsCache.set(d, m)
    return m
  }

  if (typeof document === "undefined") return EMPTY

  const ns = "http://www.w3.org/2000/svg"
  const svg = document.createElementNS(ns, "svg")
  svg.setAttribute("style", "position:absolute;width:0;height:0;overflow:hidden")
  const path = document.createElementNS(ns, "path")
  path.setAttribute("d", d)
  svg.appendChild(path)
  document.body.appendChild(svg)
  const box = path.getBBox()
  const m: PathMetrics = {
    length: path.getTotalLength(),
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
  }
  document.body.removeChild(svg)

  // Rotating the circle mints a fresh path string per offset value, so this
  // cannot be treated as the fixed-size table it was when only presets landed
  // here.
  if (metricsCache.size > 300) metricsCache.clear()
  metricsCache.set(d, m)
  return m
}

// One shared 2D context for all text measurement — creating a canvas per call
// made caret moves and selection drags visibly laggy.
let measureCtx: CanvasRenderingContext2D | null = null
function ctx2d(): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") return null
  if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d")
  return measureCtx
}

/** Width of a run of text at a given size, measured on a 2D canvas. */
export function measureTextWidth(text: string, fontSize: number, fontFamily: string): number {
  const ctx = ctx2d()
  if (!ctx) return 0
  ctx.font = `${fontSize}px "${fontFamily}"`
  return ctx.measureText(text || " ").width
}

/**
 * Bumped whenever a webfont finishes loading.
 *
 * Everything below is measured in a particular face, so a measurement taken
 * while the family was still falling back to a system font is wrong the moment
 * the real one arrives. Nothing cached survives that: the epoch is part of every
 * key, and the caches are emptied outright so the stale entries do not sit in
 * them.
 */
let fontEpoch = 0

// Prefix widths per caret boundary, memoized: the caret, the selection band and
// pointer hit-testing all ask for "width of the text up to index i" many times
// per frame, so it is computed once per (text, size, family).
const boundaryCache = new Map<string, number[]>()

/**
 * Throw away everything measured in a font face.
 *
 * Called on `loadingdone` for faces that arrive on their own, and directly by
 * whoever loads a family before re-rendering with it — the event and the
 * re-render are not ordered against each other, so the caller that knows the
 * font just landed drops the stale measurements itself rather than hoping the
 * listener ran first.
 */
export function invalidateTextMetrics() {
  fontEpoch++
  boundaryCache.clear()
  layoutCache.clear()
}

if (typeof document !== "undefined" && document.fonts) {
  document.fonts.addEventListener("loadingdone", invalidateTextMetrics)
}

/**
 * widths[i] = width of text.slice(0, i) in CSS px, for i in 0..text.length —
 * one entry per caret boundary, including both ends.
 */
export function textBoundaryWidths(
  text: string,
  fontSize: number,
  fontFamily: string
): number[] {
  const key = `${fontEpoch}|${fontSize}|${fontFamily}|${text}`
  const cached = boundaryCache.get(key)
  if (cached) return cached
  const ctx = ctx2d()
  if (!ctx) return [0]
  ctx.font = `${fontSize}px "${fontFamily}"`
  const widths: number[] = [0]
  for (let i = 1; i <= text.length; i++) {
    widths.push(ctx.measureText(text.slice(0, i)).width)
  }
  // Every keystroke mints a new key; keep the cache from growing unbounded.
  if (boundaryCache.size > 200) boundaryCache.clear()
  boundaryCache.set(key, widths)
  return widths
}

/**
 * How much longer than the text its baseline is drawn, for the OPEN curves.
 * CE.SDK sizes the block to the path and lets long text overrun it; here the
 * path is scaled to the text instead, with this much slack so the offset has
 * somewhere to travel.
 */
export const PATH_SLACK = 1.6

/**
 * The circle's radius as a multiple of the font size.
 *
 * The closed circle is sized from the TEXT SIZE alone, never from the text's
 * length: it is the track the text rides on, so it must hold still while
 * someone types — only the arc the run covers changes. (CE.SDK's circle preset
 * is likewise a fixed path; it is the block, not the string, that sizes it.)
 *
 * 3.5 puts the circumference at ~22em, so a fourteen-character line covers
 * roughly a third of it — an arch — while a short word bends gently.
 */
export const CIRCLE_RADIUS_EM = 3.5

// --- shared layout ------------------------------------------------------------

export type CurvedLayout = {
  metrics: PathMetrics
  /** user units → CSS px. */
  scale: number
  /** The element's font size expressed in the path's user units. */
  fontSizeUser: number
  /** viewBox origin, in user units (headroom for ascenders included). */
  viewX: number
  viewY: number
  /** Rendered size, in CSS px. */
  width: number
  height: number
  /** Where the text run begins, as a distance along the path in CSS px. */
  runStartPx: number
  /** The measured text width, CSS px. */
  textWidth: number
  /**
   * CSS px to shift the element by so its PATH, rather than its box, stays put.
   *
   * The box tracks the glyphs, so it moves and resizes as the offset slides the
   * run along the baseline. Pinning the box would drag the whole curve around
   * with it; adding these to the element's position instead pins the path's own
   * bounding box, so the track holds still and only the text travels — which is
   * what CE.SDK does.
   */
  anchorDX: number
  anchorDY: number
}

/**
 * The one geometry both the renderer and the edit caret share, so the caret can
 * never drift from the glyphs it sits between. The path is scaled so its length
 * is textWidth × PATH_SLACK; textAnchor="middle" pins the middle of the run at
 * (0.5 + offset/2) of the path.
 */
/**
 * Layouts, memoized on everything they depend on.
 *
 * A single frame asks for the same layout from five places — the element's
 * position, its clip polygon, the caret, the renderer and each preview thumb —
 * and each one used to walk the path again. One entry per (text, path, size,
 * family) collapses those into one computation; a drag or a keystroke changes
 * the key once and the rest of the frame reads it back.
 */
const layoutCache = new Map<string, CurvedLayout | null>()

export function curvedLayout(
  text: string,
  path: string,
  fontSize: number,
  fontFamily: string
): CurvedLayout | null {
  // fontSize is continuous while resizing, so the key is rounded — a
  // thousandth of a pixel is well below anything visible.
  const cacheKey = `${fontEpoch}|${path}|${fontFamily}|${fontSize.toFixed(3)}|${text}`
  if (layoutCache.has(cacheKey)) return layoutCache.get(cacheKey) ?? null

  const layout = computeCurvedLayout(text, path, fontSize, fontFamily)
  if (layoutCache.size > 400) layoutCache.clear()
  layoutCache.set(cacheKey, layout)
  return layout
}

function computeCurvedLayout(
  text: string,
  path: string,
  fontSize: number,
  fontFamily: string
): CurvedLayout | null {
  const preset = TEXT_CURVES.find(c => c.path === path)
  // Slack is per-preset where a curve needs its own, falling back to the
  // shared constant.
  const slack = preset?.slack ?? PATH_SLACK

  const metrics = pathMetrics(path)
  const textWidth = measureTextWidth(text, fontSize, fontFamily)
  if (!metrics.length || !textWidth) return null

  // A closed circle is sized from the font, so it never grows or shrinks as the
  // text is typed; an open curve is still scaled to the run it carries.
  const scale = preset?.circle
    ? (fontSize * CIRCLE_RADIUS_EM) / preset.circle.r
    : (textWidth * slack) / metrics.length
  const pathLengthPx = metrics.length * scale
  const fontSizeUser = fontSize / scale
  // Room for ascenders above the baseline and descenders below it — the path
  // IS the baseline, so without this the glyphs fall outside the box. Padded on
  // every side, not just vertically: on a closed path (the circle behind
  // "Arch") the run wraps around and its ascenders point outward in every
  // direction, so a box padded only at the top would cut the sides off.
  const above = fontSizeUser * 1.15
  const below = fontSizeUser * 0.32
  const runStartPx = pathLengthPx / 2 - textWidth / 2

  // The box wraps the GLYPHS, not the path. Walking the run's own stretch of
  // baseline and expanding each sample along its normal — ascent outward,
  // descent inward — gives the run's true extent. Padding a baseline box
  // uniformly instead would overshoot badly wherever the curve turns, and using
  // the path's own bounding box would size every text to the whole circle
  // behind "Arch", most of it empty.
  const SAMPLES = 64
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const swallow = (x: number, y: number) => {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  // Sampled in one pass rather than a call per point: samplePath resolves the
  // path and its length once for the whole run, which is most of the cost.
  const lengths: number[] = []
  for (let i = 0; i <= SAMPLES; i++) {
    lengths.push((runStartPx + (textWidth * i) / SAMPLES) / scale)
  }
  for (const p of samplePath(path, lengths)) {
    if (!p) continue
    // Text's "up" is the tangent turned a quarter left; in SVG's y-down space
    // that is (sin a, -cos a).
    const rad = (p.angle * Math.PI) / 180
    const ux = Math.sin(rad)
    const uy = -Math.cos(rad)
    swallow(p.x + ux * above, p.y + uy * above)
    swallow(p.x - ux * below, p.y - uy * below)
  }
  // No DOM to measure against (SSR): fall back to the path's own box.
  const runBox = Number.isFinite(minX)
    ? { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
    : { x: metrics.x, y: metrics.y, width: metrics.width, height: metrics.height }

  return {
    metrics,
    scale,
    fontSizeUser,
    viewX: runBox.x,
    viewY: runBox.y,
    width: runBox.width * scale,
    height: runBox.height * scale,
    runStartPx,
    textWidth,
    // Offset-dependent, because runBox is: together they cancel out, leaving
    // the path's bounding box at a fixed place on the artwork.
    anchorDX: (runBox.x - metrics.x) * scale,
    anchorDY: (runBox.y - metrics.y) * scale,
  }
}

// --- points on a path -----------------------------------------------------------

// getPointAtLength needs a live SVGPathElement; one hidden <svg> holds a cached
// element per path string, so caret moves don't re-parse the path every frame.
const pathElCache = new Map<string, SVGPathElement>()
let hiddenSvg: SVGSVGElement | null = null

function pathEl(d: string): SVGPathElement | null {
  if (typeof document === "undefined") return null
  const cached = pathElCache.get(d)
  if (cached) return cached
  const ns = "http://www.w3.org/2000/svg"
  if (!hiddenSvg) {
    hiddenSvg = document.createElementNS(ns, "svg")
    hiddenSvg.setAttribute("style", "position:absolute;width:0;height:0;overflow:hidden")
    hiddenSvg.setAttribute("aria-hidden", "true")
    document.body.appendChild(hiddenSvg)
  }
  // Same reason as metricsCache: one entry per offset value once a circle is
  // being rotated. Drop the DOM nodes with the map, not just the references.
  if (pathElCache.size > 300) {
    hiddenSvg.replaceChildren()
    pathElCache.clear()
    totalLengthCache.clear()
  }
  const el = document.createElementNS(ns, "path")
  el.setAttribute("d", d)
  hiddenSvg.appendChild(el)
  pathElCache.set(d, el)
  return el
}

export type PathPoint = { x: number; y: number; angle: number }

// getTotalLength walks the flattened path every time it is asked, and every
// query below needs it to clamp against. It cannot change for a given path
// string, so it is measured once. Emptied with pathElCache, whose elements it
// describes.
const totalLengthCache = new Map<string, number>()

function pathTotalLength(d: string): number {
  const cached = totalLengthCache.get(d)
  if (cached !== undefined) return cached
  const circle = circleForPath.get(d)
  const total = circle ? circle.length : (pathEl(d)?.getTotalLength() ?? 0)
  totalLengthCache.set(d, total)
  return total
}

/** The closed form, for the circles we minted ourselves. See circleForPath. */
function circlePointAtLength(c: CircleGeometry, length: number): PathPoint {
  const at = Math.max(0, Math.min(c.length, length))
  const theta = c.start + (c.dir * at) / c.r
  // Position is the circle; the tangent is its derivative, a quarter turn on,
  // pointing whichever way the parameterisation runs.
  return {
    x: c.cx + c.r * Math.cos(theta),
    y: c.cy + c.r * Math.sin(theta),
    angle: (Math.atan2(c.dir * Math.cos(theta), -c.dir * Math.sin(theta)) * 180) / Math.PI,
  }
}

/**
 * Point and tangent angle at a distance along the path, in the path's own user
 * units. Distance clamps to [0, length]; the angle comes from a short chord
 * around the point, in degrees, ready for a CSS rotate.
 */
export function pointAtLength(d: string, length: number): PathPoint | null {
  const circle = circleForPath.get(d)
  if (circle) return circlePointAtLength(circle, length)

  const el = pathEl(d)
  if (!el) return null
  const total = pathTotalLength(d)
  if (!total) return null
  const at = Math.max(0, Math.min(total, length))
  const p = el.getPointAtLength(at)
  const before = el.getPointAtLength(Math.max(0, at - 0.5))
  const after = el.getPointAtLength(Math.min(total, at + 0.5))
  return {
    x: p.x,
    y: p.y,
    angle: (Math.atan2(after.y - before.y, after.x - before.x) * 180) / Math.PI,
  }
}

/**
 * Many points along one path, in a single pass — the same answers as calling
 * pointAtLength in a loop, without repeating its per-call setup.
 *
 * A circle is answered in closed form, so a batch of any size costs nothing.
 * Any other path is resolved to its element and total length once for the whole
 * batch rather than once per point, and each point keeps its own ±0.5 chord for
 * the tangent — taking the tangent from neighbouring samples instead would be
 * cheaper still, but on the tightly-bending open curves the samples sit too far
 * apart for that and the run's box came out up to 3px off.
 */
export function samplePath(d: string, lengths: number[]): (PathPoint | null)[] {
  if (!lengths.length) return []
  const circle = circleForPath.get(d)
  if (circle) return lengths.map(l => circlePointAtLength(circle, l))

  const el = pathEl(d)
  if (!el) return lengths.map(() => null)
  const total = pathTotalLength(d)
  if (!total) return lengths.map(() => null)

  return lengths.map(l => {
    const at = Math.max(0, Math.min(total, l))
    const p = el.getPointAtLength(at)
    const before = el.getPointAtLength(Math.max(0, at - 0.5))
    const after = el.getPointAtLength(Math.min(total, at + 0.5))
    return {
      x: p.x,
      y: p.y,
      angle: (Math.atan2(after.y - before.y, after.x - before.x) * 180) / Math.PI,
    }
  })
}
