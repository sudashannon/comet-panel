import type { ChangeSummary } from '../api/types'
import { PhaseStepper } from './PhaseStepper'
import { TaskDonut } from './TaskDonut'
import { ReviewBadges } from './ReviewBadges'
import { BacklinksPanel } from './BacklinksPanel'
import { ArtifactList } from './ArtifactList'
import { GuardButton } from './GuardButton'

// PHASES order matches PhaseStepper's own list — the "next phase" is
// simply the one after change.phase in that fixed sequence.
const PHASE_ORDER = ['open', 'design', 'build', 'verify', 'archive']

export function ChangeDetail({
  change,
  onChangeUpdated,
  onOpenArtifact,
}: {
  change: ChangeSummary
  onChangeUpdated: () => void
  onOpenArtifact: (path: string) => void
}) {
  return (
    <div className="bg-white rounded-lg p-4 shadow-[0_4px_12px_rgba(0,0,0,0.06)] space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{change.name}</h3>
        <ReviewBadges
          visualized={change.visualized}
          designReviewed={change.designReviewed}
          verifyReviewed={change.verifyReviewed}
        />
      </div>
      {change.stateWarning && (
        <div className="text-xs text-[#dc2626] bg-[#fdeeee] rounded p-2">
          ⚠ {change.stateWarning}
        </div>
      )}
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="flex-[2]">
          <PhaseStepper currentPhase={change.phase} />
        </div>
        <div className="flex-1">
          <TaskDonut completed={change.tasksCompleted} total={change.tasksTotal} />
        </div>
      </div>
      {(() => {
        const idx = PHASE_ORDER.indexOf(change.phase)
        const next = idx >= 0 && idx < PHASE_ORDER.length - 1 ? PHASE_ORDER[idx + 1] : null
        if (!next) return null
        // build→verify requires every task to be checked off; other transitions
        // have no extra precondition beyond the guard's own name check.
        const blockedReason =
          change.phase === 'build' && next === 'verify' && !(change.tasksCompleted === change.tasksTotal && change.tasksTotal > 0)
            ? `任务未全部完成 (${change.tasksCompleted}/${change.tasksTotal})，无法进入验证`
            : undefined
        return (
          <GuardButton
            changeName={change.name}
            targetPhase={next}
            onComplete={onChangeUpdated}
            blockedReason={blockedReason}
          />
        )
      })()}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="border border-[#e8e8ed] rounded-lg p-3">
          <h4 className="text-xs font-semibold text-[#1d1d1f] mb-2">产出物</h4>
          <ArtifactList changeName={change.name} onSelectArtifact={onOpenArtifact} />
        </div>
        <div className="border border-[#e8e8ed] rounded-lg p-3">
          <h4 className="text-xs font-semibold text-[#1d1d1f] mb-2">反向引用</h4>
          <BacklinksPanel componentId={change.componentId ?? change.name} />
        </div>
      </div>
    </div>
  )
}
