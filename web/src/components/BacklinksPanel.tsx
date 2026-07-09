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
      <div className="text-[#6e6e73] mb-2">
        {backlinks.length > 0 ? `${backlinks.length} 处引用` : '暂无反向引用'}
      </div>
      {backlinks.map((e, i) => (
        <div key={i} className="text-[#0063f8] truncate">
          {e.from}
        </div>
      ))}
    </div>
  )
}
