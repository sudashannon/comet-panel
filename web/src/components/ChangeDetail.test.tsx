import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ChangeDetail } from './ChangeDetail'
import type { ChangeSummary } from '../api/types'

describe('ChangeDetail', () => {
  it('renders stepper, donut, and review badges for the given change', () => {
    const change: ChangeSummary = {
      name: 'rx101-x', workflow: 'full', phase: 'build', archived: false,
      tasksCompleted: 19, tasksTotal: 31, verifyResult: 'pending', createdAt: '2026-05-29',
      artifacts: {}, visualized: true, designReviewed: true, verifyReviewed: false,
      verifiedAt: '', buildMode: '', reviewMode: '', tddMode: '', autoTransition: false,
    }
    render(<ChangeDetail change={change} />)
    expect(screen.getByTestId('step-build').dataset.state).toBe('current')
    expect(screen.getByTestId('donut-fraction').textContent).toBe('19/31 任务完成')
    expect(screen.getByTestId('badge-visualized').dataset.tone).toBe('ok')
  })
})
