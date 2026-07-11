import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import cytoscape from 'cytoscape'
import { embed } from '@ternlight/mini'
import { fetchWikiGraph, fetchEmbeddings } from '../api/client'
import type { WikiComponent, WikiEdge } from '../api/types'
import { GraphFilters } from './GraphFilters'
import { useWikiEvents } from '../hooks/useWikiEvents'

/**
 * Color legend for the 8 WikiComponent types shown in the WikiGraph force-directed view.
 *
 * This map is a deliberate, governed exception to the app's 4-color UI constraint
 * (--color-accent/--color-success/--color-danger/--color-warn in styles.css). A
 * data-viz legend distinguishing 8 categories genuinely needs more hues than 4 brand
 * colors + grays can provide, so this scope is intentionally exempted -- do not
 * collapse it back down to reusing only the 4 established colors.
 *
 * 5 of the 8 values reuse an existing color with an existing semantic meaning:
 *   change   -> #0063f8  (= --color-accent)
 *   tasks    -> #c47a06  (= --color-warn)
 *   plan     -> #16a34a  (= --color-success)
 *   diagram  -> #dc2626  (= --color-danger)
 *   artifact -> #6e6e73  (established neutral gray, used elsewhere in the app)
 *
 * The remaining 3 types have no established color to map to, so they use new hues
 * chosen to sit clearly apart from the 5 colors above *and* from each other on the
 * color wheel (verified with CIE Lab deltaE: minimum pairwise distance across all 8
 * final colors is ~30.5, vs. ~16-25 for the near-duplicate blues/greens this
 * replaced):
 *   proposal -> #7c3aed  (violet)
 *   design   -> #0d9488  (teal)
 *   spec     -> #7c2d12  (dark rust/brown -- distinct from tasks/warn's brighter #c47a06)
 *
 * All 8 values are lowercase hex, matching this codebase's existing convention.
 */
export const TYPE_COLORS: Record<string, string> = {
  change: '#0063f8',
  proposal: '#7c3aed',
  design: '#0d9488',
  tasks: '#c47a06',
  spec: '#7c2d12',
  plan: '#16a34a',
  artifact: '#6e6e73',
  diagram: '#dc2626',
}

// EDGE_COLORS distinguishes the three edge kinds the wiki index actually
// computes (see wiki/links.go): implements (design_doc/plan), references
// (verification_report/markdown links), generates (artifact convention).
// Unlike TYPE_COLORS above, these reuse the app's existing 4-color palette
// directly (accent/success/warn) since edges are a separate visual channel
// (line color, not fill) from node type colors and don't need to avoid
// collision with them.
const EDGE_COLORS: Record<string, string> = {
  implements: '#0063f8',
  references: '#16a34a',
  generates: '#c47a06',
}
const EDGE_FALLBACK_COLOR = '#8e8e93'

// COMMUNITY_COLORS gives each detected community (see wiki graph community
// detection) a distinct border color, independent of TYPE_COLORS' node fill.
export const COMMUNITY_COLORS = [
  '#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4',
  '#42d4f4', '#f032e6', '#bfef45', '#fabed4', '#469990',
  '#dcbeff', '#9a6324',
]

const POLL_INTERVAL_MS = 3000
const MAX_POLL_ATTEMPTS = 20
const SEARCH_DEBOUNCE_MS = 300
// Below this cosine similarity a component is treated as "not a match" for
// the search-box highlight -- without a floor, embed() on a short/generic
// query would still rank every node with *some* similarity and the
// highlight would cover the whole graph instead of the relevant subset.
const SEARCH_SIMILARITY_THRESHOLD = 0.35

// Duplicated (not shared) from SemanticSearch.tsx: same generic-vector
// cosine similarity, but kept local since this is the only other call site
// and pulling in a shared module for one 12-line pure function isn't worth
// the extra indirection.
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

