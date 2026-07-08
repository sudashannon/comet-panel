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
