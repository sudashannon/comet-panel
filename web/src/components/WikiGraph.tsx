import { useEffect, useRef, useState } from 'react'
import cytoscape from 'cytoscape'
import { fetchWikiGraph } from '../api/client'
import type { WikiComponent, WikiEdge } from '../api/types'

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

const POLL_INTERVAL_MS = 3000
const MAX_POLL_ATTEMPTS = 20

export function WikiGraph({ onNodeClick }: { onNodeClick: (id: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<cytoscape.Core | null>(null)
  const [components, setComponents] = useState<WikiComponent[]>([])
  const [edges, setEdges] = useState<WikiEdge[]>([])
  const [gaveUp, setGaveUp] = useState(false)
  const [hover, setHover] = useState<{ title: string; x: number; y: number } | null>(null)
  // 关系边只占 794 个节点里的一小部分（约 222 条边、189 个有关联节点），其余
  // 605 个孤立节点会被 cose/grid 布局铺成一整屏色点，反而把真正的关系子图挤到
  // 角落。默认只显示有关联的节点，把关系子图放到画面中心；没有边时该开关无意义
  // （筛选后会清空画布），因此仅显示全部节点。
  const [connectedOnly, setConnectedOnly] = useState(true)

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

  const hasEdges = edges.length > 0

  useEffect(() => {
    if (!containerRef.current || components.length === 0) return
    const typeOrder = Object.keys(TYPE_COLORS)
    const sorted = [...components].sort(
      (a, b) => typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type),
    )
    const componentIds = new Set(sorted.map((c) => c.id))
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
    const visible = connectedOnly && validEdges.length > 0 ? sorted.filter((c) => connectedIds.has(c.id)) : sorted
    const visibleIds = new Set(visible.map((c) => c.id))
    const visibleEdges = validEdges.filter((e) => visibleIds.has(e.from) && visibleIds.has(e.to))
    const container = containerRef.current
    const cy = cytoscape({
      container,
      elements: [
        ...visible.map((c) => ({
          data: { id: c.id, label: c.title, color: TYPE_COLORS[c.type] ?? '#6e6e73' },
        })),
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
            'border-width': 1,
            'border-color': '#ffffff',
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
  }, [components, edges, connectedOnly, onNodeClick])

  return (
    <div className="relative flex h-[calc(100vh-160px)] min-h-[500px] w-full flex-col">
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
          <div className="absolute left-2 top-2 z-10 flex items-center gap-1.5">
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
        </>
      )}
    </div>
  )
}
