import type { ChangeSummary } from '../api/types'

interface Props {
  changes: ChangeSummary[]
  stuckThresholdDays: number
  now?: Date
}

function daysSince(dateStr: string, now: Date): number {
  if (!dateStr) return 0
  const then = new Date(dateStr)
  return Math.floor((now.getTime() - then.getTime()) / (1000 * 60 * 60 * 24))
}

export function KpiCards({ changes, stuckThresholdDays, now = new Date() }: Props) {
  const active = changes.filter((c) => !c.archived)
  const archived = changes.filter((c) => c.archived)
  const verifyFailed = active.filter((c) => c.verifyResult === 'fail')
  const stuck = active.filter(
    (c) => c.phase === 'build' && daysSince(c.createdAt, now) > stuckThresholdDays,
  )
  const incompleteTasks = active.reduce((sum, c) => sum + (c.tasksTotal - c.tasksCompleted), 0)

  const cards = [
    { key: 'active', label: '活跃变更', value: active.length, testId: 'kpi-active' },
    { key: 'archived', label: '已归档', value: archived.length, testId: 'kpi-archived' },
    {
      key: 'stuck', label: '⚠ 卡死预警', value: stuck.length, testId: 'kpi-stuck',
      warn: stuck.length > 0,
    },
    {
      key: 'verify-failed', label: 'Verify 失败', value: verifyFailed.length,
      testId: 'kpi-verify-failed', danger: verifyFailed.length > 0,
    },
    { key: 'incomplete-tasks', label: '未完成任务', value: incompleteTasks, testId: 'kpi-incomplete-tasks' },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
      {cards.map((c) => (
        <div
          key={c.key}
          data-testid={c.testId}
          className={
            'bg-white rounded-lg p-3 shadow-[0_4px_12px_rgba(0,0,0,0.06)]' +
            (c.warn ? ' border border-[#c47a06]' : '')
          }
        >
          <div
            className={
              'text-[11px] ' + (c.warn ? 'text-[#c47a06] font-semibold' : 'text-[#6e6e73]')
            }
          >
            {c.label}
          </div>
          <div
            className={
              'text-[28px] font-bold ' +
              (c.warn ? 'text-[#c47a06]' : c.danger ? 'text-[#dc2626]' : 'text-[#1d1d1f]')
            }
          >
            {c.value}
          </div>
        </div>
      ))}
    </div>
  )
}
