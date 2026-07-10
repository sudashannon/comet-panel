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
          { data: { id: '/x/a.md', label: 'A', color: TYPE_COLORS.spec } },
          { data: { id: '/x/b.md', label: 'B', color: TYPE_COLORS.plan } },
        ],
        layout: expect.objectContaining({ name: 'grid' }),
      }),
    )

    expect(mockCy.on).toHaveBeenCalledWith('tap', 'node', expect.any(Function))
    const tapHandler = mockCy.on.mock.calls[0][2] as (evt: { target: { id: () => string } }) => void
    tapHandler({ target: { id: () => '/x/a.md' } })
    expect(onNodeClick).toHaveBeenCalledWith('/x/a.md')

    unmount()
    expect(mockCy.destroy).toHaveBeenCalled()
  })

  it('renders a type legend once components load', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => [
        { id: '/x/a.md', type: 'spec', title: 'A', path: '/x/a.md', workspace: 'miao' },
        { id: '/x/b.md', type: 'plan', title: 'B', path: '/x/b.md', workspace: 'miao' },
      ],
    } as Response)
    const { getByTestId, getByText } = render(<WikiGraph onNodeClick={vi.fn()} />)

    await waitFor(() => expect(getByTestId('wiki-graph-legend')).toBeTruthy())
    expect(getByText('spec')).toBeTruthy()
    expect(getByText('plan')).toBeTruthy()
  })

  it('sorts edgeless nodes by type so grid layout clusters same-color nodes together', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => [
        { id: '/x/diagram.md', type: 'diagram', title: 'D', path: '/x/diagram.md', workspace: 'miao' },
        { id: '/x/change.md', type: 'change', title: 'C', path: '/x/change.md', workspace: 'miao' },
        { id: '/x/plan.md', type: 'plan', title: 'P', path: '/x/plan.md', workspace: 'miao' },
      ],
    } as Response)
    render(<WikiGraph onNodeClick={vi.fn()} />)

    await waitFor(() => expect(vi.mocked(cytoscape)).toHaveBeenCalled())
    const call = vi.mocked(cytoscape).mock.calls[0][0] as unknown as {
      elements: Array<{ data: { id: string } }>
    }
    expect(call.elements.map((el) => el.data.id)).toEqual(['/x/change.md', '/x/plan.md', '/x/diagram.md'])
  })

  it('shows an indexing message while polling, then a genuine empty-state message once polling gives up', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response)
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
      .mockResolvedValueOnce({ ok: true, json: async () => [] } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => [] } as Response)
      .mockResolvedValue({
        ok: true,
        json: async () => [
          { id: '/x/a.md', type: 'spec', title: 'A', path: '/x/a.md', workspace: 'miao' },
        ],
      } as Response)
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
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => [] } as Response)
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
