import { useEffect, useRef, useCallback } from 'react'
import type { ScoredAction, UseCommandPaletteReturn } from '../hooks/useCommandPalette'
import { highlightMatches } from '../hooks/useCommandPalette'
import { formatShortcut } from '../hooks/useKeyboardShortcuts'
import type { ShortcutDef } from '../hooks/useKeyboardShortcuts'

interface Props {
  palette: UseCommandPaletteReturn
  shortcuts?: ShortcutDef[]
}

/** Group actions by category, preserving scored order within each group. */
function groupByCategory(items: ScoredAction[]): Map<string, ScoredAction[]> {
  const groups = new Map<string, ScoredAction[]>()
  for (const item of items) {
    const cat = item.action.category ?? 'Other'
    const list = groups.get(cat)
    if (list) {
      list.push(item)
    } else {
      groups.set(cat, [item])
    }
  }
  return groups
}

export function CommandPalette({ palette, shortcuts }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const selIdx = useRef(0)

  const { query, setQuery, results, openPalette, closePalette } = palette

  // Focus input when opening
  useEffect(() => {
    if (palette.open) {
      selIdx.current = 0
      // Slight delay so the modal is in the DOM
      const timer = setTimeout(() => inputRef.current?.focus(), 50)
      return () => clearTimeout(timer)
    }
  }, [palette.open])

  const selectAction = useCallback((action: ScoredAction['action']) => {
    action.run()
    closePalette()
  }, [closePalette])

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closePalette()
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        selIdx.current = Math.min(selIdx.current + 1, results.length - 1)
        // Scroll selected into view
        const el = listRef.current?.querySelector(`[data-palette-idx="${selIdx.current}"]`)
        el?.scrollIntoView({ block: 'nearest' })
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        selIdx.current = Math.max(selIdx.current - 1, 0)
        const el = listRef.current?.querySelector(`[data-palette-idx="${selIdx.current}"]`)
        el?.scrollIntoView({ block: 'nearest' })
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        if (results.length > 0) {
          selectAction(results[selIdx.current].action)
        }
        return
      }
    },
    [results, selectAction, closePalette],
  )

  // ── Shortcut reference mode (?) ──────────────────────────────────────────
  const isShortcutMode = query.startsWith('?')

  if (!palette.open) return null

  return (
    <div
      data-testid="command-palette"
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      style={{ backgroundColor: 'var(--palette-bg)' }}
      onClick={closePalette}
      role="dialog"
      aria-label="命令面板"
    >
      <div
        className="w-full max-w-xl rounded-lg shadow-xl overflow-hidden flex flex-col"
        style={{
          backgroundColor: 'var(--palette-surface)',
          boxShadow: 'var(--shadow-modal)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div
          className="flex items-center gap-3 px-4 py-3 border-b"
          style={{ borderColor: 'var(--palette-separator)' }}
        >
          <span className="text-base shrink-0">🔍</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              selIdx.current = 0
            }}
            onKeyDown={onKeyDown}
            placeholder={isShortcutMode ? '快捷键速查…' : '搜索命令…  (Ctrl+K 开关)'}
            className="flex-1 bg-transparent border-none outline-none text-base text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)]"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd
            className="text-xs px-1.5 py-0.5 rounded font-mono shrink-0"
            style={{
              backgroundColor: 'var(--color-bg)',
              border: `1px solid var(--color-border)`,
              color: 'var(--color-text-secondary)',
            }}
          >
            esc
          </kbd>
        </div>

        {/* Results */}
        <div
          ref={listRef}
          className="max-h-[400px] overflow-y-auto p-2"
          role="listbox"
        >
          {isShortcutMode && shortcuts ? (
            <ShortcutList shortcuts={shortcuts} />
          ) : results.length === 0 ? (
            <div
              className="text-center py-6 text-sm"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              {query ? '无匹配命令' : '输入关键词搜索…'}
            </div>
          ) : (
            <ActionList
              results={results}
              selectedIdx={selIdx.current}
              onSelect={selectAction}
            />
          )}
        </div>

        {/* Footer hint */}
        <div
          className="px-4 py-2 text-xs flex items-center gap-4 border-t"
          style={{
            borderColor: 'var(--color-border)',
            color: 'var(--color-text-secondary)',
          }}
        >
          <span>↑↓ 导航</span>
          <span>↵ 执行</span>
          <span>esc 关闭</span>
          <span className="ml-auto">? 快捷键</span>
        </div>
      </div>
    </div>
  )
}

