import { act, render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { WikiTimeline } from './WikiTimeline'

function mockGraphResponse(components: unknown[], communities?: Record<string, number>) {
  return { ok: true, json: async () => ({ components, edges: [], communities }) } as Response
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('WikiTimeline', () => {
  it('shows a loading state, then an empty-state message when there are no changes', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockGraphResponse([]))
    render(<WikiTimeline />)
    expect(screen.getByText('加载中…')).toBeTruthy()
    await waitFor(() => expect(screen.getByText('暂无变更数据')).toBeTruthy())
  })

  it('renders one bar per change component, grouped by workspace, colored by community', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockGraphResponse(
        [
          {
            id: 'c1',
            type: 'change',
            title: 'Add timeline view',
            path: 'openspec/changes/c1',
            workspace: 'comet-panel',
            frontmatter: { created_at: '2026-01-01T00:00:00Z', phase: 'build' },
            updatedAt: '2026-01-05T00:00:00Z',
          },
          {
            id: 'c2',
            type: 'change',
            title: 'Fix lint rule',
            path: 'openspec/changes/c2',
            workspace: 'other-repo',
            frontmatter: { created_at: '2026-02-01T00:00:00Z', phase: 'verify' },
            updatedAt: '2026-02-03T00:00:00Z',
          },
          {
            id: 'p1',
            type: 'plan',
            title: 'Not a change',
            path: 'openspec/changes/c1/plan.md',
            workspace: 'comet-panel',
          },
        ],
        { c1: 0, c2: 1 },
      ),
    )
    render(<WikiTimeline />)

    await waitFor(() => expect(screen.getByTestId('wiki-timeline')).toBeTruthy())
    expect(screen.getAllByTestId('wiki-timeline-bar')).toHaveLength(2)
    expect(screen.getAllByText('comet-panel').length).toBeGreaterThan(0)
    expect(screen.getAllByText('other-repo').length).toBeGreaterThan(0)
  })

  it('shows a hover tooltip with the title and phase', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockGraphResponse(
        [
          {
            id: 'c1',
            type: 'change',
            title: 'Add timeline view',
            path: 'openspec/changes/c1',
            workspace: 'comet-panel',
            frontmatter: { created_at: '2026-01-01T00:00:00Z', phase: 'build' },
            updatedAt: '2026-01-05T00:00:00Z',
          },
        ],
        { c1: 0 },
      ),
    )
    render(<WikiTimeline />)

    await waitFor(() => expect(screen.getAllByTestId('wiki-timeline-bar')).toHaveLength(1))
    fireEvent.mouseEnter(screen.getByTestId('wiki-timeline-bar'), { clientX: 10, clientY: 10 })
    expect(screen.getByTestId('wiki-timeline-tooltip').textContent).toContain('Add timeline view')
    expect(screen.getByTestId('wiki-timeline-tooltip').textContent).toContain('build')
  })

  it('falls back to an empty component list when the fetch fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 500 } as Response)
    render(<WikiTimeline />)
    await waitFor(() => expect(screen.getByText('暂无变更数据')).toBeTruthy())
  })

  it('filters bars by workspace chip toggle', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockGraphResponse(
        [
          {
            id: 'c1',
            type: 'change',
            title: 'Add timeline view',
            path: 'openspec/changes/c1',
            workspace: 'comet-panel',
            frontmatter: { created_at: '2026-01-01T00:00:00Z', phase: 'build' },
            updatedAt: '2026-01-05T00:00:00Z',
          },
          {
            id: 'c2',
            type: 'change',
            title: 'Fix lint rule',
            path: 'openspec/changes/c2',
            workspace: 'other-repo',
            frontmatter: { created_at: '2026-02-01T00:00:00Z', phase: 'verify' },
            updatedAt: '2026-02-03T00:00:00Z',
          },
        ],
        { c1: 0, c2: 1 },
      ),
    )
    render(<WikiTimeline />)

    await waitFor(() => expect(screen.getAllByTestId('wiki-timeline-bar')).toHaveLength(2))
    const chips = screen.getAllByTestId('workspace-chip')
    const otherRepoChip = chips.find((el) => el.textContent === 'other-repo')!
    fireEvent.click(otherRepoChip)

    await waitFor(() => expect(screen.getAllByTestId('wiki-timeline-bar')).toHaveLength(1))
  })

  it('filters bars to a single community when its legend entry is clicked', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockGraphResponse(
        [
          {
            id: 'c1',
            type: 'change',
            title: 'Add timeline view',
            path: 'openspec/changes/c1',
            workspace: 'comet-panel',
            frontmatter: { created_at: '2026-01-01T00:00:00Z', phase: 'build' },
            updatedAt: '2026-01-05T00:00:00Z',
          },
          {
            id: 'c2',
            type: 'change',
            title: 'Fix lint rule',
            path: 'openspec/changes/c2',
            workspace: 'other-repo',
            frontmatter: { created_at: '2026-02-01T00:00:00Z', phase: 'verify' },
            updatedAt: '2026-02-03T00:00:00Z',
          },
        ],
        { c1: 0, c2: 1 },
      ),
    )
    render(<WikiTimeline />)

    await waitFor(() => expect(screen.getAllByTestId('wiki-timeline-bar')).toHaveLength(2))
    const chips = screen.getAllByTestId('community-chip')
    const communityZeroChip = chips.find((el) => el.textContent?.includes('#0'))!
    fireEvent.click(communityZeroChip)

    await waitFor(() => expect(screen.getAllByTestId('wiki-timeline-bar')).toHaveLength(1))
  })

  it('refetches the graph when the SSE hook fires a graph-updated event', async () => {
    class MockEventSource {
      static instance: MockEventSource | null = null
      listeners: Record<string, Array<() => void>> = {}
      constructor() {
        MockEventSource.instance = this
      }
      addEventListener(type: string, cb: () => void) {
        ;(this.listeners[type] ??= []).push(cb)
      }
      close() {}
    }
    vi.stubGlobal('EventSource', MockEventSource)

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockGraphResponse([
        {
          id: 'c1',
          type: 'change',
          title: 'A',
          path: 'openspec/changes/c1',
          workspace: 'comet-panel',
          frontmatter: { created_at: '2026-01-01T00:00:00Z' },
          updatedAt: '2026-01-05T00:00:00Z',
        },
      ]),
    )
    render(<WikiTimeline />)

    await waitFor(() => expect(screen.getAllByTestId('wiki-timeline-bar')).toHaveLength(1))
    const callsBeforeEvent = fetchMock.mock.calls.length

    await act(async () => {
      MockEventSource.instance!.listeners['graph-updated']?.forEach((cb) => cb())
    })

    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(callsBeforeEvent))
    vi.unstubAllGlobals()
  })
})
