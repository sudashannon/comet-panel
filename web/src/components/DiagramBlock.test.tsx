import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import mermaid from 'mermaid'
import { DiagramBlock } from './DiagramBlock'

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(),
  },
}))

afterEach(() => vi.restoreAllMocks())

describe('DiagramBlock', () => {
  it('renders a mermaid diagram by inserting the SVG returned by mermaid.render', async () => {
    vi.mocked(mermaid.render).mockResolvedValue({
      svg: '<svg data-testid="fake-mermaid-svg"></svg>',
      diagramType: 'flowchart-v2',
    })

    const { container } = render(<DiagramBlock language="mermaid" code="graph TD;A-->B" />)

    await waitFor(() =>
      expect(container.querySelector('[data-testid="fake-mermaid-svg"]')).toBeTruthy(),
    )
    expect(mermaid.render).toHaveBeenCalledWith(expect.stringMatching(/^mermaid-/), 'graph TD;A-->B')
  })

  it('shows the raw code as a fallback when mermaid.render fails', async () => {
    vi.mocked(mermaid.render).mockRejectedValue(new Error('parse error'))

    render(<DiagramBlock language="mermaid" code="invalid mermaid syntax" />)

    await waitFor(() => expect(screen.getByText('invalid mermaid syntax')).toBeTruthy())
  })

  it('renders a plantuml diagram by fetching the SVG from Kroki', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      text: async () => '<svg data-testid="fake-kroki-svg"></svg>',
    } as Response)

    const { container } = render(
      <DiagramBlock language="plantuml" code={'@startuml\nAlice -> Bob\n@enduml'} />,
    )

    await waitFor(() =>
      expect(container.querySelector('[data-testid="fake-kroki-svg"]')).toBeTruthy(),
    )
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('https://kroki.io/plantuml/svg/'))
  })

  it('shows the raw code as a fallback when the Kroki request fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network error'))

    render(<DiagramBlock language="plantuml" code="@startuml Alice -> Bob @enduml" />)

    await waitFor(() => expect(screen.getByText('@startuml Alice -> Bob @enduml')).toBeTruthy())
  })
})
