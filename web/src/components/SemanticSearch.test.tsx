import { act, render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { SemanticSearch } from './SemanticSearch'
import { embed } from '@ternlight/mini'
import type { EmbeddingItem } from '../api/types'

afterEach(() => {
  vi.restoreAllMocks()
})

// Two fixture vectors, deliberately built from the *real* embed() output so
// the cosine-similarity ranking exercised below is genuine: `matching` is
// exactly the query's own embedding (similarity 1) and `unrelated` is an
// orthogonal-ish vector embedded from unrelated text.
function buildItems(query: string): EmbeddingItem[] {
  const matchingVector = Array.from(embed(query))
  const unrelatedVector = Array.from(embed('completely different topic about gardening'))
  return [
    { id: 'match-1', title: 'Matching Doc', workspace: 'ws-a', type: 'design', vector: matchingVector },
    { id: 'unrelated-1', title: 'Unrelated Doc', workspace: 'ws-b', type: 'spec', vector: unrelatedVector },
  ]
}

describe('SemanticSearch', () => {
  it('fetches embeddings on mount and ranks results by cosine similarity as the user types', async () => {
    const items = buildItems('reset my password')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ items }),
    } as Response)

    render(<SemanticSearch onNodeClick={() => {}} />)

    const input = await waitFor(() => screen.getByLabelText('语义搜索') as HTMLInputElement)
    await waitFor(() => expect(input.disabled).toBe(false))

    fireEvent.change(input, { target: { value: 'reset my password' } })

    await waitFor(() => expect(screen.getByText('Matching Doc')).toBeTruthy(), { timeout: 2000 })
    expect(screen.getByText('100%')).toBeTruthy()
    expect(screen.getByText('Unrelated Doc')).toBeTruthy()

    // The matching item's result row must precede the unrelated one.
    const rows = screen.getAllByRole('button').filter((b) => b.textContent?.includes('Doc'))
    expect(rows[0].textContent).toContain('Matching Doc')
  })

  it('calls onNodeClick with the component id when a result is clicked', async () => {
    const items = buildItems('reset my password')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ items }),
    } as Response)
    const onNodeClick = vi.fn()

    render(<SemanticSearch onNodeClick={onNodeClick} />)
    const input = await waitFor(() => screen.getByLabelText('语义搜索') as HTMLInputElement)
    await waitFor(() => expect(input.disabled).toBe(false))
    fireEvent.change(input, { target: { value: 'reset my password' } })

    const resultButton = await waitFor(() => screen.getByText('Matching Doc'), { timeout: 2000 })
    fireEvent.click(resultButton)
    expect(onNodeClick).toHaveBeenCalledWith('match-1')
  })

  it('shows a load error when the embeddings fetch fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 500 } as Response)

    render(<SemanticSearch onNodeClick={() => {}} />)

    await waitFor(() => expect(screen.getByText('无法加载语义索引')).toBeTruthy())
  })

  it('clears results when the query is emptied', async () => {
    const items = buildItems('reset my password')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ items }),
    } as Response)

    render(<SemanticSearch onNodeClick={() => {}} />)
    const input = await waitFor(() => screen.getByLabelText('语义搜索') as HTMLInputElement)
    await waitFor(() => expect(input.disabled).toBe(false))

    fireEvent.change(input, { target: { value: 'reset my password' } })
    await waitFor(() => expect(screen.getByText('Matching Doc')).toBeTruthy(), { timeout: 2000 })

    fireEvent.change(input, { target: { value: '' } })
    await waitFor(() => expect(screen.queryByText('Matching Doc')).toBeFalsy())
  })

  it('refetches embeddings when the SSE hook fires a graph-updated event', async () => {
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

    const items = buildItems('reset my password')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ items }),
    } as Response)

    render(<SemanticSearch onNodeClick={() => {}} />)
    const input = await waitFor(() => screen.getByLabelText('语义搜索') as HTMLInputElement)
    await waitFor(() => expect(input.disabled).toBe(false))
    const callsBeforeEvent = fetchMock.mock.calls.length

    await act(async () => {
      MockEventSource.instance!.listeners['graph-updated']?.forEach((cb) => cb())
    })

    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(callsBeforeEvent))
    vi.unstubAllGlobals()
  })
})
