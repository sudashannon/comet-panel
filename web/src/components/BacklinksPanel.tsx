import { useEffect, useState } from 'react'
import { fetchWikiComponent } from '../api/client'
import type { WikiEdge } from '../api/types'

const KIND_BADGE_STYLES: Record<string, string> = {
  implements: 'bg-[#e6f0ff] text-[#0063f8]',
  references: 'bg-[#f0eaff] text-[#7c3aed]',
  generates: 'bg-[#e6f7ec] text-[#0a7a3d]',
}

function EdgeKindBadge({ kind }: { kind: string }) {
  return (
    <span
      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${KIND_BADGE_STYLES[kind] ?? 'bg-[#f5f5f7] text-[#6e6e73]'}`}
    >
      {kind}
    </span>
  )
}

function EdgeSection({
  heading,
  edges,
  pathKey,
  emptyText,
}: {
  heading: string
  edges: WikiEdge[]
  pathKey: 'from' | 'to'
  emptyText: string
}) {
  return (
    <div>
      <div className="text-[#6e6e73] font-semibold mb-2">
        {heading}（{edges.length} 处引用）
      </div>
      {edges.length === 0 ? (
        <div className="flex items-center gap-2 text-[#6e6e73] bg-[#f5f5f7] rounded p-2">
          <span className="text-[#a1a1a6]">—</span>
          <span>{emptyText}</span>
        </div>
      ) : (
        <ul className="space-y-1">
          {edges.map((e, i) => {
            const path = e[pathKey]
            return (
              <li key={i} className="flex items-center gap-1.5 truncate">
                <span className="text-[#0063f8] truncate" title={path}>
                  {path}
                </span>
                <EdgeKindBadge kind={e.kind} />
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export function BacklinksPanel({ componentId }: { componentId: string }) {
  const [data, setData] = useState<{ forward: WikiEdge[]; backlinks: WikiEdge[] } | null>(null)

  useEffect(() => {
    fetchWikiComponent(componentId)
      .then((r) => setData({ forward: r.forward, backlinks: r.backlinks }))
      .catch(() => setData({ forward: [], backlinks: [] }))
  }, [componentId])

  if (data === null) return null

  return (
    <div className="text-xs space-y-4">
      <EdgeSection
        heading="引用（forward）"
        edges={data.forward}
        pathKey="to"
        emptyText="本文档未引用其他文档"
      />
      <EdgeSection
        heading="反向引用"
        edges={data.backlinks}
        pathKey="from"
        emptyText="暂无其他文档引用本文档"
      />
    </div>
  )
}
