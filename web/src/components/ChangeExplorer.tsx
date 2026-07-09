import type { ChangeSummary } from '../api/types'

interface Props {
  changes: ChangeSummary[]
  selected: string | null
  onSelect: (name: string) => void
}

// Renders a single change card. Extracted so the active and archived lists can
// share identical card markup without doubling the JSX.
function ChangeCard({
  change,
  selected,
  onSelect,
}: {
  change: ChangeSummary
  selected: boolean
  onSelect: (name: string) => void
}) {
  return (
    <div
      onClick={() => onSelect(change.name)}
      className={
        'rounded-xl border p-3 cursor-pointer ' +
        (selected ? 'border-[#0063f8] bg-[#f0f5ff]' : 'border-[#e8e8ed]')
      }
    >
      <div className="text-sm font-medium">{change.name}</div>
      <div className="text-xs text-[#6e6e73]">
        {change.phase} · {change.tasksCompleted}/{change.tasksTotal}
      </div>
    </div>
  )
}

export function ChangeExplorer({ changes, selected, onSelect }: Props) {
  const active = changes.filter((c) => !c.archived)
  const archived = changes.filter((c) => c.archived)

  // Auto-expand the archived section whenever the currently selected change
  // lives inside it, so the user can still see the selected highlight even
  // though the section starts collapsed.
  const selectedIsArchived =
    selected !== null && archived.some((c) => c.name === selected)

  return (
    <div className="space-y-2">
      {active.map((c) => (
        <ChangeCard
          key={c.name}
          change={c}
          selected={selected === c.name}
          onSelect={onSelect}
        />
      ))}
      {archived.length > 0 && (
        <>
          <div className="border-t border-[#e8e8ed] my-3" />
          <details open={selectedIsArchived}>
            <summary className="text-xs text-[#6e6e73] cursor-pointer select-none font-medium">
              已归档 ({archived.length})
            </summary>
            <div className="space-y-2 mt-2">
              {archived.map((c) => (
                <ChangeCard
                  key={c.name}
                  change={c}
                  selected={selected === c.name}
                  onSelect={onSelect}
                />
              ))}
            </div>
          </details>
        </>
      )}
    </div>
  )
}
