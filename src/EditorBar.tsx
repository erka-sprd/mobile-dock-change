/**
 * The objects editor bars, ported from the main proto (creatomat-prototype):
 * EditorBarShell + the mobile text bar + the design (graphic) bar.
 *
 * Same infrastructure as there — a 48px white pill floating at the top of the
 * canvas, centred, capped at the canvas width less 16px, scrolling
 * horizontally with a chevron at either end once its items overflow. One bar
 * per selection type, both drawn in the same shell so they cannot drift apart
 * in placement or in how they behave when squeezed.
 *
 * The proto's Tailwind classes are inline styles here (this project has no
 * Tailwind); the press states live in styles.css (.eb-item, .eb-arrow).
 */
import React, {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

/* ------------------------------------------------------------------------- *
 * Horizontal drag-scroll
 * ------------------------------------------------------------------------- */

/**
 * Scroll a horizontal strip by hand from touch, instead of leaving it to the
 * browser.
 *
 * On /scrollversion the app root and stage carry `touch-action: pan-y` so a
 * finger scrolls the page. iOS Safari intersects touch-action down the whole
 * ancestor chain, so a strip's own `pan-x` meets `pan-y` above it and nothing
 * is left — the strip could not be swiped at all. Driving scrollLeft from the
 * touch sidesteps the intersection; `touch-action: none` on the strip keeps the
 * browser from also trying. Taps are untouched: nothing is prevented until the
 * finger actually travels sideways, and a release carries on as a short flick.
 */
export function useTouchDragScrollX(ref: React.RefObject<HTMLElement>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let lastX = 0;
    let lastT = 0;
    let velocity = 0; // px per ms
    let dragging = false;
    let decided = false; // whether this touch is a sideways drag or not
    let raf = 0;

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      cancelAnimationFrame(raf);
      startX = lastX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      startLeft = el.scrollLeft;
      lastT = performance.now();
      velocity = 0;
      dragging = false;
      decided = false;
    };
    const onMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const x = e.touches[0].clientX;
      const dx = x - startX;
      const dy = e.touches[0].clientY - startY;
      if (!decided) {
        if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
        decided = true;
        dragging = Math.abs(dx) >= Math.abs(dy);
      }
      if (!dragging) return;
      e.preventDefault();
      el.scrollLeft = startLeft - dx;
      const now = performance.now();
      const dt = now - lastT;
      if (dt > 0) velocity = (x - lastX) / dt;
      lastX = x;
      lastT = now;
    };
    const onEnd = () => {
      if (!dragging) return;
      dragging = false;
      // A short flick: carry the release speed on, decaying each frame.
      let v = velocity * 16; // px per ~frame
      const step = () => {
        if (Math.abs(v) < 0.5) return;
        el.scrollLeft -= v;
        v *= 0.92;
        raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [ref]);
}

/* ------------------------------------------------------------------------- *
 * Shell
 * ------------------------------------------------------------------------- */

function Chevron({ rotate }: { rotate: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      aria-hidden="true"
      style={{ transform: `rotate(${rotate}deg)` }}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M5.29289 8.29289C5.65338 7.93241 6.22061 7.90468 6.6129 8.2097L6.70711 8.29289L12 13.585L17.2929 8.29289C17.6534 7.93241 18.2206 7.90468 18.6129 8.2097L18.7071 8.29289C19.0676 8.65338 19.0953 9.22061 18.7903 9.6129L18.7071 9.70711L12.7071 15.7071C12.3466 16.0676 11.7794 16.0953 11.3871 15.7903L11.2929 15.7071L5.29289 9.70711C4.90237 9.31658 4.90237 8.68342 5.29289 8.29289Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function EditorBarShell({
  children,
  ...rest
}: { children: React.ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  useTouchDragScrollX(scrollRef);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 1);
  }, []);

  // Re-check when the items change, not only on mount: a bar gains and loses
  // controls as the selection changes, and that alone can make it overflow.
  useEffect(() => {
    updateScrollState();
  }, [children, updateScrollState]);

  useEffect(() => {
    window.addEventListener("resize", updateScrollState);
    return () => window.removeEventListener("resize", updateScrollState);
  }, [updateScrollState]);

  const arrow = (dir: "left" | "right") => (
    <button
      type="button"
      aria-label={dir === "left" ? "Scroll left" : "Scroll right"}
      className="eb-arrow"
      onClick={() =>
        scrollRef.current?.scrollBy({
          left: dir === "left" ? -120 : 120,
          behavior: "smooth",
        })
      }
      style={{
        position: "absolute",
        top: 0,
        zIndex: 10,
        display: "flex",
        height: "100%",
        flexShrink: 0,
        cursor: "pointer",
        alignItems: "center",
        background: "#fff",
        border: "none",
        padding: 0,
        // Explicit: iOS paints button text (and so currentColor) blue.
        color: "#111",
        ...(dir === "left"
          ? { left: -2, borderRadius: "999px 0 0 999px", borderRight: "1px solid #e5e5e5" }
          : { right: -2, borderRadius: "0 999px 999px 0", borderLeft: "1px solid #e5e5e5" }),
      }}
    >
      <span style={{ padding: 8, display: "flex" }}>
        <Chevron rotate={dir === "left" ? 90 : -90} />
      </span>
    </button>
  );

  return (
    <div
      {...rest}
      // The stage deselects on any touch (onEditorTouchStart) — the bar sits
      // inside it, so its own touches must never reach the stage.
      onTouchStart={e => e.stopPropagation()}
      onTouchMove={e => e.stopPropagation()}
      onTouchEnd={e => e.stopPropagation()}
      style={{
        position: "absolute",
        // One margin all round: 12px off the top and, via the width cap,
        // 12px off either side once the bar is wide enough to meet it.
        top: 12,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 20,
        display: "flex",
        height: 48,
        maxWidth: "calc(100% - 24px)",
        alignItems: "center",
        overflow: "hidden",
        borderRadius: 999,
        background: "#fff",
        boxShadow: "0 1px 4px rgba(0,0,0,0.10)",
      }}
    >
      {canScrollLeft && arrow("left")}
      <div
        ref={scrollRef}
        // Named so anything outside can find the scroller itself rather than
        // guess at a class — same hook the main proto exposes.
        data-editor-bar-scroller="true"
        onScroll={updateScrollState}
        // .eb-scroller keeps every child at its natural width (flex children
        // shrink by default) so overflow goes to the scroller, which is what
        // the chevrons then drive. It also hides the scrollbar.
        className="eb-scroller"
        style={{
          display: "flex",
          height: "100%",
          minWidth: 0,
          alignItems: "center",
          gap: 8,
          overflowX: "auto",
          overflowY: "hidden",
          // No scroll-behavior: smooth here — it would animate every scrollLeft
          // the drag writes, and the strip would lag behind the finger. The
          // chevrons ask for smooth themselves.
          padding: 6,
          // Scrolled by useTouchDragScrollX, not the browser (see there).
          touchAction: "none",
        }}
      >
        {children}
      </div>
      {canScrollRight && arrow("right")}
    </div>
  );
}

