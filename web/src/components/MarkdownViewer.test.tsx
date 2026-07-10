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

  it('renders a GFM table as real table markup, not raw pipe text', async () => {
    const table = '| A | B |\n| --- | --- |\n| 1 | 2 |'
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      text: async () => table,
    } as Response)

    const { container } = render(<MarkdownViewer path="/x/design.md" onClose={vi.fn()} />)

    await waitFor(() => expect(screen.getByText('A')).toBeTruthy())
    expect(container.querySelector('table')).not.toBeNull()
    expect(container.querySelectorAll('td').length).toBe(2)
    expect(screen.getByText('1')).toBeTruthy()
    expect(screen.getByText('2')).toBeTruthy()
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

  it('renders an artifact switcher when multiple artifacts are given, highlights the current one, and switches in place on click', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      const text = url.includes('design.md') ? '# 设计文档' : '# 任务清单'
      return { ok: true, text: async () => text } as Response
    })

    const artifacts = [
      { path: '/x/design.md', label: '设计文档' },
      { path: '/x/tasks.md', label: '任务清单' },
    ]
    const onClose = vi.fn()
    const onSelectArtifact = vi.fn()
    render(
      <MarkdownViewer
        path="/x/design.md"
        artifacts={artifacts}
        onSelectArtifact={onSelectArtifact}
        onClose={onClose}
      />,
    )

    await waitFor(() => expect(screen.getByText('设计文档')).toBeTruthy())

    const switcher = screen.getByTestId('artifact-switcher')
    const currentButton = screen.getAllByText('设计文档').find((el) => switcher.contains(el))!
    const otherButton = screen.getAllByText('任务清单').find((el) => switcher.contains(el))!
    expect(currentButton.getAttribute('aria-current')).toBe('true')
    expect(otherButton.getAttribute('aria-current')).toBe('false')

    otherButton.click()

    // Switching does not close the viewer — it delegates to onSelectArtifact
    // so the parent can update `path` in place.
    expect(onSelectArtifact).toHaveBeenCalledWith('/x/tasks.md')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('does not render the switcher with fewer than two artifacts', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      text: async () => '# Hello',
    } as Response)

    render(
      <MarkdownViewer
        path="/x/design.md"
        artifacts={[{ path: '/x/design.md', label: '设计文档' }]}
        onSelectArtifact={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    await waitFor(() => expect(screen.getByText('Hello')).toBeTruthy())
    expect(screen.queryByTestId('artifact-switcher')).toBeNull()
  })
})
