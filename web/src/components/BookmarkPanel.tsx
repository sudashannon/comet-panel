import type { Bookmark } from '../api/types'

interface BookmarkPanelProps {
  bookmarks: Bookmark[]
  onOpen: (path: string) => void
  onRemove: (path: string) => void
  onClose: () => void
}

// Compact side popover listing starred docs. Rendered by App.tsx as an
// absolute overlay next to SideRail when bookmarkPanelOpen is true.
export function BookmarkPanel({ bookmarks, onOpen, onRemove, onClose }: BookmarkPanelProps) {
  return (
    <div
      data-testid="bookmark-panel"
      role="region"
      aria-label="收藏"
      className="w-80 max-h-[70vh] bg-white rounded-xl flex flex-col overflow-hidden"
      style={{ boxShadow: 'var(--shadow-modal)' }}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
        <div className="text-sm font-semibold text-[var(--color-text-primary)]">收藏</div>
        <button
          type="button"
          aria-label="关闭"
          onClick={onClose}
          className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
        >
          ✕
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {bookmarks.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-[var(--color-text-secondary)]">暂无收藏，点击文档右上角的 ☆ 收藏</div>
        ) : (
          <ul className="divide-y divide-[var(--color-border)]">
            {bookmarks.map((b) => (
              <li key={b.path} className="flex items-center gap-2 px-4 py-2.5 hover:bg-[var(--palette-highlight)]">
                <button
                  type="button"
                  onClick={() => onOpen(b.path)}
                  className="flex-1 min-w-0 text-left flex items-center gap-2"
                >
                  <span className="shrink-0 text-[10px] font-medium uppercase text-[var(--color-accent)] bg-[var(--palette-match-bg)] rounded px-1.5 py-0.5">
                    {b.type}
                  </span>
                  <span className="truncate text-xs text-[var(--color-text-primary)]" title={b.title}>
                    {b.title}
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={`移除 ${b.title}`}
                  onClick={() => onRemove(b.path)}
                  className="shrink-0 text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)]"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
