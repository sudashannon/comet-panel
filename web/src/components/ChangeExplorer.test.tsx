import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ChangeExplorer } from './ChangeExplorer'
import type { ChangeSummary } from '../api/types'

function makeChange(name: string): ChangeSummary {
  return {
    name, workflow: 'full', phase: 'build', archived: false,
    tasksCompleted: 1, tasksTotal: 2, verifyResult: 'pending', createdAt: '2026-07-01',
    artifacts: {}, visualized: false, designReviewed: false, verifyReviewed: false,
    verifiedAt: '', buildMode: '', reviewMode: '', tddMode: '', autoTransition: false,
  }
}

describe('ChangeExplorer', () => {
  it('lists changes and calls onSelect when clicked', () => {
    const onSelect = vi.fn()
    render(
      <ChangeExplorer changes={[makeChange('foo'), makeChange('bar')]} selected={null} onSelect={onSelect} />,
    )
    expect(screen.getByText('foo')).toBeTruthy()
    expect(screen.getByText('bar')).toBeTruthy()
    fireEvent.click(screen.getByText('bar'))
    expect(onSelect).toHaveBeenCalledWith('bar')
  })
})
