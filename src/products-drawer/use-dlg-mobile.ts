import * as React from "react"

// Designer mobile check — same 1080px "dlg" breakpoint as production
// create-omat (BREAKPOINTS.dlg) and the --breakpoint-dlg token in globals.css.
// Separate from the shadcn use-mobile hook (768px) used by the ui primitives.
const DLG_BREAKPOINT = 1080

export function useDlgMobile() {
    const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

    React.useEffect(() => {
        const mql = window.matchMedia(`(max-width: ${DLG_BREAKPOINT - 1}px)`)
        const onChange = () => setIsMobile(mql.matches)
        mql.addEventListener("change", onChange)
        setIsMobile(mql.matches)
        return () => mql.removeEventListener("change", onChange)
    }, [])

    return !!isMobile
}
