import type { ChangeSummary } from '../api/types'

interface Props {
  changes: ChangeSummary[]
  selected: string | null
  onSelect: (name: string) => void
}

export function ChangeExplorer({ changes, selected, onSelect }: Props) {
  return (
    <div className="space-y-2">
      {changes.map((c) => (
        <div
          key={c.name}
          onClick={() => onSelect(c.name)}
          className={
            'rounded-xl border p-3 cursor-pointer ' +
            (selected === c.name ? 'border-[#0063f8] bg-[#f0f5ff]' : 'border-[#e8e8ed]')
          }
        >
          <div className="text-sm font-medium">{c.name}</div>
          <div className="text-xs text-[#6e6e73]">
            {c.phase} · {c.tasksCompleted}/{c.tasksTotal}
          </div>
        </div>
      ))}
    </div>
  )
}
