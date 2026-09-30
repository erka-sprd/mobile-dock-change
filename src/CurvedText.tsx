import { memo, useId } from "react"
import { curvedLayout } from "./textPath"

type CurvedTextProps = {
  text: string
  /** The baseline, as CE.SDK's `text/path` would carry it. */
  path: string
  fontSize: number
  fontFamily: string
  color: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  /**
   * Draw the baseline itself as a thin blue guide, the way CE.SDK's editor
   * shows the path a run is sitting on. On while the text is being edited, so
   * the curve being adjusted is visible; off in the finished artwork.
   */
  showPath?: boolean
}

/**
 * A text element laid on its baseline path — the rendering half of the
 * text-on-path mock (see lib/text-path.ts for the model it follows).
 *
 * Drawn with SVG <textPath>, which is the same primitive CE.SDK's renderer uses
 * conceptually: real glyphs in the element's own face, rotated along the curve,
 * not a picture of them.
 *
 * Sizing differs from CE.SDK on purpose. The engine sizes the block to the
 * path's bounding box and lets text longer than the path overrun it; here the
 * path is scaled to the text (times PATH_SLACK), so the word always sits on its
 * curve whatever its length — the behaviour that reads correctly in a prototype
 * where nobody is dragging block handles to fit a path.
 *
 * Everything lives in the path's own user units and is scaled by the viewBox →
 * width/height mapping, so one number (`scale`) relates the two spaces and the
 * font size is expressed back in user units.
 *
 * Memoized: the designer re-renders its whole canvas on every pointer move, and
 * this subtree is expensive to reconcile — laying glyphs on a path is real work
 * for the browser. All its props are primitives, so the default comparison is
 * exactly right, and a drag that only moves the wrapper never re-renders it.
 */
export const CurvedText = memo(function CurvedText({
  text,
  path,
  fontSize,
  fontFamily,
  color,
  bold,
  italic,
  underline,
  showPath = false,
}: CurvedTextProps) {
  // Colons are not valid in an XML id; useId emits ":r1:"-style values.
  const pathId = `textpath-${useId().replace(/:/g, "")}`

  // Shared with the edit caret (curvedLayout), so caret and glyphs can never
  // disagree about where the run sits. Null on the server's first paint or a
  // degenerate path: fall back to flat text rather than dividing by zero.
  const layout = curvedLayout(text, path, fontSize, fontFamily)
  if (!layout) {
    return <>{text}</>
  }
  const { scale, fontSizeUser, viewX, viewY } = layout
  const viewW = layout.width / scale
  const viewH = layout.height / scale

  // The run always sits at the middle of its baseline (textAnchor="middle" at
  // 50%). Where that lands is decided by which preset's path this is — each
  // arch position starts the circle half a turn from where its text should be.
  const drawPath = path

  return (
    <svg
      // Hook for the editor's pointer hit-testing: getScreenCTM() on this svg
      // maps client coords into path user units through every ancestor
      // transform (wrapper rotation, zoom) without any manual matrix work.
      data-curved-text="true"
      width={layout.width}
      height={layout.height}
      viewBox={`${viewX} ${viewY} ${viewW} ${viewH}`}
      // The element is measured and clipped by its parent; nothing here
      // should catch a pointer of its own.
      style={{ display: "block", overflow: "visible", pointerEvents: "none" }}
      aria-hidden="true"
    >
      <defs>
        <path id={pathId} d={drawPath} fill="none" />
      </defs>
      {showPath && (
        // The WHOLE path, not just the stretch under the run: it is the track
        // the text rides on, and CE.SDK draws it the same way. The element is
        // anchored to it rather than to its own box — see anchorDX in
        // curvedLayout — so the track holds still whatever the text does.
        //
        // Stroke width in user units (1/scale = 1px on screen) rather than
        // vector-effect: non-scaling-stroke, which behaves inconsistently once
        // the path is scaled this hard.
        <path d={drawPath} fill="none" stroke="#3355FF" strokeWidth={1 / scale} />
      )}
      <text
        fill={color}
        fontSize={fontSizeUser}
        fontFamily={`"${fontFamily}"`}
        fontWeight={bold ? 700 : 400}
        fontStyle={italic ? "italic" : "normal"}
        textDecoration={underline ? "underline" : "none"}
        textAnchor="middle"
      >
        <textPath href={`#${pathId}`} startOffset="50%">
          {text}
        </textPath>
      </text>
    </svg>
  )
})
