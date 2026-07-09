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
