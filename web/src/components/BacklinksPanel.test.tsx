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

  it('shows an empty state with zero backlinks', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ component: { id: '/x', title: 'X' }, forward: [], backlinks: [] }),
    } as Response)
    render(<BacklinksPanel componentId="/x" />)
    await waitFor(() => expect(screen.getByText('暂无反向引用')).toBeTruthy())
  })
})
