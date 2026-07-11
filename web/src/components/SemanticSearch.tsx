import { useEffect, useMemo, useRef, useState } from 'react'
import { embed } from '@ternlight/mini'
import { fetchEmbeddings } from '../api/client'
import type { EmbeddingItem } from '../api/types'
import { TYPE_COLORS } from './WikiGraph'

const DEBOUNCE_MS = 300
const TOP_K = 10

export interface SemanticSearchResult {
  item: EmbeddingItem
  similarity: number
}

// cosineSimilarity works on plain number[] (as decoded from the embeddings
// JSON response) rather than requiring @ternlight/mini's own Float32Array
// Embedding type -- the query vector and the corpus vectors come from two
// different embedding models (mini vs. base, see scripts/embed.ts) so
// there is no dimension/normalization guarantee to lean on; a generic dot
// product / magnitude computation is the only thing that stays correct
// regardless of which model produced either side.
function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const len = Math.min(a.length, b.length)
  let dot = 0
  let magA = 0
  let magB = 0
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }
  if (magA === 0 || magB === 0) return 0
  return dot / (Math.sqrt(magA) * Math.sqrt(magB))
}

interface SemanticSearchProps {
  onNodeClick: (id: string) => void
}

// SemanticSearch is a standalone search view: it fetches every component's
// precomputed embedding once, then ranks them against a client-side query
// embedding (via @ternlight/mini's WASM encoder) as the user types. Search
// is entirely local after the initial fetch -- no per-keystroke network
// round-trip, unlike HandleSearch's substring match.
export function SemanticSearch({ onNodeClick }: SemanticSearchProps) {
  const [items, setItems] = useState<EmbeddingItem[]>([])
  const [loadError, setLoadError] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SemanticSearchResult[]>([])
  // embedError distinguishes "WASM engine failed to embed the query" (e.g.
  // unsupported runtime) from the corpus-fetch failure above -- the two
  // fail independently and need separate messaging.
  const [embedError, setEmbedError] = useState(false)
  const debounceRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    fetchEmbeddings()
      .then((data) => {
        if (cancelled) return
        setItems(data.items)
      })
      .catch(() => {
        if (cancelled) return
        setLoadError(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (debounceRef.current !== undefined) window.clearTimeout(debounceRef.current)
    const trimmed = query.trim()
    if (trimmed === '' || items.length === 0) {
      setResults([])
      return
    }
    debounceRef.current = window.setTimeout(() => {
      try {
        const queryVector = embed(trimmed)
        const ranked = items
          .map((item) => ({ item, similarity: cosineSimilarity(queryVector, item.vector) }))
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, TOP_K)
        setResults(ranked)
        setEmbedError(false)
      } catch {
        setResults([])
        setEmbedError(true)
      }
    }, DEBOUNCE_MS)
    return () => {
      if (debounceRef.current !== undefined) window.clearTimeout(debounceRef.current)
    }
  }, [query, items])

  const placeholder = useMemo(
    () => (items.length === 0 && !loadError ? '加载语义索引…' : '按含义搜索组件…'),
    [items.length, loadError],
  )

  return (
    <div className="space-y-4 text-xs">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        disabled={items.length === 0 && !loadError}
        aria-label="语义搜索"
        className="w-full rounded-lg border border-[#e4e4e8] px-3 py-2 text-sm outline-none focus:border-[#0063f8]"
      />
      {loadError && <div className="text-[#dc2626]">无法加载语义索引</div>}
      {embedError && <div className="text-[#dc2626]">查询编码失败</div>}
      {!loadError && !embedError && query.trim() !== '' && results.length === 0 && items.length > 0 && (
        <div className="text-[#6e6e73]">无匹配结果</div>
      )}
      <ul className="space-y-1.5">
        {results.map(({ item, similarity }) => (
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
                {Math.round(similarity * 100)}%
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