// ── Action list with category groups ────────────────────────────────────────

function ActionList({
  results,
  selectedIdx,
  onSelect,
}: {
  results: ScoredAction[]
  selectedIdx: number
  onSelect: (action: ScoredAction['action']) => void
}) {
  const groups = groupByCategory(results)
  let globalIdx = 0
  const rows: React.ReactNode[] = []
  const entries = [...groups.entries()]

  entries.forEach(([category, items], gi) => {
    if (gi > 0 && items.length > 0) {
      rows.push(
        <div
          key={`sep-${gi}`}
          className="mx-1 my-1 border-t"
          style={{ borderColor: 'var(--palette-separator)' }}
        />,
      )
    }
    rows.push(
      <div
        key={`cat-${category}`}
        className="text-xs font-semibold px-2 py-1 uppercase tracking-wider"
        style={{ color: 'var(--color-text-tertiary)' }}
      >
        {category}
      </div>,
    )
    for (const item of items) {
      const idx = globalIdx++
      const isSelected = idx === selectedIdx
      rows.push(
        <div
          key={item.action.id}
          data-palette-idx={idx}
          role="option"
          aria-selected={isSelected}
          className="flex items-center gap-3 px-3 py-2 rounded cursor-pointer text-sm"
          style={{
            backgroundColor: isSelected ? 'var(--palette-highlight)' : 'transparent',
            color: 'var(--color-text-primary)',
          }}
          onClick={() => onSelect(item.action)}
          onMouseEnter={() => {
            // eslint-disable-next-line react-compiler/react-compiler
            selectedIdx = idx
          }}
        >
          <span className="shrink-0 w-5 text-center">
            {item.action.icon ?? '•'}
          </span>
          <span className="flex-1">
            <span
              dangerouslySetInnerHTML={{
                __html: highlightMatches(
                  item.action.label,
                  item.labelIndices,
                ),
              }}
            />
            {item.action.subtitle && (
              <span
                className="block text-xs"
                style={{ color: 'var(--color-text-secondary)' }}
                dangerouslySetInnerHTML={{
                  __html: highlightMatches(
                    item.action.subtitle,
                    item.subtitleIndices,
                  ),
                }}
              />
            )}
          </span>
          {item.action.shortcut && (
            <kbd
              className="text-xs px-1.5 py-0.5 rounded font-mono shrink-0"
              style={{
                backgroundColor: 'var(--color-bg)',
                border: `1px solid var(--color-border)`,
                color: 'var(--color-text-secondary)',
              }}
            >
              {item.action.shortcut}
            </kbd>
          )}
        </div>,
      )
    }
  })

  return <div role="listbox">{rows}</div>
}

// ── Shortcut reference list (mode "?") ─────────────────────────────────────

function ShortcutList({ shortcuts }: { shortcuts: ShortcutDef[] }) {
  return (
    <div>
      <div
        className="text-xs font-semibold px-2 py-1 uppercase tracking-wider"
        style={{ color: 'var(--color-text-tertiary)' }}
      >
        快捷键
      </div>
      {shortcuts.map((s, i) => (
        <div
          key={i}
          className="flex items-center justify-between px-3 py-2 text-sm"
          style={{ color: 'var(--color-text-primary)' }}
        >
          <span>{s.label}</span>
          <kbd
            className="text-xs px-1.5 py-0.5 rounded font-mono shrink-0"
            style={{
              backgroundColor: 'var(--color-bg)',
              border: `1px solid var(--color-border)`,
              color: 'var(--color-text-secondary)',
            }}
          >
            {formatShortcut(s)}
          </kbd>
        </div>
      ))}
    </div>
  )
}