/* ------------------------------------------------------------------------- *
 * Icons — the same glyphs the main proto inlines (components/mobile/icons.tsx
 * and ui/editor-bar/GraphicEditorBar.tsx).
 * ------------------------------------------------------------------------- */

export const DuplicateIcon = () => (
  <svg viewBox="0 0 16 16" width="20" height="20" fill="none" aria-hidden="true">
    <path
      d="M9.33691 2C10.4019 2 11.273 2.83212 11.334 3.88184L11.3369 4V4.66602H12.0059C13.1101 4.66618 14.0055 5.56183 14.0059 6.66602V12C14.0057 13.1043 13.1102 13.9998 12.0059 14H6.67188C5.56774 13.9996 4.67206 13.1042 4.67188 12V11.333H4.00391C2.93879 11.333 2.06767 10.5001 2.00684 9.4502L2.00391 9.33301V4C2.00391 2.93501 2.83605 2.06395 3.88574 2.00293L4.00391 2H9.33691ZM6.6709 6C6.30297 6.00019 6.00407 6.29906 6.00391 6.66699V12C6.00391 12.3681 6.30287 12.6668 6.6709 12.667H12.0039C12.3721 12.667 12.6709 12.3682 12.6709 12V6.66699C12.6707 6.29894 12.372 6 12.0039 6H6.6709ZM4.00391 3.33301C3.66206 3.33301 3.38036 3.59037 3.3418 3.92188L3.33691 4V9.33301C3.33691 9.67485 3.59428 9.95655 3.92578 9.99512L4.00391 10H4.67188V6.66602C4.6722 5.56196 5.56783 4.66639 6.67188 4.66602H10.0039V4C10.0039 3.65823 9.74643 3.37656 9.41504 3.33789L9.33691 3.33301H4.00391Z"
      fill="currentColor"
    />
  </svg>
);

export const DeleteIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M15.9945 3.85074C15.9182 2.81588 15.0544 2 14 2H10L9.85074 2.00549C8.81588 2.08183 8 2.94564 8 4V6H5.01169H4.99054H4L3.88338 6.00673C3.38604 6.06449 3 6.48716 3 7C3 7.55228 3.44772 8 4 8H4.07987L5.00345 19.083L5.00819 19.2507C5.09634 20.7511 6.40232 22 8 22H16L16.1763 21.9949C17.7511 21.9037 19 20.5977 19 19L19.9199 8H20L20.1166 7.99327C20.614 7.93551 21 7.51284 21 7C21 6.44772 20.5523 6 20 6H16V4L15.9945 3.85074ZM14 6V4H10V6H14ZM9 8H6.08649L7 19C7 19.5128 7.38604 19.9355 7.88338 19.9933L8 20H16C16.5155 20 16.9398 19.61 16.9969 19.0414L17.0035 18.917L17.9132 8H15H9ZM10 10C10.5128 10 10.9355 10.386 10.9933 10.8834L11 11V17C11 17.5523 10.5523 18 10 18C9.48716 18 9.06449 17.614 9.00673 17.1166L9 17V11C9 10.4477 9.44772 10 10 10ZM14.9933 10.8834C14.9355 10.386 14.5128 10 14 10C13.4477 10 13 10.4477 13 11V17L13.0067 17.1166C13.0645 17.614 13.4872 18 14 18C14.5523 18 15 17.5523 15 17V11L14.9933 10.8834Z"
      fill="currentColor"
    />
  </svg>
);

