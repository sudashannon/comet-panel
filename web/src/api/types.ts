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
