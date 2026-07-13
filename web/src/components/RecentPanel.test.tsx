import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { RecentPanel } from './RecentPanel'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('RecentPanel', () => {
  it('renders fetched items sorted newest first with type badge, workspace, and relative time', async () => {
    const now = Date.now()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: '/x/a.md',
          title: 'A doc',
          type: 'spec',
          workspace: 'miao',
          updatedAt: new Date(now - 2 * 3600_000).toISOString(),
          path: '/x/a.md',
        },
        {
          id: '/x/b.md',
          title: 'B doc',
          type: 'design',
          workspace: 'miao',
          updatedAt: new Date(now - 30 * 60_000).toISOString(),
          path: '/x/b.md',
        },
      ],
    } as Response)

    render(<RecentPanel />)
    await waitFor(() => expect(screen.getByText('A doc')).toBeTruthy())
    expect(screen.getByText('B doc')).toBeTruthy()
    expect(screen.getByText('spec')).toBeTruthy()
    expect(screen.getByText('design')).toBeTruthy()
    expect(screen.getAllByText('miao').length).toBe(2)
    expect(screen.getByText('2小时前')).toBeTruthy()
    expect(screen.getByText('30分钟前')).toBeTruthy()
  })

  it('calls onOpen with the item path when clicked', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: '/x/a.md',
          title: 'A doc',
          type: 'spec',
          workspace: 'miao',
          updatedAt: new Date().toISOString(),
          path: '/x/a.md',
        },
      ],
    } as Response)
    const onOpen = vi.fn()
    render(<RecentPanel onOpen={onOpen} />)
    await waitFor(() => expect(screen.getByText('A doc')).toBeTruthy())
    fireEvent.click(screen.getByText('A doc'))
    expect(onOpen).toHaveBeenCalledWith('/x/a.md')
  })

  it('shows an empty-state message when there are no recent items', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response)
    render(<RecentPanel />)
    await waitFor(() => expect(screen.getByText('暂无最近变更')).toBeTruthy())
  })

  it('shows a load error message when the fetch fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    } as Response)
    render(<RecentPanel />)
    await waitFor(() => expect(screen.getByText('加载失败')).toBeTruthy())
  })
})