// create-omat's keyboard glyph, the text bar's Write item.
export const KeyboardIcon = () => (
  <svg width="17" height="12" viewBox="0 0 17 12" fill="none" aria-hidden="true">
    <path
      d="M13 0C15.2091 0 17 1.79086 17 4V8C17 10.14 15.3194 11.8879 13.2061 11.9951L13 12H4L3.79395 11.9951C1.7488 11.8913 0.108652 10.2512 0.00488281 8.20605L0 8V4C0 1.79086 1.79086 8.0532e-09 4 0H13ZM4 1.5C2.61929 1.5 1.5 2.61929 1.5 4V8C1.5 9.38071 2.61929 10.5 4 10.5H13C14.3807 10.5 15.5 9.38071 15.5 8V4C15.5 2.61929 14.3807 1.5 13 1.5H4ZM12.9043 6.85742C13.3775 6.85742 13.7615 7.24067 13.7617 7.71387C13.7617 8.18725 13.3777 8.57129 12.9043 8.57129H4.0957C3.62232 8.57129 3.23828 8.18725 3.23828 7.71387C3.23851 7.24067 3.62246 6.85742 4.0957 6.85742H12.9043ZM4.09961 3.42871C4.57546 3.42871 4.96178 3.8396 4.96191 4.34668C4.96191 4.85388 4.57554 5.26562 4.09961 5.26562C3.62379 5.26549 3.23828 4.8538 3.23828 4.34668C3.23841 3.83968 3.62387 3.42885 4.09961 3.42871ZM6.97266 3.42871C7.44835 3.42891 7.83385 3.83972 7.83398 4.34668C7.83398 4.85376 7.44843 5.26543 6.97266 5.26562C6.49672 5.26562 6.11035 4.85388 6.11035 4.34668C6.11048 3.8396 6.49681 3.42871 6.97266 3.42871ZM9.84473 3.42871C10.3206 3.42871 10.7059 3.8396 10.7061 4.34668C10.7061 4.85388 10.3207 5.26562 9.84473 5.26562C9.36882 5.2656 8.9834 4.85386 8.9834 4.34668C8.98353 3.83962 9.3689 3.42874 9.84473 3.42871ZM12.7168 3.42871C13.1926 3.42871 13.579 3.8396 13.5791 4.34668C13.5791 4.85388 13.1927 5.26562 12.7168 5.26562C12.2411 5.26537 11.8555 4.85372 11.8555 4.34668C11.8556 3.83976 12.2412 3.42897 12.7168 3.42871Z"
      fill="currentColor"
    />
  </svg>
);

// create-omat's `font` glyph, the text bar's Font item.
const FontIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M5.87717 21C5.22359 21 4.68368 20.8657 4.25743 20.5972C3.83118 20.3357 3.51505 20.0177 3.30903 19.6431C3.10301 19.2686 3 18.9117 3 18.5724C3 18.2827 3.06394 18.0141 3.19181 17.7668C3.31258 17.5124 3.53636 17.3074 3.86315 17.1519C4.18994 16.9965 4.65881 16.9187 5.26977 16.9187C5.22004 17.1802 5.18807 17.4346 5.17386 17.682C5.15966 17.9223 5.15255 18.1449 5.15255 18.3498C5.15255 18.8021 5.2307 19.1731 5.38699 19.4629C5.55038 19.7597 5.85941 19.9258 6.31408 19.9611C6.6977 19.9611 7.05291 19.7562 7.3797 19.3463C7.71359 18.9364 8.02617 18.3852 8.31744 17.6926C8.60871 17 8.87867 16.2261 9.12731 15.371C9.37596 14.5088 9.61039 13.629 9.83062 12.7314L8.91419 12.9965C8.87867 13.0035 8.765 12.9929 8.57319 12.9647C8.38848 12.9364 8.29613 12.8021 8.29613 12.5618C8.29613 12.2226 8.35652 11.9965 8.47729 11.8834C8.60516 11.7703 8.72593 11.6926 8.8396 11.6502C8.98168 11.5795 9.16994 11.5018 9.40437 11.417C9.63881 11.3251 9.90166 11.2332 10.1929 11.1413C10.4629 9.9894 10.708 8.95053 10.9282 8.02474C11.1484 7.09894 11.3545 6.4735 11.5463 6.14841C11.9228 5.59011 12.3313 5.17314 12.7717 4.89753C12.7007 4.89753 12.6225 4.89399 12.5373 4.88693C12.452 4.87986 12.3703 4.87633 12.2922 4.87633C11.4397 4.87633 10.6263 4.9788 9.85193 5.18375C9.07758 5.38163 8.38848 5.64664 7.78463 5.9788C7.18078 6.30389 6.7048 6.66784 6.3567 7.07067C6.0086 7.46643 5.83455 7.86219 5.83455 8.25795C5.83455 8.64664 5.96597 9.01767 6.22883 9.37102C6.49878 9.72438 6.55562 9.59364 6.8333 10.0636C6.8333 10.2615 6.81554 10.4912 6.78002 10.7527C6.7516 11.0071 6.71253 11.2367 6.6628 11.4417C6.61307 11.6466 6.6628 11.736 6.6628 11.8834C6.10095 11.8551 5.19518 11.0212 4.66237 10.3569C4.12956 9.69258 3.86315 9.01413 3.86315 8.32155C3.86315 7.45936 4.18284 6.66078 4.82221 5.9258C5.46158 5.18375 6.37801 4.56537 7.57151 4.07067C8.765 3.5689 10.1929 3.25088 11.8553 3.11661C12.5444 3.06714 13.2655 3.03534 14.0185 3.0212C14.7715 3.00707 15.5423 3 16.3309 3C16.8566 3 17.3574 3.00353 17.8334 3.0106C18.3165 3.01767 21.524 3.0212 22 3.0212L20.4975 5.25795C19.8013 5.25795 16.3984 5.21908 15.7448 5.14134C15.0983 5.05654 14.427 4.9894 13.7308 4.93993C13.5319 5.94346 13.3472 6.9258 13.1767 7.88693C13.0133 8.84806 12.8499 9.77385 12.6865 10.6643C12.9564 10.629 13.2335 10.6042 13.5177 10.5901C13.8089 10.5689 14.1073 10.5583 14.4128 10.5583C15.1374 10.5583 15.9153 10.5795 16.7465 10.6219C17.0093 10.6219 17.1408 10.7385 17.1408 10.9717C17.1408 11.212 17.0342 11.4806 16.8211 11.7774C16.608 12.0671 16.3558 12.212 16.0645 12.212C15.4109 12.212 14.7786 12.2155 14.1677 12.2226C13.5638 12.2297 12.96 12.2615 12.3561 12.318C12.0862 13.6113 11.7807 14.788 11.4397 15.8481C11.1058 16.9081 10.6938 17.8233 10.2036 18.5936C9.72051 19.364 9.12731 19.9576 8.424 20.3746C7.7278 20.7915 6.87886 21 5.87717 21Z"
      fill="currentColor"
    />
  </svg>
);

