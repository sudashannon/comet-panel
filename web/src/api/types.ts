export interface ChangeSummary {
  name: string
  workflow: string
  phase: string
  archived: boolean
  tasksCompleted: number
  tasksTotal: number
  verifyResult: 'pass' | 'fail' | 'pending' | string
  createdAt: string
  artifacts: Record<string, boolean>
  visualized: boolean
  designReviewed: boolean
  verifyReviewed: boolean
  verifiedAt: string
  buildMode: string
  reviewMode: string
  tddMode: string
  autoTransition: boolean
  stateWarning?: string
  workspace?: string // added in Phase②, optional until then
  componentId?: string // wiki graph node ID (.comet.yaml path); optional until backend populates it
}

export interface ChangesResponse {
  changes: ChangeSummary[]
  dir?: string
  failedWorkspaces?: string[]
}

export interface WorkspaceConfig {
  alias: string
  path: string
  color: string
}

export interface WikiEdge {
  from: string
  to: string
  kind: string
  source: string
}

export interface WikiComponentResponse {
  component: { id: string; title: string }
  forward: WikiEdge[]
  backlinks: WikiEdge[]
}

export interface LintIssue {
  rule: string
  componentId: string
  detail: string
}

export interface WikiComponent {
  id: string
  type: string
  title: string
  path: string
  workspace: string
  frontmatter?: Record<string, unknown>
  updatedAt?: string
}

// WikiGraphData is the full graph view for the relationship visualization
// (GET /api/wiki/graph): every component alongside every edge, unlike
// fetchWikiIndex()'s nodes-only WikiComponent[].
export interface WikiGraphData {
  components: WikiComponent[]
  edges: WikiEdge[]
  communities?: Record<string, number>
}

export interface ArtifactInfo {
  file: string
  label: string
  exists: boolean
  path?: string
  external?: boolean
  isTasks?: boolean
}

export interface PhaseInfo {
  key: string
  label: string
  status: string
  artifacts: ArtifactInfo[]
}

export interface ChangeDetail {
  name: string
  workflow: string
  phase: string
  archived: boolean
  tasksCompleted: number
  tasksTotal: number
  verifyResult: string
  createdAt: string
  phases: PhaseInfo[]
}

export interface ChatProviderConfig {
  api_key: string
  api_base: string
  model: string
  temperature: number
  max_tokens: number
  thinking: string
}

export interface ChatConfig {
  active_provider: string
  providers: Record<string, ChatProviderConfig>
}

// Partial update shape for PUT /api/chat/config: the backend merges any
// provided fields into the existing provider config, so callers omit
// unchanged fields (notably api_key when the user left it blank) rather
// than sending a full ChatProviderConfig.
export interface ChatConfigPatch {
  active_provider?: string
  providers?: Record<string, Partial<ChatProviderConfig>>
}

export interface ChatProviderInfo {
  name: string
  models: string[]
  supports_images: boolean
}

export interface ChatProviders {
  active: string
  providers: ChatProviderInfo[]
}

export type ReportType = 'weekly' | 'monthly'

export interface ReportRequest {
  type: ReportType
  start: string
  end: string
  workspace?: string
}

export interface ReportResponse {
  format: 'markdown' | 'html'
  body: string
  savedName?: string
}

export interface ReportMeta {
  name: string
  type: ReportType
  start: string
  end: string
  createdAt: string
}
