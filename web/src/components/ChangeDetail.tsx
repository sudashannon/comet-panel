import { useState } from 'react'
import type { ChangeSummary } from '../api/types'
import { PhaseStepper } from './PhaseStepper'
import { TaskDonut } from './TaskDonut'
import { ReviewBadges } from './ReviewBadges'
import { BacklinksPanel } from './BacklinksPanel'
import { ArtifactList } from './ArtifactList'
import { MarkdownViewer } from './MarkdownViewer'
import { GuardButton } from './GuardButton'

// PHASES order matches PhaseStepper's own list — the "next phase" is
// simply the one after change.phase in that fixed sequence.
const PHASE_ORDER = ['open', 'design', 'build', 'verify', 'archive']

export function ChangeDetail({ change, onChangeUpdated }: { change: ChangeSummary; onChangeUpdated: () => void }) {
  const [selectedArtifact, setSelectedArtifact] = useState<string | null>(null)

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
        return next && <GuardButton changeName={change.name} targetPhase={next} onComplete={onChangeUpdated} />
      })()}
      <BacklinksPanel componentId={change.componentId ?? change.name} />
      <ArtifactList changeName={change.name} onSelectArtifact={setSelectedArtifact} />
      {selectedArtifact && (
        <MarkdownViewer path={selectedArtifact} onClose={() => setSelectedArtifact(null)} />
      )}
    </div>
  )
}
