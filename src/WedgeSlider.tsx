/**
 * The wedge slider, ported from the main proto (ui/editor-bar/WedgeSlider.tsx)
 * with the parts the edit sheet uses: the wedge track, drag-relative handle,
 * optional jump-on-track-click and the percentage readout riding the thumb.
 *
 * Drag-relative: pressing the thumb does NOT change the value — only actual
 * pointer movement does. A native <input type="range"> jumps the value to
 * wherever you click, which felt wrong for the handle.
 */
import React, { useRef, useState } from "react";

type WedgeSliderProps = {
  min: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
  width?: number;
  /** Pressing bare track jumps the value there; presses on the thumb never jump. */
  jumpOnTrackClick?: boolean;
  /** Fires once the handle is let go — for owners that settle on release. */
  onCommit?: () => void;
  /** Show the value as a percentage above the handle (create-omat's mobile size panel). */
  showPercentage?: boolean;
};

/** Thickness of the wedge track at its right end, where it is fullest. */
const WEDGE_HEIGHT = 7;

/** The wedge: a point at the left opening to a full semicircular cap at the right. */
const wedgePath = (width: number) => {
  const r = WEDGE_HEIGHT / 2;
  const capCentre = Math.max(r, width - r);
  return [`M 0 ${r}`, `L ${capCentre} 0`, `A ${r} ${r} 0 0 1 ${capCentre} ${WEDGE_HEIGHT}`, "Z"].join(" ");
};

// Travel before a press counts as a drag, so a click doesn't register as one.
const DRAG_THRESHOLD_PX = 3;

// Thumb hit size along the drag axis: the 20px circle plus its 2px border on
// each side (box-content) = 24px across, so ±12px from the thumb's centre.
const THUMB_RADIUS = 12;

export function WedgeSlider({
  min,
  max,
  value,
  onChange,
  width = 140,
  jumpOnTrackClick = false,
  onCommit,
  showPercentage = false,
}: WedgeSliderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ start: number; length: number; startValue: number } | null>(null);

  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const percentage = ((value - min) / (max - min)) * 100;

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = trackRef.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    const rect = el.getBoundingClientRect();
    const length = rect.width;
    const pos = e.clientX;
    const fromMin = pos - rect.left;
    // The thumb's centre travels inset by its own radius at both ends (it is
    // laid out with left:% + translateX(-%)), so map through that same inset.
    const travel = length - THUMB_RADIUS * 2;
    const thumbCentre = THUMB_RADIUS + (travel * (value - min)) / (max - min);

    let startValue = value;
    // Jump only for presses on bare track — never within the thumb.
    if (jumpOnTrackClick && travel > 0 && Math.abs(fromMin - thumbCentre) > THUMB_RADIUS) {
      startValue = clamp(min + ((fromMin - THUMB_RADIUS) / travel) * (max - min));
      if (startValue !== value) onChange(startValue);
    }

    dragRef.current = { start: pos, length, startValue };
    setIsDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.length === 0) return;
    const deltaPx = e.clientX - d.start;
    if (Math.abs(deltaPx) < DRAG_THRESHOLD_PX && !isDragging) return;
    const next = clamp(d.startValue + (deltaPx / d.length) * (max - min));
    if (next !== value) onChange(next);
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (trackRef.current?.hasPointerCapture(e.pointerId)) {
      trackRef.current.releasePointerCapture(e.pointerId);
    }
    dragRef.current = null;
    setIsDragging(false);
    onCommit?.();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = (max - min) / 20;
    if (e.key === "ArrowUp" || e.key === "ArrowRight") {
      e.preventDefault();
      onChange(clamp(value + step));
    } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
      e.preventDefault();
      onChange(clamp(value - step));
    }
  };

  return (
    <div
      ref={trackRef}
      role="slider"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={handleKeyDown}
      style={{
        position: "relative",
        display: "flex",
        height: 24,
        cursor: "pointer",
        touchAction: "none",
        alignItems: "center",
        outline: "none",
        minWidth: width,
        width,
      }}
    >
      <svg
        style={{ pointerEvents: "none", position: "absolute" }}
        width={width}
        height={WEDGE_HEIGHT}
        fill="none"
        aria-hidden="true"
      >
        <path d={wedgePath(width)} fill="#DEDEDE" />
      </svg>
      <div
        style={{
          pointerEvents: "none",
          position: "absolute",
          left: `${percentage}%`,
          transform: `translateX(-${percentage}%)`,
        }}
      >
        <div
          style={{
            boxSizing: "content-box",
            width: 20,
            height: 20,
            borderRadius: 999,
            border: "2px solid #000",
            background: "#fff",
            transition: "box-shadow 0.3s",
            boxShadow: isDragging ? "0 0 0 6px rgba(0,0,0,0.1)" : "none",
          }}
        />
        {/* The readout create-omat puts above the handle on mobile: the value
            as a percentage of the range, in the display face, riding the thumb. */}
        {showPercentage && (
          <div
            style={{
              pointerEvents: "none",
              position: "absolute",
              bottom: "100%",
              left: "50%",
              transform: "translateX(-50%)",
            }}
          >
            <span
              className="font-outer-sans"
              style={{
                fontSize: 28,
                lineHeight: "36px",
                fontWeight: 900,
                whiteSpace: "nowrap",
                color: "#000",
                textTransform: "uppercase",
              }}
            >
              {Math.round(percentage)}%
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
