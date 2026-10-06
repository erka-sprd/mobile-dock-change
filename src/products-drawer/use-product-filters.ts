

import { useEffect, useMemo, useState } from "react"

import type { StaticProduct } from "product-catalog-client"

import {
  buildCategoryTree,
  buildFilterSections,
  deriveAllFacets,
  findCategory,
  searchProductsByName,
  type CategoryNode,
  type FilterSection,
  type SortId,
} from "./assortment"
import { discountedPrice, volumeDiscountPercentage } from "./volume-discount"

// Same thresholds as create-omat's product search.
const SEARCH_MIN_LENGTH = 2
const SEARCH_DEBOUNCE_MS = 400

// Filtering model ported from create-omat's useFilteredProductTypes: AND across
// sections, OR within a section. Every option carries the product ids it
// matches, so a filter is just an id-set intersection — all client-side.

export type ProductFiltersState = ReturnType<typeof useProductFilters>

/**
 * @param orderQuantity Quantity the prices are shown for, so the price filter
 *   measures what the tiles actually show. Once a discount applies the tile
 *   displays the discounted price in red and strikes the original; filtering on
 *   the struck price would contradict what the user is reading. The percentage
 *   that quantity buys is resolved PER PRODUCT — the scales differ per product
 *   type, so two tiles at the same quantity can be discounted differently.
 */
