type View = 'changes' | 'graph' | 'lint'

interface SideRailProps {
  view: View
  onSelect: (v: View) => void
}

const ITEMS: { key: View; label: string; icon: string }[] = [
  { key: 'changes', label: '变更列表', icon: '🚀' },
  { key: 'graph', label: '图谱', icon: '🗺️' },
  { key: 'lint', label: 'Lint', icon: '✓' },
]

export function SideRail({ view, onSelect }: SideRailProps) {
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
        aria-label="设置"
        aria-disabled="true"
        disabled
        title="即将推出"
        className="w-[38px] h-[38px] rounded-xl grid place-items-center text-[17px] text-[#c7cad4] cursor-not-allowed"
      >
        <span aria-hidden="true">⚙️</span>
      </button>
    </nav>
  )
}
