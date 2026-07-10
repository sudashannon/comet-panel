import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import App from './App'
import { fetchWorkspaces, fetchChangesWithMeta, fetchWikiIndex, fetchLintIssues, fetchChatSession } from './api/client'
import type { ChangeSummary, WorkspaceConfig } from './api/types'

// WikiGraph mounts a real cytoscape instance with a cose layout and
// `cy.fit()` on 'layoutstop'; that layout engine doesn't run correctly in
// jsdom (WikiGraph.test.tsx mocks cytoscape directly to cover that). At the
// App level we only care that switching to 图谱 mounts WikiGraph and wires
// its onNodeClick — so mock the component itself rather than cytoscape.
vi.mock('./components/WikiGraph', () => ({
  WikiGraph: () => <div data-testid="wiki-graph-canvas" />,
}))

// Regression test for the Critical finding in Task 17 review: the Go backend
// genuinely returns "changes": null (nil slice) in two real scenarios —
// empty/misconfigured single-dir mode, and multi-workspace mode where ALL
// registered workspaces are unreadable. Without a null-guard at the App.tsx
// call site, `setChanges(null)` makes `changes.find(...)` (computing
// selectedChange) throw during render, crashing the whole app with no error
// boundary — before the warning banner (this task's own feature) ever gets a
// chance to render.
vi.mock('./api/client', () => ({
  fetchWorkspaces: vi.fn().mockResolvedValue(null),
  addWorkspace: vi.fn(),
  fetchChangesWithMeta: vi.fn().mockResolvedValue({ changes: null, failedWorkspaces: ['broken-ws'] }),
  fetchWikiIndex: vi.fn().mockResolvedValue([]),
  fetchWikiLint: vi.fn().mockResolvedValue([]),
  fetchLintIssues: vi.fn().mockResolvedValue([]),
  fetchChangeDetail: vi.fn().mockResolvedValue({
    name: '', workflow: '', phase: '', archived: false, tasksCompleted: 0, tasksTotal: 0,
    verifyResult: '', createdAt: '', phases: [],
  }),
  fetchWikiComponent: vi.fn().mockResolvedValue({ component: { id: '', title: '' }, forward: [], backlinks: [] }),
  fetchChatSession: vi.fn().mockResolvedValue({
    change: '', messages: [], context_files: [], usage: { total_input: 0, total_output: 0 }, created_at: '', updated_at: '',
  }),
  streamChat: vi.fn(),
}))

function makeChange(overrides: Partial<ChangeSummary>): ChangeSummary {
  return {
    name: 'x', workflow: 'full', phase: 'build', archived: false,
    tasksCompleted: 0, tasksTotal: 0, verifyResult: 'pending', createdAt: '',
    artifacts: {}, visualized: false, designReviewed: false, verifyReviewed: false,
    verifiedAt: '', buildMode: '', reviewMode: '', tddMode: '', autoTransition: false,
    ...overrides,
  }
}