// create-omat's `fontTextSize` glyph — the "A" of the text-size icon.
const FontTextSizeGlyph = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M11.5466 2.90231C11.3971 2.65486 11.1276 2.5 10.8333 2.5H9.16667L9.0637 2.50636C8.759 2.54419 8.49617 2.748 8.38639 3.04073L3.58917 15.8333H3.33333L3.23615 15.8389C2.8217 15.8871 2.5 16.2393 2.5 16.6667C2.5 17.1269 2.8731 17.5 3.33333 17.5H4.14719C4.16012 17.5003 4.17302 17.5003 4.18589 17.5H5.83333L5.93052 17.4944C6.34497 17.4463 6.66667 17.094 6.66667 16.6667C6.66667 16.2064 6.29357 15.8333 5.83333 15.8333H5.36917L6.30667 13.3333H11.0172L12.0756 15.8333H11.6667L11.5695 15.8389C11.155 15.8871 10.8333 16.2393 10.8333 16.6667C10.8333 17.1269 11.2064 17.5 11.6667 17.5H13.3148C13.3274 17.5003 13.34 17.5003 13.3526 17.5H16.6484C16.6608 17.5003 16.6733 17.5003 16.6858 17.5H17.5L17.5972 17.4944C18.0116 17.4463 18.3333 17.094 18.3333 16.6667C18.3333 16.2064 17.9602 15.8333 17.5 15.8333H17.2117L11.5968 2.99932L11.5466 2.90231ZM15.3924 15.8333L10.2875 4.16667H9.74417L9.3694 5.16605L13.8855 15.8333H15.3924ZM8.51927 7.43305L6.93167 11.6667H10.3116L8.51927 7.43305Z"
      fill="currentColor"
    />
  </svg>
);

// create-omat's `text-size`: the up/down arrow beside the A.
const TextSizeIcon = () => (
  <span style={{ display: "inline-flex", height: 20, alignItems: "flex-start" }} aria-hidden="true">
    <span style={{ marginTop: 2, display: "flex" }}>
      <svg width="7" height="9" viewBox="0 0 7 14" fill="none">
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M2.88008 0.263438C3.21186 -0.0863109 3.77101 -0.0863562 4.11152 0.254648L6.73066 2.8777C7.07117 3.20994 7.07114 3.76911 6.73066 4.11012H6.72188C6.55608 4.26741 6.32961 4.36391 6.10274 4.36402L6.12031 4.3816C5.88472 4.38151 5.65825 4.28497 5.50117 4.1277L4.37422 2.99391V11.0125L5.5002 9.88062C5.84068 9.53111 6.39026 9.53109 6.73945 9.88062C7.07994 10.2216 7.07988 10.7721 6.73945 11.1218L4.12031 13.7459C4.08097 13.7832 4.03778 13.8165 3.99238 13.8464C3.85218 13.9428 3.68305 13.9997 3.50117 13.9998C3.45707 13.9998 3.41341 13.9955 3.37031 13.989C3.30881 13.9799 3.24992 13.9642 3.19356 13.9431C3.07534 13.8994 2.9673 13.8322 2.88106 13.7459L0.261915 11.1228C-0.0870628 10.7731 -0.0872212 10.2225 0.260938 9.8816C0.601456 9.53185 1.15192 9.53175 1.50117 9.88062L2.62813 11.0134V2.99488L1.50215 4.1277C1.1529 4.4687 0.602432 4.4687 0.261915 4.1277C-0.0870699 3.77799 -0.0872133 3.22743 0.260938 2.88648L2.88008 0.263438Z"
          fill="currentColor"
        />
      </svg>
    </span>
    <FontTextSizeGlyph />
  </span>
);

