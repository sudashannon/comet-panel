import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { PhaseStepper } from './PhaseStepper'

describe('PhaseStepper', () => {
  it('marks phases before current as done, current as current, rest as pending', () => {
    render(<PhaseStepper currentPhase="build" />)
    expect(screen.getByTestId('step-open').dataset.state).toBe('done')
    expect(screen.getByTestId('step-design').dataset.state).toBe('done')
    expect(screen.getByTestId('step-build').dataset.state).toBe('current')
    expect(screen.getByTestId('step-verify').dataset.state).toBe('pending')
    expect(screen.getByTestId('step-archive').dataset.state).toBe('pending')
  })

  it('renders Chinese labels', () => {
    render(<PhaseStepper currentPhase="open" />)
    expect(screen.getByText('启动')).toBeTruthy()
    expect(screen.getByText('设计')).toBeTruthy()
    expect(screen.getByText('构建')).toBeTruthy()
    expect(screen.getByText('验证')).toBeTruthy()
    expect(screen.getByText('归档')).toBeTruthy()
  })
})
