import { useEffect, useRef, useState } from 'react'
import cytoscape from 'cytoscape'
import { fetchWikiIndex } from '../api/client'
import type { WikiComponent } from '../api/types'

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

export function WikiGraph({ onNodeClick }: { onNodeClick: (id: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<cytoscape.Core | null>(null)
  const [components, setComponents] = useState<WikiComponent[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    fetchWikiIndex()
      .then(setComponents)
      .catch(() => setComponents([]))
      .finally(() => setLoaded(true))
  }, [])

  useEffect(() => {
    if (!containerRef.current || components.length === 0) return
    const typeOrder = Object.keys(TYPE_COLORS)
    const sorted = [...components].sort(
      (a, b) => typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type),
    )
    const cy = cytoscape({
      container: containerRef.current,
      elements: sorted.map((c) => ({
        data: { id: c.id, label: c.title, color: TYPE_COLORS[c.type] ?? '#6e6e73' },
      })),
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
          selector: 'edge',
          style: {
            width: 0.5,
            'line-color': '#e8e8ed',
            'curve-style': 'bezier',
            opacity: 0.5,
          },
        },
      ],
      // 索引数据当前只有节点没有关系边，force-directed 布局会把无边节点甩到视野外；
      // 改用固定网格布局，保证 fit() 之后所有节点都在可视区域内、大小一致、按类型分组。
      layout: {
        name: 'grid',
        avoidOverlap: true,
        avoidOverlapPadding: 8,
        condense: false,
      },
      userZoomingEnabled: true,
      userPanningEnabled: true,
      wheelSensitivity: 0.2,
    })
    cyRef.current = cy
    cy.one('layoutstop', () => cy.fit(undefined, 30))
    cy.on('tap', 'node', (evt) => onNodeClick(evt.target.id()))
    return () => {
      cy.destroy()
      cyRef.current = null
    }
  }, [components, onNodeClick])

  if (loaded && components.length === 0) {
    return (
      <div className="w-full h-[500px] flex items-center justify-center text-xs text-[#6e6e73]">
        索引为空，请先注册工作区并重建（POST /api/wiki/rebuild）
      </div>
    )
  }

  return (
    <div className="relative w-full h-[500px]">
      <div ref={containerRef} data-testid="wiki-graph-canvas" className="w-full h-full" />
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
            <div className="mb-1 text-[10px] text-[#8e8e93]">按类型着色的组件目录（索引暂无关系边）</div>
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