export function WikiGraph({ onNodeClick }: { onNodeClick: (id: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<cytoscape.Core | null>(null)
  const [components, setComponents] = useState<WikiComponent[]>([])
  const [edges, setEdges] = useState<WikiEdge[]>([])
  const [communities, setCommunities] = useState<Record<string, number>>({})
  const [communityLabels, setCommunityLabels] = useState<Record<string, string>>({})
  const [gaveUp, setGaveUp] = useState(false)
  const [hover, setHover] = useState<{ title: string; x: number; y: number } | null>(null)
  // 关系边只占 794 个节点里的一小部分（约 222 条边、189 个有关联节点），其余
  // 605 个孤立节点会被 cose/grid 布局铺成一整屏色点，反而把真正的关系子图挤到
  // 角落。默认只显示有关联的节点，把关系子图放到画面中心；没有边时该开关无意义
  // （筛选后会清空画布），因此仅显示全部节点。
  const [connectedOnly, setConnectedOnly] = useState(true)
  const [activeWorkspaces, setActiveWorkspaces] = useState<Set<string> | null>(null)
  const [activeCommunity, setActiveCommunity] = useState<number | null>(null)
  // Search-box state: embeddings are fetched once (independent of the
  // graph/edges poll above) and the query is embedded client-side via
  // @ternlight/mini, mirroring SemanticSearch.tsx's approach but scoped to
  // highlighting matching nodes in place rather than listing them.
  const [searchQuery, setSearchQuery] = useState('')
  const [embeddingsById, setEmbeddingsById] = useState<Record<string, number[]>>({})
  const [matchedIds, setMatchedIds] = useState<Set<string> | null>(null)

  useEffect(() => {
    let cancelled = false
    let attempts = 0
    let timer: number | undefined

    const poll = () => {
      fetchWikiGraph()
        .then((data) => {
          if (cancelled) return
          if (data.components.length > 0) {
            setComponents(data.components)
            setEdges(data.edges)
            setCommunities(data.communities ?? {})
            setCommunityLabels(data.communityLabels ?? {})
            return
          }
          setComponents([])
          setEdges([])
          attempts += 1
          if (attempts >= MAX_POLL_ATTEMPTS) {
            setGaveUp(true)
            return
          }
          timer = window.setTimeout(poll, POLL_INTERVAL_MS)
        })
        .catch(() => {
          if (cancelled) return
          setComponents([])
          setEdges([])
          setGaveUp(true)
        })
    }

    poll()

    return () => {
      cancelled = true
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [])

  // Refetches the graph once on demand -- wired to the SSE hook below so a
  // watcher-triggered rebuild (see wiki/watcher.go processBatch) refreshes
  // the canvas immediately instead of waiting for the next poll tick.
  const refetchGraph = useCallback(() => {
    fetchWikiGraph()
      .then((data) => {
        setComponents(data.components)
        setEdges(data.edges)
        setCommunities(data.communities ?? {})
        setCommunityLabels(data.communityLabels ?? {})
      })
      .catch(() => {})
  }, [])
  useWikiEvents(refetchGraph)

  // Fetches once, independent of the components/edges poll above -- a
  // missing/empty embeddings index (e.g. offline embedding pass never run)
  // just means the search box never highlights anything, not a load error.
  useEffect(() => {
    let cancelled = false
    fetchEmbeddings()
      .then((data) => {
        if (cancelled) return
        const map: Record<string, number[]> = {}
        for (const item of data.items) map[item.id] = item.vector
        setEmbeddingsById(map)
      })
      .catch(() => {
        if (cancelled) return
        setEmbeddingsById({})
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const trimmed = searchQuery.trim()
    if (trimmed === '' || Object.keys(embeddingsById).length === 0) {
      setMatchedIds(null)
      return
    }
    const timer = window.setTimeout(() => {
      try {
        const queryVector = embed(trimmed)
        const matches = new Set<string>()
        for (const [id, vector] of Object.entries(embeddingsById)) {
          if (cosineSimilarity(queryVector, vector) >= SEARCH_SIMILARITY_THRESHOLD) matches.add(id)
        }
        setMatchedIds(matches)
      } catch {
        setMatchedIds(new Set())
      }
    }, SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [searchQuery, embeddingsById])

  const hasEdges = edges.length > 0
  const topCommunities = Object.entries(
    Object.values(communities).reduce<Record<number, number>>((counts, id) => {
      if (id >= 0) counts[id] = (counts[id] ?? 0) + 1
      return counts
    }, {}),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([id]) => Number(id))
  // 后端提供了带语义的 communityLabels 时优先使用；否则退回 "#id" 占位符，
  // 保持旧数据（无 communityLabels 字段）下图例仍可用。
  const effectiveCommunityLabels = useMemo(() => {
    const hasLabels = Object.keys(communityLabels).length > 0
    return topCommunities.reduce<Record<string, string>>((acc, id) => {
      acc[String(id)] = hasLabels ? (communityLabels[String(id)] ?? `#${id}`) : `#${id}`
      return acc
    }, {})
  }, [communityLabels, topCommunities])
  const workspaces = useMemo(() => {
    const set = new Set<string>()
    components.forEach((c) => set.add(c.workspace))
    return [...set].sort()
  }, [components])

  function toggleWorkspace(ws: string) {
    setActiveWorkspaces((prev) => {
      // null means "all active"; materialize the full set minus the clicked
      // one so a single click deselects it instead of selecting only it.
      const base = prev ?? new Set(workspaces)
      const next = new Set(base)
      if (next.has(ws)) next.delete(ws)
      else next.add(ws)
      return next
    })
  }

  useEffect(() => {
    if (!containerRef.current || components.length === 0) return
    const typeOrder = Object.keys(TYPE_COLORS)
    const sorted = [...components].sort(
      (a, b) => typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type),
    )
    // null 表示"未筛选，显示全部"（初始态或用户重新全选）。
    const wsFiltered =
      activeWorkspaces === null ? sorted : sorted.filter((c) => activeWorkspaces.has(c.workspace))
    const filtered =
      activeCommunity === null ? wsFiltered : wsFiltered.filter((c) => communities[c.id] === activeCommunity)
    const componentIds = new Set(filtered.map((c) => c.id))
    // Edges may reference an endpoint the frontend never fetched a node for
    // (e.g. a markdown link target outside the scanned workspace) -- cytoscape
    // throws if an edge names a nonexistent node, so drop those defensively
    // rather than let one bad edge blank the whole graph.
    const validEdges = edges.filter((e) => componentIds.has(e.from) && componentIds.has(e.to))
    const connectedIds = new Set<string>()
    validEdges.forEach((e) => {
      connectedIds.add(e.from)
      connectedIds.add(e.to)
    })
    // 794 个节点里约 605 个是孤立节点（无任何关系边），全部铺开会把布局压成
    // 一整屏色点，把真正有价值的关系子图挤到角落。仅显示有关联的节点时把
    // 孤立节点滤掉，让关系子图占满画布；没有边时该过滤没有意义（会清空画布）。
    const visible =
      connectedOnly && validEdges.length > 0 ? filtered.filter((c) => connectedIds.has(c.id)) : filtered
    const visibleIds = new Set(visible.map((c) => c.id))
    const visibleEdges = validEdges.filter((e) => visibleIds.has(e.from) && visibleIds.has(e.to))
    const container = containerRef.current
    const cy = cytoscape({
      container,
      elements: [
        ...visible.map((c) => {
          const commColor =
            communities[c.id] != null && communities[c.id] >= 0
              ? COMMUNITY_COLORS[communities[c.id] % COMMUNITY_COLORS.length]
              : '#ffffff'
          return {
            data: { id: c.id, label: c.title, color: TYPE_COLORS[c.type] ?? '#6e6e73', commColor },
          }
        }),
        ...visibleEdges.map((e, i) => ({
          data: {
            id: `e${i}`,
            source: e.from,
            target: e.to,
            kind: e.kind,
            color: EDGE_COLORS[e.kind] ?? EDGE_FALLBACK_COLOR,
          },
        })),
      ],
      style: [
        {
          selector: 'node',
          style: {
            'background-color': 'data(color)',
            label: 'data(label)',
            'font-size': 7,
            'min-zoomed-font-size': 9,
            color: '#1d1d1f',
            'text-valign': 'bottom',
            'text-margin-y': 3,
            'text-wrap': 'ellipsis',
            'text-max-width': '80px',
            width: 14,
            height: 14,
            'border-width': 2,
            'border-color': 'data(commColor)',
          },
        },
        {
          selector: 'node.hovered',
          style: {
            'border-width': 2.5,
            'border-color': '#0063f8',
          },
        },
        {
          selector: 'edge',
          style: {
            width: 0.75,
            'line-color': 'data(color)',
            'target-arrow-color': 'data(color)',
            'target-arrow-shape': 'triangle',
            'arrow-scale': 0.6,
            'curve-style': 'bezier',
            opacity: 0.55,
          },
        },
        {
          selector: 'edge.highlighted',
          style: {
            width: 1.75,
            opacity: 1,
          },
        },
        {
          selector: 'edge[kind="similar"]',
          style: {
            'line-style': 'dashed',
            opacity: 0.3,
            width: 0.5,
          },
        },
        {
          selector: 'node.search-match',
          style: {
            'border-width': 3,
            'border-color': '#0063f8',
            'z-index': 10,
          },
        },
        {
          selector: 'node.search-dim',
          style: {
            opacity: 0.25,
          },
        },
      ],
      // 只要索引提供了关系边，就用 cose 力导向布局把结构关系可视化出来（implements/
      // references/generates）；极少数没有任何关系边的情况下退回固定网格布局，
      // 保证 fit() 之后所有节点仍在可视区域内、大小一致、按类型分组。
      layout:
        visibleEdges.length > 0
          ? { name: 'cose', animate: false, padding: 30, nodeRepulsion: 8000 }
          : { name: 'grid', avoidOverlap: true, avoidOverlapPadding: 8, condense: false },
      userZoomingEnabled: true,
      userPanningEnabled: true,
      wheelSensitivity: 0.2,
    })
    cyRef.current = cy
    cy.one('layoutstop', () => cy.fit(undefined, 30))
    cy.on('tap', 'node', (evt) => onNodeClick(evt.target.id()))
    cy.on('mouseover', 'node', (evt) => {
      const node = evt.target
      node.addClass('hovered')
      node.connectedEdges().addClass('highlighted')
      container.style.cursor = 'pointer'
      const pos = node.renderedPosition()
      setHover({ title: node.data('label') as string, x: pos.x, y: pos.y })
    })
    cy.on('mouseout', 'node', (evt) => {
      const node = evt.target
      node.removeClass('hovered')
      node.connectedEdges().removeClass('highlighted')
      container.style.cursor = 'default'
      setHover(null)
    })
    return () => {
      cy.destroy()
      cyRef.current = null
    }
  }, [components, edges, communities, connectedOnly, activeWorkspaces, activeCommunity, onNodeClick])

  // Applies/clears the highlight classes on the LIVE cytoscape instance
  // whenever the match set or the underlying graph changes -- separate from
  // the graph-build effect above so re-searching doesn't tear down and
  // rebuild the whole cytoscape instance (which would reset pan/zoom/layout).
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    if (matchedIds === null) {
      cy.nodes().removeClass('search-match').removeClass('search-dim')
      return
    }
    cy.batch(() => {
      cy.nodes().forEach((node) => {
        const isMatch = matchedIds.has(node.id())
        node.toggleClass('search-match', isMatch)
        node.toggleClass('search-dim', !isMatch)
      })
    })
  }, [matchedIds, components, edges, communities, connectedOnly, activeWorkspaces, activeCommunity])

  return (
    <div className="flex h-[calc(100vh-160px)] min-h-[500px] w-full flex-col">
      {components.length > 0 && workspaces.length > 1 && (
        <GraphFilters
          workspaces={workspaces}
          activeWorkspaces={activeWorkspaces ?? new Set(workspaces)}
          onToggleWorkspace={toggleWorkspace}
          communityLabels={{}}
          activeCommunity={activeCommunity}
          onSelectCommunity={setActiveCommunity}
        />
      )}
      <div className="relative flex-1">
        <div ref={containerRef} data-testid="wiki-graph-canvas" className="w-full h-full" />
        {hover && (
          <div
            data-testid="wiki-graph-tooltip"
            className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full rounded border border-[#e8e8ed] bg-white px-2 py-1 text-xs text-[#1d1d1f] shadow-sm"
            style={{ left: hover.x, top: hover.y - 10 }}
          >
            {hover.title}
          </div>
        )}
        {components.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-[#6e6e73]">
            {gaveUp ? (
              <span>索引为空，请先注册工作区并重建（POST /api/wiki/rebuild）</span>
            ) : (
              <span className="animate-pulse">索引构建中…</span>
            )}
          </div>
        )}
        {components.length > 0 && (
          <>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="语义搜索节点…"
              aria-label="图谱语义搜索"
              className="absolute left-2 top-2 z-10 w-48 rounded border border-[#e8e8ed] bg-white px-2 py-1 text-xs text-[#1d1d1f] shadow-sm outline-none focus:border-[#0063f8]"
            />
            <div className="absolute left-2 top-11 z-10 flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => cyRef.current?.fit(undefined, 30)}
                className="rounded border border-[#e8e8ed] bg-white px-2 py-1 text-xs text-[#1d1d1f] shadow-sm hover:bg-[#f5f5f7]"
              >
                适应窗口
              </button>
              {hasEdges && (
                <label className="flex items-center gap-1 rounded border border-[#e8e8ed] bg-white px-2 py-1 text-xs text-[#1d1d1f] shadow-sm">
                  <input
                    type="checkbox"
                    checked={connectedOnly}
                    onChange={(e) => setConnectedOnly(e.target.checked)}
                  />
                  仅显示有关联的节点
                </label>
              )}
            </div>
            <div
              data-testid="wiki-graph-legend"
              className="absolute right-2 top-2 z-10 rounded border border-[#e8e8ed] bg-white/95 px-2 py-1.5 text-xs text-[#1d1d1f] shadow-sm"
            >
              <div className="mb-1 font-medium text-[#6e6e73]">类型图例</div>
              <div className="mb-1 text-[10px] text-[#8e8e93]">
                节点按类型着色；连线为组件间关系（implements / references / generates）
              </div>
              <ul className="space-y-0.5">
                {Object.entries(TYPE_COLORS).map(([type, color]) => (
                  <li key={type} className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <span>{type}</span>
                  </li>
                ))}
              </ul>
            </div>
            {topCommunities.length > 0 && (
              <div
                data-testid="wiki-graph-community-legend"
                className="absolute right-2 top-24 z-10 rounded border border-[#e8e8ed] bg-white/95 px-2 py-1.5 text-xs text-[#1d1d1f] shadow-sm"
              >
                <div className="mb-1 font-medium text-[#6e6e73]">社区图例</div>
                <ul className="flex flex-wrap gap-1.5">
                  {topCommunities.map((id) => {
                    const active = activeCommunity === id
                    return (
                      <li key={id}>
                        <button
                          type="button"
                          data-testid="wiki-graph-community-legend-item"
                          aria-pressed={active}
                          onClick={() => setActiveCommunity(active ? null : id)}
                          className={
                            active
                              ? 'flex items-center gap-1 rounded bg-[#1d1d1f]/10 px-1'
                              : 'flex items-center gap-1 rounded px-1 hover:bg-[#f5f5f7]'
                          }
                        >
                          <span
                            className="inline-block h-2 w-2 rounded-full border border-[#1d1d1f]/10"
                            style={{ backgroundColor: COMMUNITY_COLORS[id % COMMUNITY_COLORS.length] }}
                          />
                          <span>{effectiveCommunityLabels[String(id)] ?? `#${id}`}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
