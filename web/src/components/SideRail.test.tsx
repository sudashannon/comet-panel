import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { SideRail } from './SideRail'

describe('SideRail', () => {
  it('renders the three view icons inside view-switcher', () => {
    render(<SideRail view="changes" onSelect={() => {}} />)
    const nav = screen.getByTestId('view-switcher')
    expect(nav).toBeTruthy()
    expect(screen.getByRole('button', { name: '变更列表' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '图谱' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Lint' })).toBeTruthy()
  })

  it('marks the active view with aria-pressed', () => {
    render(<SideRail view="graph" onSelect={() => {}} />)
    expect(screen.getByRole('button', { name: '图谱' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: '变更列表' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('calls onSelect with the view key when an icon is clicked', () => {
    const onSelect = vi.fn()
    render(<SideRail view="changes" onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button', { name: 'Lint' }))
    expect(onSelect).toHaveBeenCalledWith('lint')
  })

  it('renders a disabled settings placeholder', () => {
    render(<SideRail view="changes" onSelect={() => {}} />)
    const settings = screen.getByRole('button', { name: '设置' }) as HTMLButtonElement
    expect(settings.disabled).toBe(true)
  })
})