describe('App', () => {
  it('does not crash when fetchChangesWithMeta resolves with changes: null, and still renders the warning banner', async () => {
    render(<App />)
    await screen.findByTestId('workspace-warning-banner')
    expect(screen.getByTestId('kpi-grid')).toBeTruthy()
  })

  it('narrows the visible change list via KPI-card filter, combined (AND) with the workspace filter', async () => {
    const workspaces: WorkspaceConfig[] = [
      { alias: 'ws1', path: '/a', color: '#0063f8' },
      { alias: 'ws2', path: '/b', color: '#16a34a' },
    ]
    const changes = [
      makeChange({ name: 'alpha', archived: false, workspace: 'ws1' }),
      makeChange({ name: 'beta', archived: true, workspace: 'ws1' }),
      makeChange({ name: 'gamma', archived: true, workspace: 'ws2' }),
      makeChange({ name: 'delta', archived: false, workspace: 'ws2' }),
    ]
    vi.mocked(fetchWorkspaces).mockResolvedValueOnce(workspaces)
    vi.mocked(fetchChangesWithMeta).mockResolvedValueOnce({ changes, failedWorkspaces: [] })

    render(<App />)
    await screen.findByText('alpha')
    expect(screen.getByText('beta')).toBeTruthy()
    expect(screen.getByText('gamma')).toBeTruthy()
    expect(screen.getByText('delta')).toBeTruthy()
    expect(screen.getByTestId('kpi-active').textContent).toContain('2') // alpha, delta

    // Click the "已归档" KPI card: narrows the change list to archived-only.
    fireEvent.click(screen.getByTestId('kpi-archived'))
    expect(screen.queryByText('alpha')).toBeNull()
    expect(screen.getByText('beta')).toBeTruthy()
    expect(screen.getByText('gamma')).toBeTruthy()
    expect(screen.queryByText('delta')).toBeNull()
    // Selecting a KPI filter must not distort the OTHER cards' own counts.
    expect(screen.getByTestId('kpi-active').textContent).toContain('2')
    expect(screen.getByTestId('kpi-archived').textContent).toContain('2')

    // Combine with the workspace filter (AND semantics): only ws2 + archived remains.
    fireEvent.click(screen.getByText('ws2'))
    expect(screen.queryByText('beta')).toBeNull()
    expect(screen.getByText('gamma')).toBeTruthy()
  })


  it('remounts ChatBubble per selected change so switching changes does not bleed chat history', async () => {
    const changes = [
      makeChange({ name: 'alpha' }),
      makeChange({ name: 'beta' }),
    ]
    vi.mocked(fetchWorkspaces).mockResolvedValueOnce([])
    vi.mocked(fetchChangesWithMeta).mockResolvedValueOnce({ changes, failedWorkspaces: [] })
    vi.mocked(fetchChatSession).mockImplementation(async (change: string) => ({
      change,
      messages:
        change === 'alpha'
          ? [{ role: 'user', content: [{ type: 'text', text: 'alpha 的历史消息' }] }]
          : [],
      context_files: [],
      usage: { total_input: 0, total_output: 0 },
      created_at: '',
      updated_at: '',
    }))

    render(<App />)
    await screen.findByText('alpha')

    fireEvent.click(screen.getByText('alpha'))
    await waitFor(() => expect(fetchChatSession).toHaveBeenCalledWith('alpha'))
    fireEvent.click(screen.getByTestId('chat-bubble-button'))
    await waitFor(() =>
      expect(screen.getByTestId('chat-messages').textContent).toContain('alpha 的历史消息'),
    )

    fireEvent.click(screen.getByText('beta'))
    await waitFor(() => expect(fetchChatSession).toHaveBeenCalledWith('beta'))
    // Freshly-mounted ChatBubble for beta starts collapsed again (state was
    // reset), and once opened must NOT show alpha's leaked history.
    fireEvent.click(screen.getByTestId('chat-bubble-button'))
    expect(screen.getByTestId('chat-messages').textContent).not.toContain('alpha 的历史消息')
  })
})

describe('App view switcher', () => {
  it('defaults to the 变更列表 view showing KpiCards and ChangeExplorer', async () => {
    render(<App />)
    await screen.findByTestId('workspace-warning-banner')
    expect(screen.getByTestId('kpi-grid')).toBeTruthy()
    expect(screen.queryByTestId('wiki-graph-canvas')).toBeNull()
  })

  it('shows a friendly empty-state guiding the user to pick a change when none is selected', async () => {
    render(<App />)
    await screen.findByTestId('workspace-warning-banner')
    expect(screen.getByTestId('change-empty-state')).toBeTruthy()
    expect(screen.getByText('从左侧选择一个变更查看详情')).toBeTruthy()
  })

  it('switches to the 图谱 view and mounts WikiGraph', async () => {
    const nonEmptyIndex = [
      { id: '/x/a.md', type: 'spec', title: 'A', path: '/x/a.md', workspace: 'miao' },
    ]
    vi.mocked(fetchWikiIndex).mockResolvedValueOnce(nonEmptyIndex).mockResolvedValueOnce(nonEmptyIndex)
    render(<App />)
    await screen.findByTestId('workspace-warning-banner')

    fireEvent.click(screen.getByRole('button', { name: '图谱' }))

    await waitFor(() => expect(fetchWikiIndex).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByTestId('wiki-graph-canvas')).toBeTruthy())
    // 变更列表-only content is no longer mounted.
    expect(screen.queryByTestId('kpi-grid')).toBeNull()
  })

  it('switches to the Lint view and mounts LintPanel', async () => {
    vi.mocked(fetchLintIssues).mockResolvedValueOnce([
      { rule: 'orphan', componentId: '/x/a.md', detail: '孤立组件' },
    ])
    render(<App />)
    await screen.findByTestId('workspace-warning-banner')

    fireEvent.click(screen.getByRole('button', { name: 'Lint' }))

    await waitFor(() => expect(fetchLintIssues).toHaveBeenCalled())
    await screen.findByText(/orphan/)
    expect(screen.queryByTestId('kpi-grid')).toBeNull()
  })

  it('switching back to 变更列表 restores KpiCards and ChangeExplorer', async () => {
    render(<App />)
    await screen.findByTestId('workspace-warning-banner')

    fireEvent.click(screen.getByRole('button', { name: '图谱' }))
    await waitFor(() => expect(fetchWikiIndex).toHaveBeenCalled())

    fireEvent.click(screen.getByRole('button', { name: '变更列表' }))
    expect(screen.getByTestId('kpi-grid')).toBeTruthy()
    expect(screen.queryByTestId('wiki-graph-canvas')).toBeNull()
  })
})
