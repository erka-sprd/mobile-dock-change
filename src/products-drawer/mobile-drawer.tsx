

import { X } from "lucide-react"
import type { ReactNode } from "react"
import { Drawer } from "vaul"

// Shared bottom-sheet primitive for the mobile designer — replicates the
// anatomy of create-omat's @sprd/sprd-component-kit v2 Drawer (the component
// every create-omat drawer renders through):
//   - no grab handle (sheets are still swipe-dismissible)
//   - bg-black/80 overlay
//   - bordered rounded-t-xl (md: rounded-t-2xl) sheet, max-h calc(100% - 6rem)
//   - header row (min-h-11, py-1 pl-4 pr-1.5): LEFT-aligned MADE-font title
//     (text-base font-medium) + X close button (p-2.5, size-6, sr-only label)
//   - without a title: sr-only title + absolute X in the top-right
//   - body wrapped in an overflow-y-auto container
// Sub-views (e.g. a back arrow) go inside the `title` slot, like the kit.
// `overlay={false}` + `modal={false}` reproduces the kit's mobile-edit drawer
// (create-omat hides the vaul overlay via CSS so the canvas stays visible).

type MobileDrawerProps = {
    open: boolean
    onOpenChange: (open: boolean) => void
    children: ReactNode
    /** Header title (ReactNode — may include a back-arrow button, kit-style). */
    title?: ReactNode
    /** Accessible label when no title is shown (kit's ariaLabel variant). */
    ariaLabel?: string
    /** Show the X close button (kit: dismissible). */
    dismissible?: boolean
    /** Screen-reader label for the X button (kit: closeLabel). */
    closeLabel?: string
    /** Dim the page behind the sheet (default true). */
    overlay?: boolean
    /** vaul modal mode (default true). false keeps the page interactive. */
    modal?: boolean
    /** Height classes — replaces the kit default (content-sized, capped at
     *  calc(100% - 6rem)) to avoid conflicting Tailwind height utilities. */
    heightClassName?: string
    /** Extra classes for the sheet container. */
    className?: string
    /** Portal target. Given an element, the overlay and sheet are positioned
     *  absolutely inside it (it must be `relative`) instead of fixed to the
     *  viewport — used to keep a sheet within the canvas bounds. */
    container?: HTMLElement | null
}

export default function MobileDrawer({
    open,
    onOpenChange,
    children,
    title,
    ariaLabel,
    dismissible = true,
    closeLabel = "Close",
    overlay = true,
    modal = true,
    heightClassName = "h-auto max-h-[calc(100%-6rem)]",
    className = "",
    container,
}: MobileDrawerProps) {
    // Contained sheets anchor to the portal host; otherwise to the viewport.
    const position = container ? "absolute" : "fixed"
    const closeButton = (extraClassName: string) => (
        <Drawer.Close
            className={"cursor-pointer p-2.5 text-black hover:text-neutral-800 " + extraClassName}
        >
            <X className="size-6" aria-hidden strokeWidth={1.8} />
            <span className="sr-only">{closeLabel}</span>
        </Drawer.Close>
    )

    return (
        <Drawer.Root open={open} onOpenChange={onOpenChange} modal={modal} dismissible={dismissible}>
            <Drawer.Portal container={container ?? undefined}>
                {overlay && (
                    // Same z as drawer contents (kit: everything z-50) so a
                    // second-level drawer's overlay stacks above an already-open
                    // drawer by DOM order — e.g. the volume-discount overlay
                    // dims the product type drawer beneath it.
                    <Drawer.Overlay className={`${position} inset-0 z-[9999] bg-black/80`} />
                )}
                <Drawer.Content
                    className={
                        `tw-scope ${position} inset-x-0 bottom-0 z-[9999] mt-24 flex flex-col rounded-t-xl border bg-white outline-none md:rounded-t-2xl ` +
                        heightClassName +
                        " " +
                        className
                    }
                >
                    {title !== undefined ? (
                        <div className="py-1 pr-1.5 pl-4">
                            <div className="flex min-h-11 items-center justify-between text-left">
                                <Drawer.Title className="font-display text-base font-medium">
                                    {title}
                                </Drawer.Title>
                                {dismissible && closeButton("")}
                            </div>
                        </div>
                    ) : (
                        <>
                            <Drawer.Title className="sr-only">{ariaLabel ?? "Panel"}</Drawer.Title>
                            {dismissible && closeButton("absolute top-1 right-1.5 z-10")}
                        </>
                    )}
                    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
                </Drawer.Content>
            </Drawer.Portal>
        </Drawer.Root>
    )
}
