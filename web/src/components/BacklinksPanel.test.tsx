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

  it('shows a framed empty state with heading and explanatory text', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ component: { id: '/x', title: 'X' }, forward: [], backlinks: [] }),
    } as Response)
    render(<BacklinksPanel componentId="/x" />)
    await waitFor(() => expect(screen.getByText('反向引用')).toBeTruthy())
    expect(screen.getByText('该变更暂无其他文档引用')).toBeTruthy()
    expect(screen.getByText('—')).toBeTruthy()
  })

  it('renders backlink entries with source and kind when present', async () => {
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
    expect(screen.getByText('(implements)')).toBeTruthy()
    expect(screen.getByText('(references)')).toBeTruthy()
  })
})
