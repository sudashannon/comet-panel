import { useEffect, useState, useCallback } from 'react'
import { TYPE_COLORS } from './WikiGraph'

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
      <div key={data.month} className="bg-white border border-[#e8e8ed] rounded-xl overflow-hidden">
        <div className="text-center text-[13px] font-bold py-2 bg-[#f5f5f7] border-b border-[#e8e8ed]">
          {data.year}年{monthNames[data.month-1]}
        </div>
        <div className="grid grid-cols-7 text-center text-[10px] text-[#8e8e93] pt-1 pb-0">
          {WEEKDAYS.map((w) => <span key={w}>{w}</span>)}
        </div>
        <div className="grid grid-cols-7 text-center px-1 pb-1.5">
          {days.map((d, i) => {
            if (d === null) return <span key={`e${i}`} className="aspect-square" />
            const dateKey = `${data.year}-${String(data.month).padStart(2,'0')}-${String(d).padStart(2,'0')}`
            const hasArtifact = (data.days[dateKey] ?? 0) > 0
            const isToday = dateKey === today
            const isSel = dateKey === selected
            return (
              <button
                key={d}
                type="button"
                onClick={() => handleSelect(dateKey)}
                className={`aspect-square flex flex-col items-center justify-center text-[13px] rounded-md relative transition-colors
                  ${isSel ? 'bg-[#0063f8] text-white font-bold' : isToday ? 'text-[#0063f8] font-bold' : 'hover:bg-[#f0f5ff]'}
                `}
              >
                {d}
                {hasArtifact && !isSel && (
                  <span className="absolute bottom-0.5 w-1 h-1 rounded-full bg-[#dc2626]" />
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
      <div className="flex items-center justify-between">
        <button onClick={prevQuarter} className="text-sm px-3 py-1 rounded border border-[#e8e8ed] hover:bg-[#f0f5ff]">← 上一季度</button>
        <h2 className="text-sm font-bold text-[#1d1d1f]">
          📅 {year}年 第{quarter}季度
        </h2>
        <button onClick={nextQuarter} className="text-sm px-3 py-1 rounded border border-[#e8e8ed] hover:bg-[#f0f5ff]">下一季度 →</button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {months.map(renderMonth)}
      </div>

      {selected && (
        <div className="bg-white border border-[#e8e8ed] rounded-xl p-4">
          <h3 className="text-[13px] font-semibold mb-3">
            📅 {selected}
            <span className="text-[#8e8e93] font-normal ml-1">({items.length} 个产物)</span>
          </h3>
          {items.length === 0 ? (
            <p className="text-sm text-[#8e8e93]">当天无产物</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onOpen(item.path)}
                  className="flex items-center gap-2 rounded-lg border border-[#e4e4e8] px-3 py-2 text-left hover:bg-[#f0f5ff] text-xs"
                >
                  <span
                    className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
                    style={{ backgroundColor: TYPE_COLORS[item.type] ?? '#6e6e73' }}
                  >{item.type}</span>
                  <span className="flex-1 truncate font-medium">{item.title}</span>
                  <span className="shrink-0 text-[#8e8e93]">{item.workspace}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {!selected && (
        <div className="text-center text-[#8e8e93] text-sm py-8">点击日期查看当天产物</div>
      )}
    </div>
  )
}
