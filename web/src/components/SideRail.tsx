type View = 'changes' | 'graph' | 'timeline' | 'search' | 'recent' | 'lint' | 'report' | 'shares'

interface SideRailProps {
  view: View
  onSelect: (v: View) => void
  onOpenSettings?: () => void
  onToggleBookmarks?: () => void
  bookmarkPanelOpen?: boolean
}

const ITEMS: { key: View; label: string; icon: string }[] = [
  { key: 'changes', label: '变更列表', icon: '🚀' },
  { key: 'graph', label: '图谱', icon: '🗺️' },
  { key: 'timeline', label: '时间线', icon: '📅' },
  { key: 'search', label: '搜索', icon: '🔍' },
  { key: 'recent', label: '最近', icon: '🕐' },
  { key: 'lint', label: 'Lint', icon: '✓' },
  { key: 'report', label: '报告', icon: '📊' },
  { key: 'shares', label: '分享', icon: '🔗' },
]

export function SideRail({ view, onSelect, onOpenSettings, onToggleBookmarks, bookmarkPanelOpen }: SideRailProps) {
  return (
    <nav
      data-testid="view-switcher"
      className="sticky top-5 h-[calc(100vh-40px)] w-[60px] shrink-0 ml-4 my-5 bg-white rounded-[22px] shadow-[0_6px_24px_rgba(30,32,60,0.08),0_1px_2px_rgba(0,0,0,0.04)] flex flex-col items-center py-3.5 gap-2.5"
    >
      {ITEMS.map((it) => {
        const on = view === it.key
        return (
          <button
            key={it.key}
            type="button"
            title={it.label}
            aria-label={it.label}
            aria-pressed={on}
            onClick={() => onSelect(it.key)}
            className={
              'w-[38px] h-[38px] rounded-xl grid place-items-center text-[17px] ' +
              (on
                ? 'bg-[#0063f8] text-white shadow-[0_6px_14px_rgba(0,99,248,0.35)]'
                : 'text-[#6e6e73] hover:bg-[#f0f5ff]')
            }
          >
            <span aria-hidden="true">{it.icon}</span>
          </button>
        )
      })}
      <div className="flex-1" />
      <button
        type="button"
        aria-label="收藏"
        aria-pressed={!!bookmarkPanelOpen}
        onClick={onToggleBookmarks}
        disabled={!onToggleBookmarks}
        title={onToggleBookmarks ? '收藏' : '即将推出'}
        className={
          'w-[38px] h-[38px] rounded-xl grid place-items-center text-[17px] ' +
          (bookmarkPanelOpen
            ? 'bg-[#0063f8] text-white shadow-[0_6px_14px_rgba(0,99,248,0.35)]'
            : onToggleBookmarks
              ? 'text-[#6e6e73] hover:bg-[#f0f5ff]'
              : 'text-[#c7cad4] cursor-not-allowed')
        }
      >
        <span aria-hidden="true">⭐</span>
      </button>
      <button
        type="button"
        aria-label="设置"
        onClick={onOpenSettings}
        disabled={!onOpenSettings}
        title={onOpenSettings ? '设置' : '即将推出'}
        className={
          'w-[38px] h-[38px] rounded-xl grid place-items-center text-[17px] ' +
          (onOpenSettings ? 'text-[#6e6e73] hover:bg-[#f0f5ff]' : 'text-[#c7cad4] cursor-not-allowed')
        }
      >
        <span aria-hidden="true">⚙️</span>
      </button>
    </nav>
  )
}
