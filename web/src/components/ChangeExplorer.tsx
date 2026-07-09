import { useState } from 'react'
import type { ChangeSummary } from '../api/types'

interface Props {
  changes: ChangeSummary[]
  selected: string | null
  onSelect: (name: string) => void
}

type StatusFilter = 'all' | 'active' | 'archived'
type WorkflowFilter = 'all' | 'full' | 'hotfix' | 'tweak'
type PhaseFilter = 'all' | 'open' | 'design' | 'build' | 'verify' | 'archive'

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

function matchesFilters(
  change: ChangeSummary,
  search: string,
  status: StatusFilter,
  workflow: WorkflowFilter,
  phase: PhaseFilter,
) {
  if (search && !change.name.toLowerCase().includes(search.toLowerCase())) return false
  if (status === 'active' && change.archived) return false
  if (status === 'archived' && !change.archived) return false
  if (workflow !== 'all' && change.workflow !== workflow) return false
  if (phase !== 'all' && change.phase !== phase) return false
  return true
}

export function ChangeExplorer({ changes, selected, onSelect }: Props) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [workflow, setWorkflow] = useState<WorkflowFilter>('all')
  const [phase, setPhase] = useState<PhaseFilter>('all')

  const filtered = changes.filter((c) => matchesFilters(c, search, status, workflow, phase))
  const active = filtered.filter((c) => !c.archived)
  const archived = filtered.filter((c) => c.archived)

  // Auto-expand the archived section whenever the currently selected change
  // lives inside it, so the user can still see the selected highlight even
  // though the section starts collapsed.
  const selectedIsArchived =
    selected !== null && archived.some((c) => c.name === selected)

  return (
    <div className="space-y-2">
      <div className="space-y-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索变更名称…"
          className="w-full rounded-lg border border-[#e8e8ed] px-2 py-1 text-sm"
        />
        <div className="flex gap-2">
          <select
            aria-label="状态"
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
            className="flex-1 rounded-lg border border-[#e8e8ed] px-2 py-1 text-xs"
          >
            <option value="all">全部状态</option>
            <option value="active">活跃</option>
            <option value="archived">已归档</option>
          </select>
          <select
            aria-label="工作流"
            value={workflow}
            onChange={(e) => setWorkflow(e.target.value as WorkflowFilter)}
            className="flex-1 rounded-lg border border-[#e8e8ed] px-2 py-1 text-xs"
          >
            <option value="all">全部工作流</option>
            <option value="full">full</option>
            <option value="hotfix">hotfix</option>
            <option value="tweak">tweak</option>
          </select>
          <select
            aria-label="阶段"
            value={phase}
            onChange={(e) => setPhase(e.target.value as PhaseFilter)}
            className="flex-1 rounded-lg border border-[#e8e8ed] px-2 py-1 text-xs"
          >
            <option value="all">全部阶段</option>
            <option value="open">open</option>
            <option value="design">design</option>
            <option value="build">build</option>
            <option value="verify">verify</option>
            <option value="archive">archive</option>
          </select>
        </div>
      </div>
      {active.length === 0 && archived.length === 0 && (
        <div className="text-xs text-[#6e6e73] text-center py-4">无匹配</div>
      )}
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
