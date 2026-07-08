import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { KpiCards } from './KpiCards'
import type { ChangeSummary } from '../api/types'

function makeChange(overrides: Partial<ChangeSummary>): ChangeSummary {
  return {
    name: 'x', workflow: 'full', phase: 'build', archived: false,
    tasksCompleted: 0, tasksTotal: 0, verifyResult: 'pending', createdAt: '',
    artifacts: {}, visualized: false, designReviewed: false, verifyReviewed: false,
    verifiedAt: '', buildMode: '', reviewMode: '', tddMode: '', autoTransition: false,
    ...overrides,
  }
}

describe('KpiCards', () => {
  it('counts active, archived, verify-failed, incomplete tasks, and stuck changes', () => {
    const today = new Date('2026-07-09')
    const changes = [
      makeChange({ name: 'a', archived: false, phase: 'build', createdAt: '2026-07-01', tasksCompleted: 5, tasksTotal: 10 }),
      makeChange({ name: 'b', archived: true }),
      makeChange({ name: 'c', archived: false, phase: 'verify', verifyResult: 'fail' }),
      makeChange({ name: 'd', archived: false, phase: 'build', createdAt: '2026-05-01', tasksCompleted: 0, tasksTotal: 3 }),
    ]
    render(<KpiCards changes={changes} stuckThresholdDays={14} now={today} />)

    expect(screen.getByTestId('kpi-active').textContent).toContain('3')
    expect(screen.getByTestId('kpi-archived').textContent).toContain('1')
    expect(screen.getByTestId('kpi-verify-failed').textContent).toContain('1')
    expect(screen.getByTestId('kpi-stuck').textContent).toContain('1')
    expect(screen.getByTestId('kpi-incomplete-tasks').textContent).toContain('8')
  })
})
