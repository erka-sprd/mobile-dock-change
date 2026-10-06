

import { useRef, useState, type ReactNode, type UIEvent } from "react"

import { cn } from "./utils"

// Port of create-omat's MobileProductTypeDrawer layout: search on top, a
// collapsible block (category chips + filter/sort buttons) that hides while
// scrolling down through the grid and returns on scroll up.

const SCROLL_DELTA = 4
const COLLAPSE_AFTER = 24

type MobileProductPanelProps = {
  search: ReactNode
  categories: ReactNode
  volumeDiscountBtn?: ReactNode
  filterBtn: ReactNode
  sortBtn: ReactNode
  productList: ReactNode
}

export default function MobileProductPanel({
  search,
  categories,
  volumeDiscountBtn,
  filterBtn,
  sortBtn,
  productList,
}: MobileProductPanelProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const lastScrollY = useRef(0)

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    const { scrollTop } = event.currentTarget
    setScrolled(scrollTop > 0)

    const delta = scrollTop - lastScrollY.current
    if (Math.abs(delta) < SCROLL_DELTA) return

    if (delta > 0 && scrollTop > COLLAPSE_AFTER) setCollapsed(true)
    else if (delta < 0) setCollapsed(false)

    lastScrollY.current = scrollTop
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div className={cn("shrink-0 pb-3", scrolled && "shadow-sm")}>
        <div className="px-4">{search}</div>
        <div
          className={cn(
            "overflow-hidden transition-all duration-200",
            collapsed ? "mt-0 max-h-0 opacity-0" : "mt-3 max-h-96 opacity-100"
          )}
        >
          <div className="space-y-3">
            {categories}
            {volumeDiscountBtn && (
              <div className="mx-4 border-t border-neutral-200 pt-4">{volumeDiscountBtn}</div>
            )}
            <div className="flex items-center justify-between px-4">
              {filterBtn}
              {sortBtn}
            </div>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-4" onScroll={handleScroll}>
        {productList}
      </div>
    </div>
  )
}