export function useProductFilters(products: StaticProduct[], orderQuantity = 1) {
  const faceted = useMemo(() => deriveAllFacets(products), [products])
  const categoryTree = useMemo(() => buildCategoryTree(faceted), [faceted])
  const sections = useMemo(() => buildFilterSections(faceted), [faceted])

  const [selectedCategoryId, setSelectedCategoryId] = useState<string | undefined>()
  /** multi/single-select sections: sectionId -> selected option ids */
  const [selections, setSelections] = useState<Record<string, string[]>>({})
  /** toggle sections: sectionId -> on */
  const [toggles, setToggles] = useState<Record<string, boolean>>({})
  /** price "up to" value; undefined = no price filter */
  const [priceValue, setPriceValue] = useState<number | undefined>()
  const [sortId, setSortId] = useState<SortId>("popular")
  const [searchQuery, setSearchQuery] = useState("")
  // Debounced copy of the query actually applied to filtering (400ms, like
  // production's SearchInput).
  const [appliedSearch, setAppliedSearch] = useState("")
  useEffect(() => {
    const t = setTimeout(() => setAppliedSearch(searchQuery), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [searchQuery])

  // null = no active search; otherwise the ids matching the query.
  const searchSet = useMemo(() => {
    const query = appliedSearch.trim()
    if (query.length < SEARCH_MIN_LENGTH) return null
    return new Set(searchProductsByName(products, query).map(p => p.id))
  }, [products, appliedSearch])

  const priceSection = sections.find(s => s.type === "price")
  // Rounded per item the same way the tiles round, so a product sitting exactly
  // on the slider value falls on the same side of it in both places.
  const priceById = useMemo(
    () =>
      new Map(
        products.map(p => {
          const pct = orderQuantity > 1 ? volumeDiscountPercentage(orderQuantity, p.id) : 0
          return [p.id, pct > 0 ? discountedPrice(p.price, pct) : p.price]
        })
      ),
    [products, orderQuantity]
  )

  // One id-set per active section (selections OR-ed within the section).
  const filterSets = useMemo(() => {
    const sets: { sectionId: string; set: Set<string> }[] = []
    for (const section of sections) {
      if (section.type === "toggle") {
        if (toggles[section.id])
          sets.push({ sectionId: section.id, set: new Set(section.productIds) })
        continue
      }
      const selected = selections[section.id]
      if (!selected?.length || !section.options) continue
      const set = new Set(
        selected.flatMap(id => section.options!.find(o => o.id === id)?.productIds ?? [])
      )
      sets.push({ sectionId: section.id, set })
    }
    return sets
  }, [sections, selections, toggles])

  const passesPrice = (id: string) =>
    priceValue === undefined || (priceById.get(id) ?? 0) <= priceValue

  /** ids passing search + all filters (optionally ignoring one section) — no category */
  const filteredIgnoring = (ignoreSectionId?: string) => {
    const sets = filterSets.filter(fs => fs.sectionId !== ignoreSectionId)
    return products
      .map(p => p.id)
      .filter(
        id =>
          (!searchSet || searchSet.has(id)) &&
          sets.every(fs => fs.set.has(id)) &&
          passesPrice(id)
      )
  }

  /** search + all filters applied, category NOT applied — drives category greying */
  const globalFilteredIds = useMemo(
    () => new Set(filteredIgnoring()),
    [filterSets, priceValue, priceById, products, searchSet]
  )

  const selectedCategory = selectedCategoryId
    ? findCategory(categoryTree, selectedCategoryId)
    : undefined

  /** final visible product ids: category ∩ filters, sorted */
  const filteredIds = useMemo(() => {
    const inCategory = selectedCategory ? new Set(selectedCategory.productIds) : undefined
    const idList = [...globalFilteredIds].filter(id => !inCategory || inCategory.has(id))
    if (sortId === "price") idList.sort((a, b) => (priceById.get(a) ?? 0) - (priceById.get(b) ?? 0))
    if (sortId === "priceReverse")
      idList.sort((a, b) => (priceById.get(b) ?? 0) - (priceById.get(a) ?? 0))
    return idList
  }, [globalFilteredIds, selectedCategory, sortId, priceById])

  /** would selecting this option still yield products? (own section ignored) */
  const optionAvailability = useMemo(() => {
    const inCategory = selectedCategory ? new Set(selectedCategory.productIds) : undefined
    const available = new Map<string, boolean>()
    for (const section of sections) {
      if (!section.options) continue
      const base = new Set(
        filteredIgnoring(section.id).filter(id => !inCategory || inCategory.has(id))
      )
      for (const o of section.options)
        available.set(`${section.id}:${o.id}`, o.productIds.some(id => base.has(id)))
    }
    return available
  }, [sections, filterSets, priceValue, priceById, selectedCategory, products, searchSet])

  const isCategoryDisabled = (node: CategoryNode): boolean => {
    const hasMatch = (n: CategoryNode): boolean =>
      n.productIds.some(id => globalFilteredIds.has(id)) ||
      (n.children ?? []).some(hasMatch)
    return !hasMatch(node)
  }

  // --- mutations -------------------------------------------------------------

  const applySelection = (sectionId: string, optionIds: string[]) =>
    setSelections(prev => ({ ...prev, [sectionId]: optionIds }))

  /** mobile: toggle a single option immediately (no pending state) */
  const toggleOption = (sectionId: string, optionId: string) =>
    setSelections(prev => {
      const current = prev[sectionId] ?? []
      return {
        ...prev,
        [sectionId]: current.includes(optionId)
          ? current.filter(id => id !== optionId)
          : [...current, optionId],
      }
    })

  const setToggle = (sectionId: string, on: boolean) =>
    setToggles(prev => ({ ...prev, [sectionId]: on }))

  const resetFilters = () => {
    setSelections({})
    setToggles({})
    setPriceValue(undefined)
    setSortId("popular")
    setSearchQuery("")
    setAppliedSearch("")
  }

  const hasActiveSearch = appliedSearch.trim().length >= SEARCH_MIN_LENGTH

  const activeFilterCount =
    Object.values(selections).reduce((n, arr) => n + arr.length, 0) +
    Object.values(toggles).filter(Boolean).length +
    (priceValue !== undefined && priceValue !== priceSection?.priceMax ? 1 : 0)

  const countFor = (section: FilterSection) =>
    section.type === "toggle"
      ? toggles[section.id]
        ? 1
        : 0
      : section.type === "price"
        ? priceValue !== undefined && priceValue !== section.priceMax
          ? 1
          : 0
        : (selections[section.id]?.length ?? 0)

  return {
    faceted,
    categoryTree,
    sections,
    selectedCategoryId,
    selectedCategory,
    setSelectedCategoryId,
    selections,
    applySelection,
    toggleOption,
    toggles,
    setToggle,
    priceValue,
    setPriceValue,
    priceSection,
    sortId,
    setSortId,
    searchQuery,
    setSearchQuery,
    hasActiveSearch,
    filteredIds,
    optionAvailability,
    isCategoryDisabled,
    resetFilters,
    activeFilterCount,
    countFor,
  }
}
