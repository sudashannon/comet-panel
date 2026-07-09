import type { ChangeSummary, ChangesResponse, WorkspaceConfig, WikiComponentResponse, LintIssue, WikiComponent } from './types'

export async function fetchChanges(): Promise<ChangeSummary[]> {
  const res = await fetch('/api/changes')
  if (!res.ok) {
    throw new Error(`fetchChanges failed: ${res.status}`)
  }
  const body: ChangesResponse = await res.json()
  return body.changes ?? []
}

export async function fetchWorkspaces(): Promise<WorkspaceConfig[]> {
  const res = await fetch('/api/workspaces')
  if (!res.ok) throw new Error(`fetchWorkspaces failed: ${res.status}`)
  return res.json()
}

export async function addWorkspace(cfg: WorkspaceConfig): Promise<void> {
  const res = await fetch('/api/workspaces', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cfg),
  })
  if (!res.ok) throw new Error(`addWorkspace failed: ${res.status}`)
}

// Distinct from fetchChanges() (Task 4), which discards the envelope's
// metadata for callers that only need the bare array. This variant keeps
// failedWorkspaces so App.tsx can surface the "workspace unreadable"
// warning banner (design doc error-handling table requirement).
export async function fetchChangesWithMeta(): Promise<ChangesResponse> {
  const res = await fetch('/api/changes')
  if (!res.ok) throw new Error(`fetchChangesWithMeta failed: ${res.status}`)
  return res.json()
}

export async function fetchWikiComponent(id: string): Promise<WikiComponentResponse> {
  const res = await fetch('/api/wiki/component/x?id=' + encodeURIComponent(id))
  if (!res.ok) throw new Error(`fetchWikiComponent failed: ${res.status}`)
  return res.json()
}

export async function fetchLintIssues(): Promise<LintIssue[]> {
  const res = await fetch('/api/wiki/lint')
  if (!res.ok) throw new Error(`fetchLintIssues failed: ${res.status}`)
  return res.json()
}

export async function fetchWikiIndex(): Promise<WikiComponent[]> {
  const res = await fetch('/api/wiki/index')
  if (!res.ok) throw new Error(`fetchWikiIndex failed: ${res.status}`)
  return res.json()
}
