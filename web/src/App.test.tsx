import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import App from './App'

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

describe('App', () => {
  it('does not crash when fetchChangesWithMeta resolves with changes: null, and still renders the warning banner', async () => {
    render(<App />)
    await screen.findByTestId('workspace-warning-banner')
    expect(screen.getByTestId('kpi-grid')).toBeTruthy()
  })
})
