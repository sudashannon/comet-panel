import { render, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import cytoscape from 'cytoscape'
import { WikiGraph, TYPE_COLORS } from './WikiGraph'

const mockCy = {
  on: vi.fn(),
  destroy: vi.fn(),
}
vi.mock('cytoscape', () => ({
  default: vi.fn(() => mockCy),
}))

afterEach(() => vi.restoreAllMocks())

describe('WikiGraph', () => {
  it('fetches components, initializes cytoscape with mapped elements, wires tap-to-click, and destroys on unmount', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => [
        { id: '/x/a.md', type: 'spec', title: 'A', path: '/x/a.md', workspace: 'miao' },
        { id: '/x/b.md', type: 'plan', title: 'B', path: '/x/b.md', workspace: 'miao' },
      ],
    } as Response)
    const onNodeClick = vi.fn()
    const { container, unmount } = render(<WikiGraph onNodeClick={onNodeClick} />)
    await waitFor(() => expect(container.querySelector('[data-testid="wiki-graph-canvas"]')).toBeTruthy())

    await waitFor(() => expect(vi.mocked(cytoscape)).toHaveBeenCalled())
    expect(cytoscape).toHaveBeenCalledWith(
      expect.objectContaining({
        elements: [
          { data: { id: '/x/a.md', label: 'A' }, style: { 'background-color': TYPE_COLORS.spec } },
          { data: { id: '/x/b.md', label: 'B' }, style: { 'background-color': TYPE_COLORS.plan } },
        ],
      }),
    )

    expect(mockCy.on).toHaveBeenCalledWith('tap', 'node', expect.any(Function))
    const tapHandler = mockCy.on.mock.calls[0][2] as (evt: { target: { id: () => string } }) => void
    tapHandler({ target: { id: () => '/x/a.md' } })
    expect(onNodeClick).toHaveBeenCalledWith('/x/a.md')

    unmount()
    expect(mockCy.destroy).toHaveBeenCalled()
  })

  it('shows an empty-state message when the wiki index is empty', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response)
    const onNodeClick = vi.fn()
    const { getByText } = render(<WikiGraph onNodeClick={onNodeClick} />)

    await waitFor(() =>
      expect(getByText(/索引为空，请先注册工作区并重建（POST \/api\/wiki\/rebuild）/)).toBeTruthy(),
    )
    expect(cytoscape).not.toHaveBeenCalled()
  })
})
