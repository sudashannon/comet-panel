import { act, render, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import cytoscape from 'cytoscape'
import { WikiGraph, TYPE_COLORS } from './WikiGraph'

const mockCy = {
  on: vi.fn(),
  one: vi.fn(),
  fit: vi.fn(),
  destroy: vi.fn(),
}
vi.mock('cytoscape', () => ({
  default: vi.fn(() => mockCy),
}))

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

function mockGraphResponse(components: unknown[], edges: unknown[] = []) {
  return { ok: true, json: async () => ({ components, edges }) } as Response
}

describe('WikiGraph', () => {
  it('fetches components+edges, initializes cytoscape with mapped elements, wires tap-to-click, and destroys on unmount', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockGraphResponse(
        [
          { id: '/x/a.md', type: 'spec', title: 'A', path: '/x/a.md', workspace: 'miao' },
          { id: '/x/b.md', type: 'plan', title: 'B', path: '/x/b.md', workspace: 'miao' },
        ],
        [{ from: '/x/a.md', to: '/x/b.md', kind: 'references', source: 'markdown-link' }],
      ),
    )
    const onNodeClick = vi.fn()
    const { container, unmount } = render(<WikiGraph onNodeClick={onNodeClick} />)
    await waitFor(() => expect(container.querySelector('[data-testid="wiki-graph-canvas"]')).toBeTruthy())

    await waitFor(() => expect(vi.mocked(cytoscape)).toHaveBeenCalled())
    const call = vi.mocked(cytoscape).mock.calls[0][0] as unknown as {
      elements: Array<{ data: { id: string; source?: string; target?: string; kind?: string } }>
      layout: { name: string }
    }
    expect(call.elements).toEqual([
      { data: { id: '/x/a.md', label: 'A', color: TYPE_COLORS.spec } },
      { data: { id: '/x/b.md', label: 'B', color: TYPE_COLORS.plan } },
      { data: { id: 'e0', source: '/x/a.md', target: '/x/b.md', kind: 'references', color: '#16a34a' } },
    ])
    // Edges present -> force-directed layout reveals structure instead of the flat grid.
    expect(call.layout.name).toBe('cose')

    expect(mockCy.on).toHaveBeenCalledWith('tap', 'node', expect.any(Function))
    const tapHandler = mockCy.on.mock.calls.find((c) => c[0] === 'tap')![2] as (evt: {
      target: { id: () => string }
    }) => void
    tapHandler({ target: { id: () => '/x/a.md' } })
    expect(onNodeClick).toHaveBeenCalledWith('/x/a.md')

    unmount()
    expect(mockCy.destroy).toHaveBeenCalled()
  })

  it('renders a type legend once components load', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockGraphResponse([
        { id: '/x/a.md', type: 'spec', title: 'A', path: '/x/a.md', workspace: 'miao' },
        { id: '/x/b.md', type: 'plan', title: 'B', path: '/x/b.md', workspace: 'miao' },
      ]),
    )
    const { getByTestId, getByText } = render(<WikiGraph onNodeClick={vi.fn()} />)

    await waitFor(() => expect(getByTestId('wiki-graph-legend')).toBeTruthy())
    expect(getByText('spec')).toBeTruthy()
    expect(getByText('plan')).toBeTruthy()
  })

  it('sorts edgeless nodes by type and falls back to grid layout when there are zero edges', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockGraphResponse([
        { id: '/x/diagram.md', type: 'diagram', title: 'D', path: '/x/diagram.md', workspace: 'miao' },
        { id: '/x/change.md', type: 'change', title: 'C', path: '/x/change.md', workspace: 'miao' },
        { id: '/x/plan.md', type: 'plan', title: 'P', path: '/x/plan.md', workspace: 'miao' },
      ]),
    )
    render(<WikiGraph onNodeClick={vi.fn()} />)

    await waitFor(() => expect(vi.mocked(cytoscape)).toHaveBeenCalled())
    const call = vi.mocked(cytoscape).mock.calls[0][0] as unknown as {
      elements: Array<{ data: { id: string } }>
      layout: { name: string }
    }
    expect(call.elements.map((el) => el.data.id)).toEqual(['/x/change.md', '/x/plan.md', '/x/diagram.md'])
    expect(call.layout.name).toBe('grid')
  })

  it('shows a hover tooltip with the node title and connected-edge highlight on mouseover', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockGraphResponse(
        [
          { id: '/x/a.md', type: 'spec', title: 'A标题', path: '/x/a.md', workspace: 'miao' },
          { id: '/x/b.md', type: 'plan', title: 'B', path: '/x/b.md', workspace: 'miao' },
        ],
        [{ from: '/x/a.md', to: '/x/b.md', kind: 'references', source: 'markdown-link' }],
      ),
    )
    const { getByTestId, queryByTestId } = render(<WikiGraph onNodeClick={vi.fn()} />)
    await waitFor(() => expect(vi.mocked(cytoscape)).toHaveBeenCalled())

    expect(queryByTestId('wiki-graph-tooltip')).toBeNull()

    const connectedEdges = { addClass: vi.fn(), removeClass: vi.fn() }
    const fakeNode = {
      addClass: vi.fn(),
      removeClass: vi.fn(),
      connectedEdges: vi.fn(() => connectedEdges),
      renderedPosition: vi.fn(() => ({ x: 42, y: 24 })),
      data: vi.fn(() => 'A标题'),
    }
    const mouseoverHandler = mockCy.on.mock.calls.find((c) => c[0] === 'mouseover')![2] as (evt: {
      target: typeof fakeNode
    }) => void
    const mouseoutHandler = mockCy.on.mock.calls.find((c) => c[0] === 'mouseout')![2] as (evt: {
      target: typeof fakeNode
    }) => void

    act(() => mouseoverHandler({ target: fakeNode }))
    await waitFor(() => expect(getByTestId('wiki-graph-tooltip').textContent).toBe('A标题'))
    expect(fakeNode.addClass).toHaveBeenCalledWith('hovered')
    expect(connectedEdges.addClass).toHaveBeenCalledWith('highlighted')

    act(() => mouseoutHandler({ target: fakeNode }))
    await waitFor(() => expect(queryByTestId('wiki-graph-tooltip')).toBeNull())
    expect(connectedEdges.removeClass).toHaveBeenCalledWith('highlighted')
  })

  it('shows an indexing message while polling, then a genuine empty-state message once polling gives up', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockGraphResponse([]))
    const onNodeClick = vi.fn()
    const { getByText } = render(<WikiGraph onNodeClick={onNodeClick} />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(getByText('索引构建中…')).toBeTruthy()
    expect(cytoscape).not.toHaveBeenCalled()

    // 20 attempts total, 3s apart -> advance past the full poll window.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20 * 3000)
    })

    expect(getByText(/索引为空，请先注册工作区并重建（POST \/api\/wiki\/rebuild）/)).toBeTruthy()
    expect(cytoscape).not.toHaveBeenCalled()
  })

  it('auto-populates once a later poll returns data, without manual view-switching', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(mockGraphResponse([]))
      .mockResolvedValueOnce(mockGraphResponse([]))
      .mockResolvedValue(
        mockGraphResponse([{ id: '/x/a.md', type: 'spec', title: 'A', path: '/x/a.md', workspace: 'miao' }]),
      )
    const { getByText, getByTestId } = render(<WikiGraph onNodeClick={vi.fn()} />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(getByText('索引构建中…')).toBeTruthy()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    expect(getByText('索引构建中…')).toBeTruthy()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    await waitFor(() => expect(getByTestId('wiki-graph-legend')).toBeTruthy())
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('stops polling and does not update state after unmount', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockGraphResponse([]))
    const { unmount } = render(<WikiGraph onNodeClick={vi.fn()} />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    const callsBeforeUnmount = fetchMock.mock.calls.length

    unmount()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000)
    })
    expect(fetchMock.mock.calls.length).toBe(callsBeforeUnmount)
  })
})
