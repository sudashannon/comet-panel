import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import App from './App'
import { fetchWorkspaces, fetchChangesWithMeta } from './api/client'
import type { ChangeSummary, WorkspaceConfig } from './api/types'

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
})
