import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ChangeExplorer } from './ChangeExplorer'
import type { ChangeSummary } from '../api/types'

function makeChange(name: string, archived = false): ChangeSummary {
  return {
    name, workflow: 'full', phase: 'build', archived,
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

  it('groups archived changes under a collapsible "已归档" section', () => {
    const onSelect = vi.fn()
    const { container } = render(
      <ChangeExplorer
        changes={[makeChange('active-1'), makeChange('archived-1', true), makeChange('archived-2', true)]}
        selected={null}
        onSelect={onSelect}
      />,
    )

    // The active change is visible in the flat list above the summary.
    expect(screen.getByText('active-1')).toBeTruthy()

    // The collapsible summary reports the archived count.
    expect(screen.getByText('已归档 (2)')).toBeTruthy()

    // Archived change cards live inside the <details>; in jsdom a collapsed
    // <details> still has the children in the DOM, but a real browser would
    // not render them — so we just check the structural grouping here.
    const details = container.querySelector('details')
    expect(details).toBeTruthy()
    expect(details?.contains(screen.getByText('archived-1'))).toBe(true)
    expect(details?.contains(screen.getByText('archived-2'))).toBe(true)
  })

  it('auto-expands the archived section when an archived change is selected', () => {
    const { container } = render(
      <ChangeExplorer
        changes={[makeChange('archived-1', true)]}
        selected="archived-1"
        onSelect={vi.fn()}
      />,
    )
    const details = container.querySelector('details')
    expect(details?.hasAttribute('open')).toBe(true)
  })

  it('leaves the archived section collapsed when nothing is selected', () => {
    const { container } = render(
      <ChangeExplorer
        changes={[makeChange('archived-1', true)]}
        selected={null}
        onSelect={vi.fn()}
      />,
    )
    const details = container.querySelector('details')
    expect(details?.hasAttribute('open')).toBe(false)
  })
})
