import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { BacklinksPanel } from './BacklinksPanel'

afterEach(() => vi.restoreAllMocks())

describe('BacklinksPanel', () => {
  it('fetches and lists backlinks for the given component', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        component: { id: '/x/design.md', title: 'Design Doc' },
        forward: [],
        backlinks: [{ from: '/x/.comet.yaml', to: '/x/design.md', kind: 'implements', source: 'yaml' }],
      }),
    } as Response)

    render(<BacklinksPanel componentId="/x/design.md" />)
    await waitFor(() => expect(screen.getByText(/1 处引用/)).toBeTruthy())
  })

  it('shows framed empty states for both directions when there is no data', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ component: { id: '/x', title: 'X' }, forward: [], backlinks: [] }),
    } as Response)
    render(<BacklinksPanel componentId="/x" />)
    await waitFor(() => expect(screen.getByText('本文档未引用其他文档')).toBeTruthy())
    expect(screen.getByText('暂无其他文档引用本文档')).toBeTruthy()
    expect(screen.getAllByText('—')).toHaveLength(2)
  })

  it('renders backlink entries with kind badges when present', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        component: { id: '/x/design.md', title: 'Design Doc' },
        forward: [],
        backlinks: [
          { from: '/x/.comet.yaml', to: '/x/design.md', kind: 'implements', source: 'yaml' },
          { from: '/y/tasks.md', to: '/x/design.md', kind: 'references', source: 'md' },
        ],
      }),
    } as Response)
    render(<BacklinksPanel componentId="/x/design.md" />)
    await waitFor(() => expect(screen.getByText('/x/.comet.yaml')).toBeTruthy())
    expect(screen.getByText('/y/tasks.md')).toBeTruthy()
    expect(screen.getAllByText('implements')).toHaveLength(1)
    expect(screen.getAllByText('references')).toHaveLength(1)
  })

  it('renders forward edges — the key case: a change with only forward links is no longer blank', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        component: { id: '/changes/foo', title: 'Foo Change' },
        forward: [
          { from: '/changes/foo', to: '/changes/foo/design.md', kind: 'implements', source: 'yaml' },
          { from: '/changes/foo', to: '/changes/foo/tasks.md', kind: 'implements', source: 'yaml' },
          { from: '/changes/foo', to: '/reports/verify.md', kind: 'references', source: 'md' },
        ],
        backlinks: [],
      }),
    } as Response)
    render(<BacklinksPanel componentId="/changes/foo" />)
    await waitFor(() => expect(screen.getByText(/3 处引用/)).toBeTruthy())
    expect(screen.getByText('/changes/foo/design.md')).toBeTruthy()
    expect(screen.getByText('/changes/foo/tasks.md')).toBeTruthy()
    expect(screen.getByText('/reports/verify.md')).toBeTruthy()
    expect(screen.getAllByText('implements')).toHaveLength(2)
    expect(screen.getAllByText('references')).toHaveLength(1)
    // backlinks direction is empty, but the panel is not blank
    expect(screen.getByText('暂无其他文档引用本文档')).toBeTruthy()
  })

  it('shows a 0 count consistently for both directions when only one side has data', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        component: { id: '/x/design.md', title: 'Design Doc' },
        forward: [{ from: '/x/design.md', to: '/x/tasks.md', kind: 'implements', source: 'yaml' }],
        backlinks: [],
      }),
    } as Response)
    render(<BacklinksPanel componentId="/x/design.md" />)
    await waitFor(() => expect(screen.getByText(/引用（forward）（1 处引用）/)).toBeTruthy())
    expect(screen.getByText(/反向引用（0 处引用）/)).toBeTruthy()
  })
})
