import { useEffect, useState } from 'react'
import { fetchRecent } from '../api/client'
import type { RecentItem } from '../api/types'
import { TYPE_COLORS } from './WikiGraph'

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

// formatRelativeTime renders a coarse, Chinese-locale "time ago" label —
// minutes/hours/days back, falling back to a plain date once the gap
// exceeds a week (matching how e.g. GitHub/微信 collapse old timestamps
// instead of showing an ever-growing day count).
function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return iso
  const diff = Date.now() - then
  if (diff < MINUTE_MS) return '刚刚'
  if (diff < HOUR_MS) return `${Math.floor(diff / MINUTE_MS)}分钟前`
  if (diff < DAY_MS) return `${Math.floor(diff / HOUR_MS)}小时前`
  if (diff < 7 * DAY_MS) return `${Math.floor(diff / DAY_MS)}天前`
  return new Date(then).toLocaleDateString('zh-CN')
}

export function RecentPanel({ onOpen }: { onOpen?: (path: string) => void }) {
  const [items, setItems] = useState<RecentItem[]>([])
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchRecent()
      .then((data) => {
        if (cancelled) return
        setItems(data)
        setLoadError(false)
      })
      .catch(() => {
        if (cancelled) return
        setLoadError(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (loadError) {
    return <div className="text-xs text-[#dc2626]">加载失败</div>
  }
  if (items.length === 0) {
    return <div className="text-xs text-[#6e6e73]">暂无最近变更</div>
  }

  return (
    <ul className="space-y-1.5 text-xs">
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            onClick={() => onOpen?.(item.path)}
            className="w-full flex items-center gap-2 rounded-lg border border-[#e4e4e8] px-3 py-2 text-left hover:bg-[#f0f5ff]"
          >
            <span
              className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
              style={{ backgroundColor: TYPE_COLORS[item.type] ?? '#6e6e73' }}
            >
              {item.type}
            </span>
            <span className="flex-1 truncate font-medium">{item.title}</span>
            <span className="shrink-0 text-[#6e6e73]">{item.workspace}</span>
            <span className="shrink-0 tabular-nums text-[#6e6e73]">
              {formatRelativeTime(item.updatedAt)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
