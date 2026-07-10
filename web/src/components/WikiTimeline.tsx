import { useEffect, useMemo, useState } from 'react'
import { fetchWikiGraph } from '../api/client'
import type { WikiComponent } from '../api/types'
import { COMMUNITY_COLORS } from './WikiGraph'

const ROW_HEIGHT = 28
const BAR_HEIGHT = 16
const PX_PER_DAY = 24
const LEFT_LABEL_WIDTH = 140
const MIN_BAR_WIDTH = 4

interface TimelineItem {
  id: string
  title: string
  workspace: string
  phase: string
  start: number // ms epoch
  end: number // ms epoch
  color: string
}

function frontmatterTime(value: unknown): Date | null {
  if (typeof value !== 'string' || value === '') return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

// Turns a raw WikiComponent (already filtered to type === 'change') into a
// TimelineItem: created_at from frontmatter is preferred over updatedAt for
// the bar's start (only TypeChange components carry created_at); the bar's
// end falls back to "now" so a change updated moments ago still renders a
// visible sliver instead of a zero-width bar.
function toTimelineItem(c: WikiComponent, communities: Record<string, number>): TimelineItem {
  const created = frontmatterTime(c.frontmatter?.created_at)
  const updated = c.updatedAt ? new Date(c.updatedAt) : null
  const start = created ?? updated ?? new Date()
  const end = updated && updated.getTime() > start.getTime() ? updated : new Date()
  const phase = typeof c.frontmatter?.phase === 'string' ? (c.frontmatter.phase as string) : ''
  const commId = communities[c.id]
  const color =
    commId != null && commId >= 0 ? COMMUNITY_COLORS[commId % COMMUNITY_COLORS.length] : '#8e8e93'
  return {
    id: c.id,
    title: c.title,
    workspace: c.workspace || '(未知工作区)',
    phase,
    start: start.getTime(),
    end: end.getTime(),
    color,
  }
}

export function WikiTimeline() {
  const [components, setComponents] = useState<WikiComponent[]>([])
  const [communities, setCommunities] = useState<Record<string, number>>({})
  const [loaded, setLoaded] = useState(false)
  const [hover, setHover] = useState<{ title: string; phase: string; x: number; y: number } | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchWikiGraph()
      .then((data) => {
        if (cancelled) return
        setComponents(data.components)
        setCommunities(data.communities ?? {})
        setLoaded(true)
      })
      .catch(() => {
        if (cancelled) return
        setComponents([])
        setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const items = useMemo(
    () => components.filter((c) => c.type === 'change').map((c) => toTimelineItem(c, communities)),
    [components, communities],
  )

  const workspaces = useMemo(() => {
    const seen = new Set<string>()
    const order: string[] = []
    for (const item of items) {
      if (!seen.has(item.workspace)) {
        seen.add(item.workspace)
        order.push(item.workspace)
      }
    }
    return order.sort()
  }, [items])

  const { minTime, maxTime } = useMemo(() => {
    if (items.length === 0) {
      const now = Date.now()
      return { minTime: now - 86400000, maxTime: now }
    }
    let min = Infinity
    let max = -Infinity
    for (const item of items) {
      if (item.start < min) min = item.start
      if (item.end > max) max = item.end
    }
    // Pad a day on each side so bars at the extremes aren't clipped against
    // the SVG edge.
    return { minTime: min - 86400000, maxTime: max + 86400000 }
  }, [items])

  const totalDays = Math.max(1, (maxTime - minTime) / 86400000)
  const chartWidth = Math.ceil(totalDays * PX_PER_DAY)
  const chartHeight = Math.max(ROW_HEIGHT, workspaces.length * ROW_HEIGHT)

  function xForTime(t: number): number {
    return ((t - minTime) / 86400000) * PX_PER_DAY
  }

  // Month tick marks give a scroll-friendly time axis without pulling in a
  // charting dependency.
  const monthTicks = useMemo(() => {
    const ticks: { x: number; label: string }[] = []
    const start = new Date(minTime)
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1)
    const end = new Date(maxTime)
    while (cursor.getTime() <= end.getTime()) {
      ticks.push({
        x: xForTime(cursor.getTime()),
        label: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`,
      })
      cursor.setMonth(cursor.getMonth() + 1)
    }
    return ticks
  }, [minTime, maxTime])

  return (
    <div className="relative flex h-[calc(100vh-160px)] min-h-[400px] w-full flex-col">
      {!loaded && (
        <div className="flex flex-1 items-center justify-center text-xs text-[#6e6e73]">
          <span className="animate-pulse">加载中…</span>
        </div>
      )}
      {loaded && items.length === 0 && (
        <div className="flex flex-1 items-center justify-center text-xs text-[#6e6e73]">
          暂无变更数据
        </div>
      )}
      {loaded && items.length > 0 && (
        <div data-testid="wiki-timeline" className="flex flex-1 overflow-auto rounded border border-[#e8e8ed] bg-white">
          <div
            className="sticky left-0 z-10 shrink-0 border-r border-[#e8e8ed] bg-white"
            style={{ width: LEFT_LABEL_WIDTH }}
          >
            <div style={{ height: 24 }} />
            {workspaces.map((ws) => (
              <div
                key={ws}
                className="flex items-center truncate px-2 text-xs text-[#1d1d1f]"
                style={{ height: ROW_HEIGHT }}
                title={ws}
              >
                {ws}
              </div>
            ))}
          </div>
          <div className="relative" style={{ width: chartWidth, minHeight: chartHeight + 24 }}>
            <svg width={chartWidth} height={chartHeight + 24} data-testid="wiki-timeline-svg">
              {monthTicks.map((tick) => (
                <g key={tick.label}>
                  <line x1={tick.x} y1={24} x2={tick.x} y2={chartHeight + 24} stroke="#e8e8ed" strokeWidth={1} />
                  <text x={tick.x + 3} y={16} fontSize={10} fill="#6e6e73">
                    {tick.label}
                  </text>
                </g>
              ))}
              {workspaces.map((ws, rowIndex) => {
                const rowItems = items.filter((item) => item.workspace === ws)
                const y = rowIndex * ROW_HEIGHT + 24 + (ROW_HEIGHT - BAR_HEIGHT) / 2
                return (
                  <g key={ws}>
                    {rowItems.map((item) => {
                      const x = xForTime(item.start)
                      const width = Math.max(MIN_BAR_WIDTH, xForTime(item.end) - x)
                      return (
                        <rect
                          key={item.id}
                          data-testid="wiki-timeline-bar"
                          x={x}
                          y={y}
                          width={width}
                          height={BAR_HEIGHT}
                          rx={3}
                          fill={item.color}
                          onMouseEnter={(e) =>
                            setHover({
                              title: item.title,
                              phase: item.phase,
                              x: e.clientX,
                              y: e.clientY,
                            })
                          }
                          onMouseMove={(e) =>
                            setHover({
                              title: item.title,
                              phase: item.phase,
                              x: e.clientX,
                              y: e.clientY,
                            })
                          }
                          onMouseLeave={() => setHover(null)}
                        />
                      )
                    })}
                  </g>
                )
              })}
            </svg>
          </div>
        </div>
      )}
      {hover && (
        <div
          data-testid="wiki-timeline-tooltip"
          className="pointer-events-none fixed z-20 -translate-x-1/2 -translate-y-full rounded border border-[#e8e8ed] bg-white px-2 py-1 text-xs text-[#1d1d1f] shadow-sm"
          style={{ left: hover.x, top: hover.y - 10 }}
        >
          <div className="font-medium">{hover.title}</div>
          {hover.phase && <div className="text-[10px] text-[#6e6e73]">{hover.phase}</div>}
        </div>
      )}
    </div>
  )
}
