import { useEffect, useState, useCallback } from 'react'
import { fetchRecent } from '../api/client'
import type { RecentItem } from '../api/types'
import { TYPE_COLORS } from './WikiGraph'

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

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
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(true)

  const load = useCallback(async (offset: number) => {
    const CHUNK = 20
    try {
      const data = await fetchRecent(offset, CHUNK)
      setItems((prev) => offset === 0 ? data : [...prev, ...data])
      setHasMore(data.length === CHUNK)
      setLoadError(false)
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(0)
  }, [load])

  if (loadError) {
    return <div className="text-xs text-[var(--color-danger)]">加载失败</div>
  }
  if (items.length === 0) {
    return <div className="text-xs text-[var(--color-text-secondary)]">暂无最近变更</div>
  }

  return (
    <div>
      <ul className="space-y-1.5 text-xs">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onOpen?.(item.path)}
              className="w-full flex items-center gap-2 border border-[var(--color-border)] px-3 py-2 text-left hover:bg-[var(--palette-highlight)]"
            >
              <span
                className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
                style={{ backgroundColor: TYPE_COLORS[item.type] ?? 'var(--color-text-secondary)' }}
              >
                {item.type}
              </span>
              <span className="flex-1 truncate font-medium">{item.title}</span>
              <span className="shrink-0 text-[var(--color-text-secondary)]">{item.workspace}</span>
              <span className="shrink-0 tabular-nums text-[var(--color-text-secondary)]">
                {formatRelativeTime(item.updatedAt)}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {loading && <div className="text-center py-2 text-xs text-[var(--color-text-secondary)]">加载中…</div>}
      {hasMore && !loading && (
        <button
          type="button"
          onClick={() => { setLoading(true); load(items.length) }}
          className="w-full text-xs py-2 text-[var(--color-accent)] hover:bg-[var(--palette-highlight)] mt-1"
        >
          加载更多
        </button>
      )}
    </div>
  )
}
