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
    { key: 'active', label: '活跃变更', value: classification.active.length, testId: 'kpi-active' },
    { key: 'archived', label: '已归档', value: classification.archived.length, testId: 'kpi-archived' },
    {
      key: 'stuck', label: '⚠ 卡死预警', value: classification.stuck.length, testId: 'kpi-stuck',
      warn: classification.stuck.length > 0,
    },
    {
      key: 'verify-failed', label: 'Verify 失败', value: classification.verifyFailed.length,
      testId: 'kpi-verify-failed', danger: classification.verifyFailed.length > 0,
    },
    { key: 'incomplete-tasks', label: '未完成任务', value: incompleteTasks, testId: 'kpi-incomplete-tasks' },
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
              'bg-white rounded-lg px-3 py-2 shadow-[0_2px_8px_rgba(0,0,0,0.05)] cursor-pointer flex items-center justify-between gap-2' +
              (c.warn ? ' border border-[#c47a06]' : ' border border-[#e8e8ed]') +
              (isFilterActive ? ' ring-2 ring-[#0063f8] border-transparent' : '')
            }
          >
            <div
              className={
                'text-xs font-medium ' + (c.warn ? 'text-[#c47a06] font-semibold' : 'text-[#6e6e73]')
              }
            >
              {c.label}
            </div>
            <div
              className={
                'text-xl font-bold leading-none ' +
                (c.warn ? 'text-[#c47a06]' : c.danger ? 'text-[#dc2626]' : 'text-[#1d1d1f]')
              }
            >
              {c.value}
            </div>
          </div>
        )
      })}
    </div>
  )
}