// create-omat's `text-format`: a bold B beside three alignment rules.
const TextFormatIcon = () => (
  <svg width="27" height="16" viewBox="0 0 31 20" fill="none" aria-hidden="true">
    <path
      d="M10.8218 2.08887C13.2931 2.08889 15.2962 4.09221 15.2964 6.56348C15.2964 7.76178 14.8241 8.84892 14.0571 9.65234C15.3922 10.4267 16.2914 11.87 16.2915 13.5244C16.2915 15.9252 14.4004 17.8841 12.0269 17.9941L11.8159 17.999H4.85498C4.34517 17.9989 3.92515 17.6155 3.86768 17.1211L3.86084 17.0049V3.08301C3.86099 2.53403 4.306 2.08902 4.85498 2.08887H10.8218ZM10.8218 11.0391H5.8501V16.0107H11.8159C13.1339 16.0107 14.213 14.9851 14.2974 13.6885L14.3022 13.5244C14.3022 12.2065 13.2766 11.1283 11.98 11.0439L11.8159 11.0381H10.8599C10.8472 11.0382 10.8345 11.0391 10.8218 11.0391ZM5.8501 9.0498H10.8218C12.1948 9.0498 13.3081 7.93648 13.3081 6.56348C13.3079 5.19062 12.1947 4.07812 10.8218 4.07812H5.8501V9.0498Z"
      fill="currentColor"
    />
    <rect x="18.8608" y="3" width="9" height="2" rx="1" fill="currentColor" />
    <rect x="18.8608" y="9" width="5" height="2" rx="1" fill="currentColor" />
    <rect x="18.8608" y="15" width="9" height="2" rx="1" fill="currentColor" />
  </svg>
);

