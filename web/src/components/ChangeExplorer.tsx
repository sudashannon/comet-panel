import { useState } from 'react'
import type { ReactNode } from 'react'
import type { ChangeSummary } from '../api/types'

interface Props {
  changes: ChangeSummary[]
  selected: string | null
  onSelect: (name: string) => void
}

type StatusFilter = 'all' | 'active' | 'archived'
type WorkflowFilter = 'all' | 'full' | 'hotfix' | 'tweak'
type PhaseFilter = 'all' | 'open' | 'design' | 'build' | 'verify' | 'archive'

const PHASE_STYLES: Record<string, string> = {
  open: 'bg-[#f0f0f0] text-[#6e6e73]',
  design: 'bg-[#e6f0ff] text-[#0063f8]',
  build: 'bg-[#fdf1dc] text-[#c47a06]',
  verify: 'bg-[#f1e6fb] text-[#7c3aed]',
  archive: 'bg-[#e7f7ec] text-[#16a34a]',
}

const WORKFLOW_LABELS: Record<string, string> = {
  full: 'full',
  hotfix: 'hotfix',
  tweak: 'tweak',
}

function Badge({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span className={'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium leading-none ' + className}>
      {children}
    </span>
  )
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
  const progress = change.tasksTotal > 0 ? change.tasksCompleted / change.tasksTotal : 0
  const phaseStyle = PHASE_STYLES[change.phase] ?? 'bg-[#f0f0f0] text-[#6e6e73]'

  return (
    <div
      onClick={() => onSelect(change.name)}
      className={
        'rounded-xl border p-3 cursor-pointer ' +
        (selected ? 'border-[#0063f8] bg-[#f0f5ff]' : 'border-[#e8e8ed]')
      }
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium truncate" title={change.name}>{change.name}</div>
        <div className="flex shrink-0 items-center gap-1">
          <Badge className={phaseStyle}>{change.phase}</Badge>
          <Badge className="bg-[#f0f0f0] text-[#6e6e73]">
            {WORKFLOW_LABELS[change.workflow] ?? change.workflow}
          </Badge>
          {change.verifyResult === 'pass' && (
            <Badge className="bg-[#e7f7ec] text-[#16a34a]">✓ pass</Badge>
          )}
          {change.verifyResult === 'fail' && (
            <Badge className="bg-[#fbe9e9] text-[#dc2626]">✗ fail</Badge>
          )}
          {change.stateWarning && (
            <Badge className="bg-[#fdf1dc] text-[#c47a06]" data-testid={`warning-${change.name}`}>
              ⚠
            </Badge>
          )}
        </div>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <div className="h-1 flex-1 rounded-full bg-[#e8e8ed]">
          <div
            className="h-1 rounded-full bg-[#0063f8]"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
        <div className="text-xs text-[#6e6e73] shrink-0">
          {change.tasksCompleted}/{change.tasksTotal}
        </div>
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

  // Auto-expand the archived section when the selected change is archived OR
  // when the user is actively searching/filtering — otherwise a search whose
  // only matches are archived looks like "无匹配" behind a collapsed group.
  const hasActiveQuery = search.trim() !== '' || status !== 'all' || workflow !== 'all' || phase !== 'all'
  const selectedIsArchived =
    (selected !== null && archived.some((c) => c.name === selected)) || hasActiveQuery

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
