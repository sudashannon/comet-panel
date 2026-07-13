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
      className="w-80 max-h-[70vh] bg-white rounded-xl shadow-[0_6px_24px_rgba(30,32,60,0.12),0_1px_2px_rgba(0,0,0,0.04)] flex flex-col overflow-hidden"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#e8e8ed]">
        <div className="text-sm font-semibold text-[#1d1d1f]">收藏</div>
        <button
          type="button"
          aria-label="关闭"
          onClick={onClose}
          className="text-sm text-[#6e6e73] hover:text-[#1d1d1f]"
        >
          ✕
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {bookmarks.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-[#6e6e73]">暂无收藏，点击文档右上角的 ☆ 收藏</div>
        ) : (
          <ul className="divide-y divide-[#e8e8ed]">
            {bookmarks.map((b) => (
              <li key={b.path} className="flex items-center gap-2 px-4 py-2.5 hover:bg-[#f0f5ff]">
                <button
                  type="button"
                  onClick={() => onOpen(b.path)}
                  className="flex-1 min-w-0 text-left flex items-center gap-2"
                >
                  <span className="shrink-0 text-[10px] font-medium uppercase text-[#0063f8] bg-[#e6efff] rounded px-1.5 py-0.5">
                    {b.type}
                  </span>
                  <span className="truncate text-xs text-[#1d1d1f]" title={b.title}>
                    {b.title}
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={`移除 ${b.title}`}
                  onClick={() => onRemove(b.path)}
                  className="shrink-0 text-xs text-[#a1a1a6] hover:text-[#dc2626]"
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
