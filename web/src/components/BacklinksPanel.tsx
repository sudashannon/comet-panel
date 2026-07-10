import { useEffect, useState } from 'react'
import { fetchWikiComponent } from '../api/client'
import type { WikiEdge } from '../api/types'

export function BacklinksPanel({ componentId }: { componentId: string }) {
  const [backlinks, setBacklinks] = useState<WikiEdge[] | null>(null)

  useEffect(() => {
    fetchWikiComponent(componentId)
      .then((r) => setBacklinks(r.backlinks))
      .catch(() => setBacklinks([]))
  }, [componentId])

  if (backlinks === null) return null

  return (
    <div className="text-xs">
      <div className="text-[#6e6e73] font-semibold mb-2">
        反向引用{backlinks.length > 0 ? `（${backlinks.length} 处引用）` : ''}
      </div>
      {backlinks.length === 0 ? (
        <div className="flex items-center gap-2 text-[#6e6e73] bg-[#f5f5f7] rounded p-2">
          <span className="text-[#a1a1a6]">—</span>
          <span>该变更暂无其他文档引用</span>
        </div>
      ) : (
        <ul className="space-y-1">
          {backlinks.map((e, i) => (
            <li key={i} className="flex items-center gap-1.5 truncate">
              <span className="text-[#0063f8] truncate" title={e.from}>
                {e.from}
              </span>
              <span className="text-[#6e6e73] shrink-0">({e.kind})</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
