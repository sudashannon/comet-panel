import type { ChangeSummary } from '../api/types'

interface Props {
  changes: ChangeSummary[]
  stuckThresholdDays: number
  now?: Date
  activeFilter: string | null
  onFilterSelect: (key: string | null) => void
}

export interface ChangeClassification {
  active: ChangeSummary[]
  archived: ChangeSummary[]
  stuck: ChangeSummary[]
  verifyFailed: ChangeSummary[]
  incomplete: ChangeSummary[]
}

function daysSince(dateStr: string, now: Date): number {
  if (!dateStr) return 0
  const then = new Date(dateStr)
  return Math.floor((now.getTime() - then.getTime()) / (1000 * 60 * 60 * 24))
}

export function classifyChanges(
  changes: ChangeSummary[],
  stuckThresholdDays: number,
  now: Date,
): ChangeClassification {
  const active = changes.filter((c) => !c.archived)
  const archived = changes.filter((c) => c.archived)
  const verifyFailed = active.filter((c) => c.verifyResult === 'fail')
  const stuck = active.filter(
    (c) => c.phase === 'build' && daysSince(c.createdAt, now) > stuckThresholdDays,
  )
  const incomplete = active.filter((c) => c.tasksCompleted < c.tasksTotal)

  return { active, archived, stuck, verifyFailed, incomplete }
}

export function KpiCards({
  changes,
  stuckThresholdDays,
  now = new Date(),
  activeFilter,
  onFilterSelect,
}: Props) {
  const classification = classifyChanges(changes, stuckThresholdDays, now)
  const incompleteTasks = classification.active.reduce(
    (sum, c) => sum + (c.tasksTotal - c.tasksCompleted),
    0,
  )

  const cards = [
    { key: 'active', label: '活跃变更', value: classification.active.length, testId: 'kpi-active', icon: '◔', chip: 'bg-[#eaf1ff] text-[#0063f8]' },
    { key: 'archived', label: '已归档', value: classification.archived.length, testId: 'kpi-archived', icon: '✓', chip: 'bg-[#eafaf0] text-[#16a34a]' },
    { key: 'stuck', label: '卡死预警', value: classification.stuck.length, testId: 'kpi-stuck', warn: classification.stuck.length > 0, icon: '⚠', chip: 'bg-[#fff3e0] text-[#d97706]' },
    { key: 'verify-failed', label: 'Verify 失败', value: classification.verifyFailed.length, testId: 'kpi-verify-failed', danger: classification.verifyFailed.length > 0, icon: '◎', chip: 'bg-[#f3eeff] text-[#7c3aed]' },
    { key: 'incomplete-tasks', label: '未完成任务', value: incompleteTasks, testId: 'kpi-incomplete-tasks', icon: '▤', chip: 'bg-[#f3f4f8] text-[#6e6e73]' },
  ]

  return (
    <div data-testid="kpi-grid" className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
      {cards.map((c) => {
        const isFilterActive = activeFilter === c.key
        const selectCard = () => onFilterSelect(isFilterActive ? null : c.key)

        return (
          <div
            key={c.key}
            data-testid={c.testId}
            data-filter-active={isFilterActive ? 'true' : 'false'}
            role="button"
            tabIndex={0}
            onClick={selectCard}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                selectCard()
              }
            }}
            className={
              'bg-white rounded-2xl px-4 py-4 shadow-[0_6px_20px_rgba(30,32,60,0.05),0_1px_2px_rgba(0,0,0,0.03)] cursor-pointer flex flex-col gap-2.5' +
              (c.warn ? ' outline outline-[1.5px] outline-[#f0cf9a] bg-[#fffdf8]' : '') +
              (isFilterActive ? ' ring-2 ring-[#0063f8]' : '')
            }
          >
            <div className="flex items-center gap-2.5">
              <div className={'w-[34px] h-[34px] rounded-[10px] grid place-items-center text-base ' + c.chip}>
                <span aria-hidden="true">{c.icon}</span>
              </div>
              <div className={'text-[13px] ' + (c.warn ? 'text-[#d97706] font-semibold' : 'text-[#6e6e73]')}>
                {c.label}
              </div>
            </div>
            <div className={'text-[27px] font-bold leading-none tracking-tight ' + (c.warn ? 'text-[#d97706]' : c.danger ? 'text-[#dc2626]' : 'text-[#1d1d1f]')}>
              {c.value}
            </div>
          </div>
        )
      })}
    </div>
  )
}
