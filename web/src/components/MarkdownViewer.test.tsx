import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { MarkdownViewer } from './MarkdownViewer'

afterEach(() => vi.restoreAllMocks())

describe('MarkdownViewer', () => {
  it('renders nothing when path is null', () => {
    const { container } = render(<MarkdownViewer path={null} onClose={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('fetches and renders markdown content for the given path', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      text: async () => '# Hello\n\nSome **body** text.',
    } as Response)

    render(<MarkdownViewer path="/x/design.md" onClose={vi.fn()} />)

    await waitFor(() => expect(screen.getByText('Hello')).toBeTruthy())
    expect(screen.getByText('body')).toBeTruthy()
  })

  it('calls onClose when the close button is clicked', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      text: async () => '# Hello',
    } as Response)

    const onClose = vi.fn()
    render(<MarkdownViewer path="/x/design.md" onClose={onClose} />)
    await waitFor(() => expect(screen.getByText('Hello')).toBeTruthy())

    screen.getByText('✕ 关闭').click()
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
