import { useEffect, useRef, useState } from 'react'
import { searchSemantic, type SemanticSearchResult } from '../api/client'
import { TYPE_COLORS } from './WikiGraph'

const DEBOUNCE_MS = 300
const TOP_K = 10

interface SemanticSearchProps {
  onNodeClick: (id: string) => void
}

// SemanticSearch is a standalone search view: as the user types, the query
// is embedded and ranked against the corpus server-side (POST
// /api/wiki/search-semantic) so there is no client-side WASM encoder and no
// upfront corpus fetch -- each debounced keystroke is a single round-trip
// that returns already-ranked results.
export function SemanticSearch({ onNodeClick }: SemanticSearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SemanticSearchResult[]>([])
  const [loadError, setLoadError] = useState(false)
  const debounceRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (debounceRef.current !== undefined) window.clearTimeout(debounceRef.current)
    const trimmed = query.trim()
    if (trimmed === '') {
      setResults([])
      setLoadError(false)
      return
    }
    debounceRef.current = window.setTimeout(() => {
      searchSemantic(trimmed, TOP_K)
        .then((data) => {
          setResults(data)
          setLoadError(false)
        })
        .catch(() => {
          setResults([])
          setLoadError(true)
        })
    }, DEBOUNCE_MS)
    return () => {
      if (debounceRef.current !== undefined) window.clearTimeout(debounceRef.current)
    }
  }, [query])

  return (
    <div className="space-y-4 text-xs">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="按含义搜索组件…"
        aria-label="语义搜索"
        className="w-full rounded-lg border border-[#e4e4e8] px-3 py-2 text-sm outline-none focus:border-[#0063f8]"
      />
      {loadError && <div className="text-[#dc2626]">搜索失败</div>}
      {!loadError && query.trim() !== '' && results.length === 0 && (
        <div className="text-[#6e6e73]">无匹配结果</div>
      )}
      <ul className="space-y-1.5">
        {results.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onNodeClick(item.id)}
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
              <span className="shrink-0 tabular-nums text-[#0063f8]">
                {Math.round(item.similarity * 100)}%
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
