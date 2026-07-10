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
    const container = containerRef.current
    const cy = cytoscape({
      container,
      elements: [
        ...sorted.map((c) => ({
          data: { id: c.id, label: c.title, color: TYPE_COLORS[c.type] ?? '#6e6e73' },
        })),
        ...validEdges.map((e, i) => ({
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
        validEdges.length > 0
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
  }, [components, edges, onNodeClick])

  return (
    <div className="relative w-full h-[500px]">
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
          <button
            type="button"
            onClick={() => cyRef.current?.fit(undefined, 30)}
            className="absolute left-2 top-2 z-10 rounded border border-[#e8e8ed] bg-white px-2 py-1 text-xs text-[#1d1d1f] shadow-sm hover:bg-[#f5f5f7]"
          >
            适应窗口
          </button>
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
