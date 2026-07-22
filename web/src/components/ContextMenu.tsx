import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'

export interface ContextMenuItem {
  id: string
  label: string
  icon?: string
  disabled?: boolean
  danger?: boolean
  run: () => void
}

interface Props {
  items: ContextMenuItem[]
  x: number
  y: number
  onClose: () => void
}

/**
 * Carbon-style right-click context menu.
 * Renders via portal at the cursor position, auto-flips to stay on screen.
 */
export function ContextMenu({ items, x, y, onClose }: Props) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ x: number; y: number }>({ x, y })
  const [mounted, setMounted] = useState(false)

  // Auto-position: ensure menu stays within viewport
  useEffect(() => {
    setMounted(true)
    if (!menuRef.current) return

    const rect = menuRef.current.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight

    let posX = x
    let posY = y

    // Flip horizontally if off-screen right
    if (x + rect.width > vw) {
      posX = x - rect.width
    }
    // Flip vertically if off-screen bottom
    if (y + rect.height > vh) {
      posY = y - rect.height
    }
    // Clamp to viewport edges
    posX = Math.max(4, Math.min(posX, vw - rect.width - 4))
    posY = Math.max(4, Math.min(posY, vh - rect.height - 4))

    setPosition({ x: posX, y: posY })
  }, [x, y])

  // Close on outside click or Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        // Small delay to let the click event finish before unmounting
        setTimeout(onClose, 0)
      }
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [onClose])

  if (!mounted) return null

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      className="fixed z-50 min-w-[140px] border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-sm"
      style={{ left: position.x, top: position.y }}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          disabled={item.disabled}
          onClick={() => {
            item.run()
            onClose()
          }}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors enabled:hover:bg-[var(--color-layer)] disabled:cursor-not-allowed disabled:opacity-40"
          style={{
            color: item.danger ? 'var(--color-danger)' : 'var(--color-text-primary)',
          }}
        >
          {item.icon && <span className="shrink-0 w-4 text-center">{item.icon}</span>}
          <span className="flex-1">{item.label}</span>
        </button>
      ))}
    </div>,
    document.body,
  )
}

/**
 * Hook that returns context menu state and handlers for attaching to elements.
 *
 * Usage:
 *   const ctx = useContextMenu()
 *   return <div onContextMenu={ctx.onContextMenu}>...</div>
 *          {ctx.menuProps && <ContextMenu {...ctx.menuProps} />}
 */
export function useContextMenu() {
  const [menuProps, setMenuProps] = useState<{
    items: ContextMenuItem[]
    x: number
    y: number
  } | null>(null)

  const onContextMenu = useCallback(
    (items: ContextMenuItem[]) => (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setMenuProps({ items, x: e.clientX, y: e.clientY })
    },
    [],
  )

  const closeMenu = useCallback(() => setMenuProps(null), [])

  const renderMenu = menuProps ? (
    <ContextMenu
      items={menuProps.items}
      x={menuProps.x}
      y={menuProps.y}
      onClose={closeMenu}
    />
  ) : null

  return { onContextMenu, renderMenu, closeMenu }
}
