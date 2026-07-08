import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { WorkspaceChips } from './WorkspaceChips'

const workspaces = [
  { alias: 'miao', path: '/x/miao', color: '#0063f8' },
  { alias: 'wan2_2_deploy', path: '/x/wan', color: '#16a34a' },
]

describe('WorkspaceChips', () => {
  it('renders an "全部" chip plus one chip per workspace', () => {
    render(<WorkspaceChips workspaces={workspaces} active={null} onSelect={vi.fn()} onAdd={vi.fn()} />)
    expect(screen.getByText('全部')).toBeTruthy()
    expect(screen.getByText('miao')).toBeTruthy()
    expect(screen.getByText('wan2_2_deploy')).toBeTruthy()
  })

  it('calls onSelect with the alias when a chip is clicked, null for 全部', () => {
    const onSelect = vi.fn()
    render(<WorkspaceChips workspaces={workspaces} active={null} onSelect={onSelect} onAdd={vi.fn()} />)
    fireEvent.click(screen.getByText('miao'))
    expect(onSelect).toHaveBeenCalledWith('miao')
    fireEvent.click(screen.getByText('全部'))
    expect(onSelect).toHaveBeenCalledWith(null)
  })

  it('opens an add-workspace form and submits it', async () => {
    const onAdd = vi.fn().mockResolvedValue(undefined)
    render(<WorkspaceChips workspaces={workspaces} active={null} onSelect={vi.fn()} onAdd={onAdd} />)
    fireEvent.click(screen.getByText('+ 添加'))
    fireEvent.change(screen.getByTestId('add-ws-alias'), { target: { value: 'new-ws' } })
    fireEvent.change(screen.getByTestId('add-ws-path'), { target: { value: '/x/new' } })
    fireEvent.click(screen.getByTestId('add-ws-submit'))
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ alias: 'new-ws', path: '/x/new' }))
  })
})
