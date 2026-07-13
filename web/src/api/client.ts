import type { ChangeSummary, ChangesResponse, WorkspaceConfig, WikiComponentResponse, LintIssue, WikiComponent, WikiGraphData, ChangeDetail, ChatConfig, ChatConfigPatch, ChatProviders, ReportRequest, ReportResponse, ReportMeta, Bookmark } from './types'

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
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `添加工作区失败 (${res.status})`)
  }
}

export async function fetchBookmarks(): Promise<Bookmark[]> {
  const res = await fetch('/api/bookmarks')
  if (!res.ok) throw new Error(`fetchBookmarks failed: ${res.status}`)
  return res.json()
}

export async function addBookmark(b: { path: string; title: string; type: string }): Promise<Bookmark[]> {
  const res = await fetch('/api/bookmarks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(b),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `addBookmark failed (${res.status})`)
  }
  return res.json()
}

export async function removeBookmark(path: string): Promise<Bookmark[]> {
  const res = await fetch('/api/bookmarks?path=' + encodeURIComponent(path), { method: 'DELETE' })
  if (!res.ok) throw new Error(`removeBookmark failed: ${res.status}`)
  return res.json()
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

export async function fetchWikiLint(): Promise<LintIssue[]> {
  const res = await fetch('/api/wiki/lint')
  if (!res.ok) throw new Error(`fetchWikiLint failed: ${res.status}`)
  return res.json()
}

// Kept for LintPanel.tsx, which already consumes this name; delegates to
// fetchWikiLint() to avoid duplicating the request logic.
export async function fetchLintIssues(): Promise<LintIssue[]> {
  return fetchWikiLint()
}

export async function fetchWikiIndex(): Promise<WikiComponent[]> {
  const res = await fetch('/api/wiki/index')
  if (!res.ok) throw new Error(`fetchWikiIndex failed: ${res.status}`)
  return res.json()
}

// fetchWikiGraph is the relationship-graph counterpart to fetchWikiIndex()
// above: it returns components AND edges from GET /api/wiki/graph so
// WikiGraph.tsx can render actual relationships instead of a nodes-only
// grid. Deliberately separate from fetchWikiIndex() -- that function's
// Promise<WikiComponent[]> signature is depended on by App.tsx and must
// not change.
export async function fetchWikiGraph(): Promise<WikiGraphData> {
  const res = await fetch('/api/wiki/graph')
  if (!res.ok) throw new Error(`fetchWikiGraph failed: ${res.status}`)
  return res.json()
}

export async function fetchChangeDetail(name: string, workspace?: string): Promise<ChangeDetail> {
  const q = workspace ? '?workspace=' + encodeURIComponent(workspace) : ''
  const res = await fetch('/api/changes/' + encodeURIComponent(name) + q)
  if (!res.ok) throw new Error(`fetchChangeDetail failed: ${res.status}`)
  return res.json()
}

export async function fetchArtifactContent(path: string, workspace?: string): Promise<string> {
  const params = new URLSearchParams({ path })
  if (workspace) params.set('workspace', workspace)
  const res = await fetch('/api/artifact?' + params.toString())
  if (!res.ok) throw new Error(`fetchArtifactContent failed: ${res.status}`)
  return res.text()
}

export interface ChatStreamEvent {
  type: 'thinking' | 'delta' | 'done'
  content?: string
}

export interface ChatSessionMessage {
  role: string
  content: { type: string; text?: string; thinking?: string }[]
}

export interface ChatSession {
  change: string
  messages: ChatSessionMessage[]
  context_files: string[]
  usage: { total_input: number; total_output: number }
  created_at: string
  updated_at: string
}

export async function fetchChatSession(change: string): Promise<ChatSession> {
  const res = await fetch('/api/chat/session?change=' + encodeURIComponent(change))
  if (!res.ok) throw new Error(`fetchChatSession failed: ${res.status}`)
  return res.json()
}

export async function fetchChatConfig(): Promise<ChatConfig> {
  const res = await fetch('/api/chat/config')
  if (!res.ok) throw new Error(`fetchChatConfig failed: ${res.status}`)
  return res.json()
}

export async function updateChatConfig(patch: ChatConfigPatch): Promise<ChatConfig> {
  const res = await fetch('/api/chat/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  if (!res.ok) throw new Error(`updateChatConfig failed: ${res.status}`)
  return res.json()
}

export async function fetchChatProviders(): Promise<ChatProviders> {
  const res = await fetch('/api/chat/providers')
  if (!res.ok) throw new Error(`fetchChatProviders failed: ${res.status}`)
  return res.json()
}

// Mirrors V1's static/app.js fetch+reader loop (lines ~366-401): the backend
// streams `data: {json}\n\n` SSE frames with {type, content} where type is
// thinking/delta/done — there is NO in-stream error event. Auth/provider
// errors (e.g. missing API key) are a pre-stream HTTP 4xx/5xx JSON body
// ({"message": "..."}), so res.ok MUST be checked before touching
// res.body.getReader().
export async function streamChat(
  change: string,
  message: string,
  contextFiles: string[],
  onEvent: (event: ChatStreamEvent) => void,
  includeGraph?: boolean,
): Promise<void> {
  const res = await fetch('/api/chat/message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ change, message, context_files: contextFiles, includeGraph: !!includeGraph }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as { message?: string; error?: string })
    throw new Error(body.message || body.error || res.statusText)
  }

  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      try {
        const event = JSON.parse(line.slice(6)) as ChatStreamEvent
        onEvent(event)
      } catch {
        // malformed frame; skip it and keep streaming
      }
    }
  }
}

// Gate: POST /api/report 400s when no provider api_key is configured (see
// isProviderReady() in ReportView.tsx, which pre-checks this client-side so
// the request round-trip isn't the only signal). Error body follows the
// same { error } shape as addWorkspace() above.
export async function generateReport(req: ReportRequest): Promise<ReportResponse> {
  const res = await fetch('/api/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `生成报告失败 (${res.status})`)
  }
  return res.json()
}

export async function listReports(): Promise<ReportMeta[]> {
  const res = await fetch('/api/reports')
  if (!res.ok) throw new Error(`listReports failed: ${res.status}`)
  return res.json()
}

export async function getReport(name: string): Promise<ReportResponse> {
  const res = await fetch('/api/reports/get?name=' + encodeURIComponent(name))
  if (!res.ok) throw new Error(`getReport failed: ${res.status}`)
  return res.json()
}

export async function deleteReport(name: string): Promise<void> {
  const res = await fetch('/api/reports/get?name=' + encodeURIComponent(name), { method: 'DELETE' })
  if (!res.ok) throw new Error(`deleteReport failed: ${res.status}`)
}

export interface SemanticSearchResult {
  id: string
  title: string
  workspace: string
  type: string
  similarity: number
}

// searchSemantic is the semantic-search data source: the backend embeds the
// query server-side (bun scripts/embed.ts) and ranks it against every
// precomputed component embedding by cosine similarity, returning only the
// top matches -- no corpus fetch or client-side WASM encoder required.
export async function searchSemantic(query: string, topK = 10): Promise<SemanticSearchResult[]> {
  const res = await fetch('/api/wiki/search-semantic', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, topK }),
  })
  if (!res.ok) return []
  return res.json()
}
