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

  it('strips a leading YAML frontmatter block before rendering', async () => {
    const raw =
      '---\ncomet_change: foo\nrole: technical-design\ncanonical_spec: openspec\n---\n# Real Title\n\nBody.'
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      text: async () => raw,
    } as Response)

    render(<MarkdownViewer path="/x/design.md" onClose={vi.fn()} />)

    await waitFor(() => expect(screen.getByText('Real Title')).toBeTruthy())
    // Frontmatter keys must not appear in the rendered document.
    expect(screen.queryByText('comet_change: foo')).toBeNull()
    expect(screen.queryByText('canonical_spec: openspec')).toBeNull()
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

  it('calls onClose when Escape is pressed', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      text: async () => '# Hello',
    } as Response)

    const onClose = vi.fn()
    render(<MarkdownViewer path="/x/design.md" onClose={onClose} />)
    await waitFor(() => expect(screen.getByText('Hello')).toBeTruthy())

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