// create-omat's ColorIcon: the current text colour as a ringed dot, or the
// rainbow wheel while the colour is still untouched.
const ColorDotIcon = ({ color, isDefault }: { color: string; isDefault?: boolean }) => {
  if (isDefault) {
    return (
      <span
        aria-hidden="true"
        style={{
          position: "relative",
          display: "flex",
          width: 16,
          height: 16,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 999,
          background:
            "conic-gradient(from 90deg, rgba(43, 113, 247, 1) 0deg, rgba(254, 48, 195, 1) 83.07deg, rgba(254, 28, 31, 1) 157.5deg, rgba(244, 245, 71, 1) 240.57deg, rgba(1, 241, 87, 1) 294.23deg, rgba(102, 102, 102, 1) 360deg)",
        }}
      >
        <span style={{ width: 10, height: 10, borderRadius: 999, background: "#fff" }} />
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      style={{
        width: 16,
        height: 16,
        flexShrink: 0,
        borderRadius: 999,
        boxShadow: "0 0 0 1px #000",
        background: color,
      }}
    />
  );
};

/* ------------------------------------------------------------------------- *
 * CurvedLabel — the Curve item's own label, a word set on an upward arc so
 * the button is its own preview of what it does. Ported whole from the main
 * proto (ui/editor-bar/index.tsx), geometry and all.
 * ------------------------------------------------------------------------- */

/* The label's fixed proportions; everything else is derived from the word. */
const LABEL_SAGITTA = 5; // how far the arc lifts at its middle
const LABEL_BASELINE = 19; // where its ends sit in the box
const LABEL_PAD = 3; // clear space either side of the arc
const LABEL_HEIGHT = 25;
const LABEL_RULE_GAP = 4; // the rule rides this far inside the baseline
const LABEL_SLACK = 5; // arc given to the word beyond its own width
const LABEL_MIN_CHORD = 24;

/** One shared context — the label only ever measures a single short word. */
let labelCtx: CanvasRenderingContext2D | null = null;

function labelGeometry(advance: number) {
  const c = Math.max(LABEL_MIN_CHORD, advance + LABEL_SLACK);
  const r = (c * c) / 4 / (2 * LABEL_SAGITTA) + LABEL_SAGITTA / 2;
  const width = c + LABEL_PAD * 2;
  const cx = width / 2;
  const cy = LABEL_BASELINE + r - LABEL_SAGITTA;
  const half = Math.asin(Math.min(1, c / 2 / r));
  const rr = r - LABEL_RULE_GAP;
  const rx = rr * Math.sin(half);
  const ry = cy - rr * Math.cos(half);
  return {
    width,
    arc: `M ${LABEL_PAD} ${LABEL_BASELINE} A ${r} ${r} 0 0 1 ${LABEL_PAD + c} ${LABEL_BASELINE}`,
    rule: `M ${cx - rx} ${ry} A ${rr} ${rr} 0 0 1 ${cx + rx} ${ry}`,
  };
}

export function CurvedLabel({ text = "Curve" }: { text?: string }) {
  // useId yields ":r1:"-style values; colons are not valid in an XML id.
  const pathId = `curve-${useId().replace(/:/g, "")}`;
  const textRef = useRef<SVGTextElement>(null);
  // A close estimate for the first paint; the measurement below replaces it
  // before the browser gets to draw, so the estimate is never seen.
  const [chord, setChord] = useState(() => text.length * 7);

  useLayoutEffect(() => {
    const node = textRef.current;
    if (!node) return;
    if (!labelCtx) labelCtx = document.createElement("canvas").getContext("2d");
    if (!labelCtx) return;
    // Read the face off the element rather than naming it here: it is
    // inherited from the button, and the bar is free to change it.
    const style = getComputedStyle(node);
    labelCtx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    setChord(labelCtx.measureText(text).width);
  }, [text]);

  const { width, arc, rule } = labelGeometry(chord);

  return (
    // -2px on the glyph only: the arc sits low in its own box, and lifting the
    // box would move the button.
    <svg
      width={width}
      height={LABEL_HEIGHT}
      viewBox={`0 0 ${width} ${LABEL_HEIGHT}`}
      aria-hidden="true"
      style={{ position: "relative", top: -2 }}
    >
      <defs>
        <path id={pathId} d={arc} fill="none" />
      </defs>
      <text
        ref={textRef}
        fill="currentColor"
        fontSize="12"
        fontWeight="600"
        fontFamily="inherit"
        textAnchor="middle"
      >
        <textPath href={`#${pathId}`} startOffset="50%">
          {text}
        </textPath>
      </text>
      <path d={rule} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/* ------------------------------------------------------------------------- *
 * The bars
 * ------------------------------------------------------------------------- */

const DIVIDER_STYLE: React.CSSProperties = {
  margin: "-6px 0",
  width: 1,
  flexShrink: 0,
  alignSelf: "stretch",
  background: "#e9e9e9",
};

export type MobileEditorBarPanel = "Font" | "Format" | "Size" | "Curve" | "Color";

type MobileEditorBarProps = {
  show: boolean;
  /** Current text colour, drawn in the Color item. */
  color: string;
  /** False until the shopper picks a colour — shows the rainbow wheel. */
  colorSet: boolean;
  onWrite: () => void;
  onPanel: (panel: MobileEditorBarPanel) => void;
  onDuplicate: () => void;
  onDelete: () => void;
};

// The floating bar create-omat shows on the canvas the moment a text block is
// selected on mobile. Same shell as the design bar it sits beside: items are
// icon + label pills with hairline separators, duplicate/delete close the row.
export function MobileEditorBar({
  show,
  color,
  colorSet,
  onWrite,
  onPanel,
  onDuplicate,
  onDelete,
}: MobileEditorBarProps) {
  if (!show) return null;

  const line = <div style={DIVIDER_STYLE} />;
  return (
    <EditorBarShell data-mobile-editor-bar="true">
      <>
        <button type="button" onClick={onWrite} className="eb-item">
          <KeyboardIcon />
          Write
        </button>
        {line}
        <button type="button" onClick={() => onPanel("Font")} className="eb-item">
          <FontIcon />
          Font
        </button>
        {line}
        <button type="button" onClick={() => onPanel("Format")} className="eb-item">
          <TextFormatIcon />
          Format
        </button>
        {line}
        <button type="button" onClick={() => onPanel("Size")} className="eb-item">
          <TextSizeIcon />
          Size
        </button>
        {line}
        <button type="button" onClick={() => onPanel("Color")} className="eb-item">
          <ColorDotIcon color={color} isDefault={!colorSet} />
          Color
        </button>
        {line}
        <button
          type="button"
          aria-label="Curve text"
          onClick={() => onPanel("Curve")}
          className="eb-item"
        >
          <CurvedLabel />
        </button>
        {line}
        <button type="button" aria-label="Duplicate text" onClick={onDuplicate} className="eb-item">
          <DuplicateIcon />
        </button>
        <button
          type="button"
          aria-label="Delete text"
          onClick={onDelete}
          className="eb-item"
          style={{ color: "#DC2626" }}
        >
          <DeleteIcon />
        </button>
      </>
    </EditorBarShell>
  );
}

/* --- Design (graphic) bar icons --- */

const ShapeIcon = () => (
  <svg viewBox="0 0 16 16" width="20" height="20" fill="none" aria-hidden="true">
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M6 8.6661C6.73616 8.6661 7.33266 9.26303 7.33301 9.99911V12.6661C7.33301 13.4025 6.73638 13.9991 6 13.9991H3.33301C2.59678 13.9989 2 13.4024 2 12.6661V9.99911C2.00035 9.26314 2.59699 8.66628 3.33301 8.6661H6ZM11.334 8.6661C12.8063 8.66645 13.9998 9.8607 14 11.3331C13.9998 12.8055 12.8063 13.9988 11.334 13.9991C9.86133 13.9991 8.66717 12.8057 8.66699 11.3331C8.66717 9.86049 9.86133 8.6661 11.334 8.6661ZM3.33301 12.6661H6V9.99911H3.33301V12.6661ZM11.334 9.99911C10.5977 9.99911 10.0002 10.5969 10 11.3331C10.0002 12.0693 10.5977 12.6661 11.334 12.6661C12.07 12.6658 12.6668 12.0691 12.667 11.3331C12.6668 10.5971 12.07 9.99946 11.334 9.99911ZM7.4209 1.66903C7.67686 1.22133 8.32218 1.22132 8.57812 1.66903L11.2451 6.33602C11.4987 6.7804 11.1778 7.3331 10.666 7.3331H5.33301C4.82158 7.33278 4.50055 6.78025 4.75391 6.33602L7.4209 1.66903ZM6.48145 6.00009H9.5166L7.99902 3.34384L6.48145 6.00009Z"
      fill="currentColor"
    />
  </svg>
);

const GrainIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M7.5 4.5C7.5 3.39543 8.39543 2.5 9.5 2.5C10.6046 2.5 11.5 3.39543 11.5 4.5C11.5 5.60457 10.6046 6.5 9.5 6.5C8.39543 6.5 7.5 5.60457 7.5 4.5ZM2.5 9.5C2.5 8.39543 3.39543 7.5 4.5 7.5C5.60457 7.5 6.5 8.39543 6.5 9.5C6.5 10.6046 5.60457 11.5 4.5 11.5C3.39543 11.5 2.5 10.6046 2.5 9.5ZM9.5 12.5C8.39543 12.5 7.5 13.3954 7.5 14.5C7.5 15.6046 8.39543 16.5 9.5 16.5C10.6046 16.5 11.5 15.6046 11.5 14.5C11.5 13.3954 10.6046 12.5 9.5 12.5ZM2.5 19.5C2.5 18.3954 3.39543 17.5 4.5 17.5C5.60457 17.5 6.5 18.3954 6.5 19.5C6.5 20.6046 5.60457 21.5 4.5 21.5C3.39543 21.5 2.5 20.6046 2.5 19.5ZM14.5 7.5C13.3954 7.5 12.5 8.39543 12.5 9.5C12.5 10.6046 13.3954 11.5 14.5 11.5C15.6046 11.5 16.5 10.6046 16.5 9.5C16.5 8.39543 15.6046 7.5 14.5 7.5ZM17.5 4.5C17.5 3.39543 18.3954 2.5 19.5 2.5C20.6046 2.5 21.5 3.39543 21.5 4.5C21.5 5.60457 20.6046 6.5 19.5 6.5C18.3954 6.5 17.5 5.60457 17.5 4.5ZM14.5 17.5C13.3954 17.5 12.5 18.3954 12.5 19.5C12.5 20.6046 13.3954 21.5 14.5 21.5C15.6046 21.5 16.5 20.6046 16.5 19.5C16.5 18.3954 15.6046 17.5 14.5 17.5ZM17.5 14.5C17.5 13.3954 18.3954 12.5 19.5 12.5C20.6046 12.5 21.5 13.3954 21.5 14.5C21.5 15.6046 20.6046 16.5 19.5 16.5C18.3954 16.5 17.5 15.6046 17.5 14.5Z"
      fill="currentColor"
    />
  </svg>
);

const FlipIcon = () => (
  <svg viewBox="0 0 16 16" width="20" height="20" fill="none" aria-hidden="true">
    <path
      d="M8.00062 1.33325C8.34238 1.33339 8.62421 1.59066 8.66273 1.92212L8.66663 2.00024V14.0002C8.66646 14.3682 8.36858 14.6661 8.00062 14.6663C7.65873 14.6663 7.37702 14.409 7.33851 14.0774L7.33363 14.0002V2.00024C7.33363 1.63205 7.63243 1.33325 8.00062 1.33325ZM5.48695 4.01782L5.55824 4.03931L5.59339 4.05298L5.63148 4.07056L5.69886 4.10962L5.76038 4.15454L5.81507 4.2063L5.8639 4.26196L5.90492 4.32349L5.9391 4.38794L5.96644 4.4563L5.98499 4.52661L5.99574 4.58911L6.00062 4.66724V11.3333C6.00054 11.6749 5.74302 11.9566 5.41175 11.9954L5.33363 12.0002H2.00062C1.53116 12.0002 1.21708 11.5318 1.37367 11.1057L1.40394 11.0354L4.73695 4.36841L4.77601 4.30103L4.82093 4.2395L4.87269 4.18481L4.92933 4.13696L4.98988 4.09497L5.05433 4.06079L5.12269 4.03442L5.193 4.01489L5.26527 4.00317C5.33826 3.99563 5.41343 4.00038 5.48695 4.01782ZM10.7448 4.00513L10.82 4.01782L10.8922 4.03931L10.9606 4.0686L11.025 4.10376L11.0846 4.14673L11.1383 4.19556L11.1871 4.25024L11.2301 4.30981L11.2633 4.36841L14.5973 11.0354C14.8067 11.455 14.5285 11.9456 14.0778 11.9963L14.0006 12.0002H10.6676C10.3259 12.0002 10.0442 11.7427 10.0055 11.4114L10.0006 11.3333L10.0016 4.63599L10.0055 4.58911L10.0182 4.51392L10.0397 4.44263L10.068 4.37427L10.1041 4.30981L10.1471 4.25024L10.1959 4.19556L10.2506 4.14673L10.3102 4.10376L10.3707 4.06958C10.3961 4.05727 10.4188 4.04764 10.442 4.03931L10.5133 4.01782C10.5623 4.00619 10.6125 4.00062 10.6618 4.00024L10.7448 4.00513ZM3.07874 10.6672H4.66663V7.49048L3.07874 10.6672ZM11.3336 10.6672H12.9215L11.3336 7.49146V10.6672Z"
      fill="currentColor"
    />
  </svg>
);

const CopyIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
    <path
      d="M18 3C19.6569 3 21 4.34315 21 6V14C21 15.6569 19.6569 17 18 17H17V18C17 19.5975 15.7513 20.9036 14.1768 20.9951L14 21H6C4.40248 21 3.09636 19.7513 3.00488 18.1768L3 18V10C3 8.40248 4.24866 7.09636 5.82324 7.00488L6 7H7V6C7 4.34315 8.34315 3 10 3H18ZM6 9C5.48716 9 5.0646 9.38645 5.00684 9.88379L5 10V18C5 18.5128 5.38645 18.9354 5.88379 18.9932L6 19H14C14.5128 19 14.9354 18.6135 14.9932 18.1162L15 18V17H10C8.34315 17 7 15.6569 7 14V9H6ZM10 5C9.44772 5 9 5.44772 9 6V14C9 14.5523 9.44772 15 10 15H18C18.5523 15 19 14.5523 19 14V6C19 5.44772 18.5523 5 18 5H10Z"
      fill="currentColor"
    />
  </svg>
);

const TrashIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
    <path
      d="M14 2C15.0543 2 15.9177 2.81581 15.9941 3.85059L16 4V6H20C20.5523 6 21 6.44772 21 7C21 7.51284 20.6136 7.9354 20.1162 7.99316L20 8H19.9199L19 19C19 20.5975 17.7513 21.9036 16.1768 21.9951L16 22H8C6.4024 22 5.09608 20.7512 5.00781 19.251L5.00391 19.083L4.08008 8H4C3.44772 8 3 7.55228 3 7C3 6.48716 3.38645 6.0646 3.88379 6.00684L4 6H8V4C8 2.9457 8.81581 2.08229 9.85059 2.00586L10 2H14ZM7 19C7 19.5128 7.38645 19.9354 7.88379 19.9932L8 20H16C16.5155 20 16.94 19.6096 16.9971 19.041L17.0039 18.917L17.9141 8H6.08594L7 19ZM10 10C10.5128 10 10.9354 10.3865 10.9932 10.8838L11 11V17C11 17.5523 10.5523 18 10 18C9.48716 18 9.0646 17.6135 9.00684 17.1162L9 17V11C9 10.4477 9.44772 10 10 10ZM14 10C14.5128 10 14.9354 10.3865 14.9932 10.8838L15 11V17C15 17.5523 14.5523 18 14 18C13.4872 18 13.0646 17.6135 13.0068 17.1162L13 17V11C13 10.4477 13.4477 10 14 10ZM10 6H14V4H10V6Z"
      fill="currentColor"
    />
  </svg>
);

