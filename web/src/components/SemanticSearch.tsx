import { useEffect, useMemo, useRef, useState } from 'react'
import { searchSemantic } from '../api/client'
import type { SemanticSearchResult } from '../api/client'
import { TYPE_COLORS } from './WikiGraph'

const DEBOUNCE_MS = 300
const PAGE_SIZE = 20

interface SemanticSearchProps {
  onNodeClick: (id: string) => void
}

export function SemanticSearch({ onNodeClick }: SemanticSearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SemanticSearchResult[]>([])
  const [loadError, setLoadError] = useState(false)
  const [page, setPage] = useState(0)
  const [typeFilter, setTypeFilter] = useState<string | null>(null)
  const types = useMemo(() => {
    const seen = new Set<string>()
    for (const r of results) seen.add(r.type)
    return Array.from(seen).sort()
  }, [results])
  const filteredResults = useMemo(
    () => typeFilter ? results.filter(r => r.type === typeFilter) : results,
    [results, typeFilter]
  )
  const debounceRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (debounceRef.current !== undefined) window.clearTimeout(debounceRef.current)
    const trimmed = query.trim()
    if (trimmed === '') {
      setResults([])
      setLoadError(false)
      setPage(0)
      return
    }
    debounceRef.current = window.setTimeout(() => {
      searchSemantic(trimmed, 0)
        .then((data) => {
          setResults(data)
          setLoadError(false)
          setPage(0)
          setTypeFilter(null)
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

  const totalPages = Math.ceil(filteredResults.length / PAGE_SIZE)
  const pageResults = useMemo(
    () => filteredResults.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [filteredResults, page],
  )

  return (
    <div className="space-y-3 text-xs">
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
      {results.length > 0 && (
        <>
          <div className="text-[#6e6e73]">共 {results.length} 条结果</div>
          {types.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                aria-pressed={typeFilter === null}
                onClick={() => { setTypeFilter(null); setPage(0) }}
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                  typeFilter === null
                    ? 'bg-[#0063f8] text-white'
                    : 'bg-[#f0f0ee] text-[#6e6e73] hover:bg-[#e4e4e8]'
                }`}
              >全部</button>
              {types.map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={typeFilter === t}
                  onClick={() => { setTypeFilter(typeFilter === t ? null : t); setPage(0) }}
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                    typeFilter === t
                      ? 'text-white'
                      : 'bg-[#f0f0ee] text-[#6e6e73] hover:bg-[#e4e4e8]'
                  }`}
                  style={typeFilter === t ? { backgroundColor: TYPE_COLORS[t] ?? '#6e6e73' } : undefined}
                >{t}</button>
              ))}
            </div>
          )}
        </>
      )}
      <ul className="space-y-1.5">
        {pageResults.map((item) => (
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
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            type="button"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
            className="rounded border border-[#e4e4e8] px-2 py-1 disabled:opacity-30"
          >
            ← 上一页
          </button>
          <span className="text-[#6e6e73]">
            {page + 1} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages - 1}
            onClick={() => setPage(page + 1)}
            className="rounded border border-[#e4e4e8] px-2 py-1 disabled:opacity-30"
          >
            下一页 →
          </button>
        </div>
      )}
    </div>
  )
}
