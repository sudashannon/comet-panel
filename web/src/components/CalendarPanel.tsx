import { useEffect, useState, useCallback } from 'react'
import { TYPE_COLORS } from './WikiGraph'
import { useContextMenu } from './ContextMenu'

interface DayItem {
  id: string
  title: string
  type: string
  workspace: string
  path: string
  updatedAt: string
}

interface MonthData {
  year: number
  month: number
  days: Record<string, number>
}

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

interface CalendarPanelProps {
  onOpen: (path: string) => void
}

export function CalendarPanel({ onOpen }: CalendarPanelProps) {
  const ctx = useContextMenu()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [quarter, setQuarter] = useState(Math.ceil((now.getMonth() + 1) / 3))
  const [months, setMonths] = useState<MonthData[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [items, setItems] = useState<DayItem[]>([])

  const monthsInQuarter = [
    (quarter - 1) * 3 + 1,
    (quarter - 1) * 3 + 2,
    (quarter - 1) * 3 + 3,
  ]

  useEffect(() => {
    Promise.all(
      monthsInQuarter.map((m) =>
        fetch(`/api/wiki/calendar/month?year=${year}&month=${m}`)
          .then((r) => r.json())
          .catch(() => ({ year, month: m, days: {} }))
      )
    ).then(setMonths)
  }, [year, quarter])

  const handleSelect = useCallback((date: string) => {
    setSelected(date)
    fetch(`/api/wiki/calendar/day?date=${date}`)
      .then((r) => r.json())
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .catch(() => setItems([]))
  }, [])

  const prevQuarter = () => {
    if (quarter === 1) { setYear(y => y - 1); setQuarter(4) }
    else setQuarter(q => q - 1)
    setSelected(null); setItems([])
  }
  const nextQuarter = () => {
    if (quarter === 4) { setYear(y => y + 1); setQuarter(1) }
    else setQuarter(q => q + 1)
    setSelected(null); setItems([])
  }

  const renderMonth = (data: MonthData) => {
    const firstDay = new Date(data.year, data.month - 1, 1)
    const lastDay = new Date(data.year, data.month, 0)
    const startDow = (firstDay.getDay() + 6) % 7 // Mon=0
    const days: (number | null)[] = []
    for (let i = 0; i < startDow; i++) days.push(null)
    for (let d = 1; d <= lastDay.getDate(); d++) days.push(d)

    const monthNames = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月']
    const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`

    return (
      <div key={data.month} className="bg-white border border-[var(--color-border)] overflow-hidden">
        <div className="text-center text-[13px] font-bold py-2 bg-[var(--color-bg)] border-b border-[var(--color-border)]">
          {data.year}年{monthNames[data.month-1]}
        </div>
        <div className="grid grid-cols-7 text-center text-[10px] text-[var(--color-text-secondary)] pt-1 pb-0">
          {WEEKDAYS.map((w) => <span key={w}>{w}</span>)}
        </div>
        <div className="grid grid-cols-7 text-center px-1 pb-1.5">
          {days.map((d, i) => {
            if (d === null) return <span key={`e${i}`} className="py-1" />
            const dateKey = `${data.year}-${String(data.month).padStart(2,'0')}-${String(d).padStart(2,'0')}`
            const hasArtifact = (data.days[dateKey] ?? 0) > 0
            const isToday = dateKey === today
            const isSel = dateKey === selected
            return (
              <button
                key={d}
                type="button"
                onClick={() => handleSelect(dateKey)}
                className={`flex flex-col items-center justify-center text-[13px] relative transition-colors py-1
                  ${isSel ? 'bg-[var(--color-accent)] text-white font-bold' : isToday ? 'text-[var(--color-accent)] font-bold' : 'hover:bg-[var(--palette-highlight)]'}
                `}
              >
                {d}
                {hasArtifact && !isSel && (
                  <span className="absolute bottom-0.5 w-1 h-1 rounded-full bg-[var(--color-danger)]" />
                )}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center justify-between mb-1">
        <button onClick={prevQuarter} className="text-xs px-2 py-1 border border-[var(--color-border)] hover:bg-[var(--palette-highlight)]">← 上一季度</button>
        <h2 className="text-sm font-bold text-[var(--color-text-primary)]">
          📅 {year}年 第{quarter}季度
        </h2>
        <button onClick={nextQuarter} className="text-xs px-2 py-1 border border-[var(--color-border)] hover:bg-[var(--palette-highlight)]">下一季度 →</button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {months.map(renderMonth)}
      </div>

      {selected && (
        <div className="bg-white border border-[var(--color-border)] p-4">
          <h3 className="text-[13px] font-semibold mb-3">
            📅 {selected}
            <span className="text-[var(--color-text-secondary)] font-normal ml-1">({items.length} 个产物)</span>
          </h3>
          {items.length === 0 ? (
            <p className="text-sm text-[var(--color-text-secondary)]">当天无产物</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onOpen(item.path)} onContextMenu={ctx.onContextMenu([{ id: 'open', label: '打开', icon: '📂', run: () => onOpen(item.path) }, { id: 'copy-path', label: '复制路径', icon: '📋', run: () => navigator.clipboard.writeText(item.path) }, { id: 'copy-title', label: '复制标题', icon: '📝', run: () => navigator.clipboard.writeText(item.title) }])}
                  className="flex items-center gap-2 border border-[var(--color-border)] px-3 py-2 text-left hover:bg-[var(--palette-highlight)] text-xs"
                >
                  <span
                    className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
                    style={{ backgroundColor: TYPE_COLORS[item.type] ?? 'var(--color-text-secondary)' }}
                  >{item.type}</span>
                  <span className="flex-1 truncate font-medium">{item.title}</span>
                  <span className="shrink-0 text-[var(--color-text-secondary)]">{item.workspace}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {!selected && (
        <div className="text-center text-[var(--color-text-secondary)] text-sm py-8">点击日期查看当天产物</div>
      )}
      {ctx.renderMenu}
    </div>
  )
}