type GraphicEditorBarProps = {
  show: boolean;
  onDuplicate: () => void;
  onDelete: () => void;
};

// create-omat's design editor bar (the main proto's GraphicEditorBar). Only
// duplicate and delete are wired up — the rest render with their press state
// but do nothing on tap yet, exactly as in the proto.
export function GraphicEditorBar({ show, onDuplicate, onDelete }: GraphicEditorBarProps) {
  if (!show) return null;

  const line = <div style={DIVIDER_STYLE} />;
  return (
    <EditorBarShell data-editor-bar="true">
      <>
        {/* Remove Background — label only, like create-omat. Not wired yet. */}
        <button
          type="button"
          className="eb-item"
          style={{ borderRadius: "24px 6px 6px 24px", padding: "0 12px" }}
        >
          Remove Background
        </button>

        {line}

        {/* Shape — not wired yet. */}
        <button type="button" className="eb-item">
          <ShapeIcon />
          Shape
        </button>

        {line}

        {/* Effects — not wired yet. */}
        <button type="button" className="eb-item">
          <GrainIcon />
          Effects
        </button>

        {line}

        {/* Flip — dropdown in create-omat; trigger only for now, not wired. */}
        <button type="button" className="eb-item">
          <FlipIcon />
          Flip
        </button>

        {line}

        {/* Duplicate + Delete — icon-only group, the two live actions. */}
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          <button
            type="button"
            aria-label="Duplicate"
            title="Duplicate"
            onClick={onDuplicate}
            className="eb-item"
          >
            <CopyIcon />
          </button>
          <button
            type="button"
            aria-label="Delete"
            title="Delete"
            onClick={onDelete}
            className="eb-item"
            style={{ borderRadius: "6px 24px 24px 6px", color: "#DC2626" }}
          >
            <TrashIcon />
          </button>
        </div>
      </>
    </EditorBarShell>
  );
}
