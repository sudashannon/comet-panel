import type { ChangeSummary, ChangesResponse, WorkspaceConfig, WikiComponentResponse, LintIssue, WikiComponent, ChangeDetail, ChatConfig, ChatConfigPatch, ChatProviders } from './types'

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

export async function fetchChangeDetail(name: string): Promise<ChangeDetail> {
  const res = await fetch('/api/changes/' + encodeURIComponent(name))
  if (!res.ok) throw new Error(`fetchChangeDetail failed: ${res.status}`)
  return res.json()
}

export async function fetchArtifactContent(path: string): Promise<string> {
  const res = await fetch('/api/artifact?path=' + encodeURIComponent(path))
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
): Promise<void> {
  const res = await fetch('/api/chat/message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ change, message, context_files: contextFiles }),
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
