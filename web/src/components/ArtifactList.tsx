import { useEffect, useState } from 'react'
import { fetchChangeDetail } from '../api/client'
import type { ArtifactInfo, PhaseInfo } from '../api/types'

interface Props {
  changeName: string
  onSelectArtifact: (path: string) => void
}

function ArtifactRow({ artifact, onSelectArtifact }: { artifact: ArtifactInfo; onSelectArtifact: (path: string) => void }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span
        data-testid={`artifact-dot-${artifact.file}`}
        className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${artifact.exists ? 'bg-[#16a34a]' : 'bg-[#d2d2d7]'}`}
      />
      {artifact.exists && artifact.path ? (
        <button
          type="button"
          onClick={() => onSelectArtifact(artifact.path!)}
          className="text-[#0063f8] hover:underline truncate text-left text-xs"
        >
          {artifact.label}
        </button>
      ) : (
        <span className="text-[#6e6e73] truncate text-xs">{artifact.label}</span>
      )}
    </div>
  )
}

function PhaseSection({ phase, onSelectArtifact }: { phase: PhaseInfo; onSelectArtifact: (path: string) => void }) {
  return (
    <details data-testid={`artifact-phase-${phase.key}`} open>
      <summary className="text-[#6e6e73] text-xs font-semibold cursor-pointer select-none">
        {phase.label}
      </summary>
      <div className="pl-3 mt-1">
        {phase.artifacts.map((artifact) => (
          <ArtifactRow key={artifact.file} artifact={artifact} onSelectArtifact={onSelectArtifact} />
        ))}
      </div>
    </details>
  )
}

export function ArtifactList({ changeName, onSelectArtifact }: Props) {
  const [phases, setPhases] = useState<PhaseInfo[] | null>(null)

  useEffect(() => {
    fetchChangeDetail(changeName)
      .then((detail) => setPhases(detail.phases ?? []))
      .catch(() => setPhases([]))
  }, [changeName])

  if (phases === null) return null

  const visiblePhases = phases.filter((p) => p.artifacts.some((a) => a.exists))

  if (visiblePhases.length === 0) {
    return <div className="text-xs text-[#6e6e73]">暂无产出物</div>
  }

  return (
    <div className="space-y-2">
      {visiblePhases.map((phase) => (
        <PhaseSection key={phase.key} phase={phase} onSelectArtifact={onSelectArtifact} />
      ))}
    </div>
  )
}
