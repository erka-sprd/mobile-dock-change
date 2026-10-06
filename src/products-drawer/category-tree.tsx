

import { cn } from "./utils"
import type { CategoryNode } from "./assortment"

// Desktop left-sidebar category tree, ported from create-omat's CategoryTree:
// top-level branches always visible, children expand only along the selected
// path, empty branches greyed out (kept in the tree for when the catalogue
// grows).

type CategoryTreeProps = {
  tree: CategoryNode[]
  selectedId?: string
  onSelect: (id: string | undefined) => void
  isDisabled: (node: CategoryNode) => boolean
}

/** ids from the root down to `id` (inclusive), or [] when not found */
function pathTo(nodes: CategoryNode[], id: string): string[] {
  for (const node of nodes) {
    if (node.id === id) return [node.id]
    const childPath = node.children ? pathTo(node.children, id) : []
    if (childPath.length) return [node.id, ...childPath]
  }
  return []
}

export default function CategoryTree({ tree, selectedId, onSelect, isDisabled }: CategoryTreeProps) {
  const selectedPath = selectedId ? pathTo(tree, selectedId) : []

  // Typography per create-omat's CategoryTree: parents and nodes on the
  // selected path in the display font (font-made → font-display) at
  // text-sm/medium; unselected children in Inter (font-inter → font-sans) at
  // base size/medium. No hover styling, matching production.
  const renderNode = (node: CategoryNode, depth: number) => {
    const disabled = isDisabled(node)
    const selected = node.id === selectedId
    const onPath = selectedPath.includes(node.id)
    const isParent = depth === 0
    const expanded = onPath && !!node.children?.length
    return (
      <li key={node.id}>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onSelect(selected ? undefined : node.id)}
          style={!isParent ? { paddingLeft: `${depth}rem` } : undefined}
          className={cn(
            "w-full text-left",
            disabled ? "cursor-not-allowed text-neutral-400" : "cursor-pointer",
            isParent ? "py-1.5" : "font-sans py-1",
            isParent || onPath ? "font-display text-sm font-medium" : "font-medium"
          )}
        >
          {node.label}
        </button>
        {expanded && (
          <ul className="mt-1.5 space-y-0.5">
            {node.children!.map(child => renderNode(child, depth + 1))}
          </ul>
        )}
      </li>
    )
  }

  return (
    <nav aria-label="Product categories">
      <ul className="space-y-1">{tree.map(node => renderNode(node, 0))}</ul>
    </nav>
  )
}
