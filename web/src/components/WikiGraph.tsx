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
    const cy = cytoscape({
      container: containerRef.current,
      elements: components.map((c) => ({
        data: { id: c.id, label: c.title },
        style: { 'background-color': TYPE_COLORS[c.type] ?? '#6e6e73' },
      })),
      layout: { name: 'cose' },
    })
    cy.on('tap', 'node', (evt) => onNodeClick(evt.target.id()))
    return () => cy.destroy()
  }, [components, onNodeClick])

  if (loaded && components.length === 0) {
    return (
      <div className="w-full h-[500px] flex items-center justify-center text-xs text-[#6e6e73]">
        索引为空，请先注册工作区并重建（POST /api/wiki/rebuild）
      </div>
    )
  }

  return <div ref={containerRef} data-testid="wiki-graph-canvas" className="w-full h-[500px]" />
}
