import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { GuardButton } from './GuardButton'

afterEach(() => vi.restoreAllMocks())

function mockStreamResponse(chunks: string[]): Response {
  let i = 0
  return {
    ok: true,
    body: {
      getReader: () => ({
        read: async () => {
          if (i < chunks.length) {
            const value = new TextEncoder().encode(chunks[i])
            i++
            return { done: false, value }
          }
          return { done: true, value: undefined }
        },
      }),
    },
  } as unknown as Response
}

describe('GuardButton', () => {
  it('shows a confirm dialog with the exact command before executing', () => {
    render(<GuardButton changeName="rx101-x" targetPhase="build" onComplete={vi.fn()} />)
    fireEvent.click(screen.getByTestId('guard-trigger'))
    expect(screen.getByTestId('guard-confirm-dialog').textContent).toContain('rx101-x')
    expect(screen.getByTestId('guard-confirm-dialog').textContent).toContain('build')
  })

  it('does not call fetch until the user confirms', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    render(<GuardButton changeName="rx101-x" targetPhase="build" onComplete={vi.fn()} />)
    fireEvent.click(screen.getByTestId('guard-trigger'))
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('calls the transition endpoint on confirm', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockStreamResponse(['data: ok\n\n', 'data: __GUARD_EXIT__:0\n\n']))
    render(<GuardButton changeName="rx101-x" targetPhase="build" onComplete={vi.fn()} />)
    fireEvent.click(screen.getByTestId('guard-trigger'))
    fireEvent.click(screen.getByTestId('guard-confirm-yes'))
    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/changes/rx101-x/transition',
        expect.objectContaining({ method: 'POST' }),
      ),
    )
  })

  it('on success: calls onComplete and auto-closes the output panel', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockStreamResponse(['data: done\n\n', 'data: __GUARD_EXIT__:0\n\n']))
    const onComplete = vi.fn()
    render(<GuardButton changeName="rx101-x" targetPhase="build" onComplete={onComplete} />)
    fireEvent.click(screen.getByTestId('guard-trigger'))
    fireEvent.click(screen.getByTestId('guard-confirm-yes'))
    await waitFor(() => expect(onComplete).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByTestId('guard-output')).toBeNull())
  })

  it('on failure: keeps the output panel open with the danger tone, does not call onComplete', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockStreamResponse(['data: failing\n\n', 'data: __GUARD_EXIT__:1:exit status 1\n\n']),
    )
    const onComplete = vi.fn()
    render(<GuardButton changeName="rx101-x" targetPhase="build" onComplete={onComplete} />)
    fireEvent.click(screen.getByTestId('guard-trigger'))
    fireEvent.click(screen.getByTestId('guard-confirm-yes'))
    await waitFor(() => expect(screen.getByTestId('guard-output')).toBeTruthy())
    expect(onComplete).not.toHaveBeenCalled()
    expect(screen.getByTestId('guard-output').dataset.tone).toBe('danger')
  })

  it('disables the trigger with an explanatory tooltip for an invalid (date-prefixed) change name', () => {
    render(<GuardButton changeName="2026-06-17-foo" targetPhase="build" onComplete={vi.fn()} />)
    const trigger = screen.getByTestId('guard-trigger') as HTMLButtonElement
    expect(trigger.disabled).toBe(true)
    expect(trigger.title).toBe('变更名不满足 guard 规则（需字母开头，小写 kebab-case），无法迁移')
  })

  it('keeps the trigger enabled and clickable for a valid kebab-case change name', () => {
    render(<GuardButton changeName="rx101-x" targetPhase="build" onComplete={vi.fn()} />)
    const trigger = screen.getByTestId('guard-trigger') as HTMLButtonElement
    expect(trigger.disabled).toBe(false)
    fireEvent.click(trigger)
    expect(screen.getByTestId('guard-confirm-dialog')).toBeTruthy()
  })

  it('disables the trigger with an explanatory tooltip when the precondition is not met (build 9/72)', () => {
    render(
      <GuardButton
        changeName="rx101-x"
        targetPhase="verify"
        onComplete={vi.fn()}
        blockedReason="任务未全部完成 (9/72)，无法进入验证"
      />,
    )
    const trigger = screen.getByTestId('guard-trigger') as HTMLButtonElement
    expect(trigger.disabled).toBe(true)
    expect(trigger.title).toBe('任务未全部完成 (9/72)，无法进入验证')
  })

  it('keeps the trigger enabled when the precondition is met (tasksCompleted === tasksTotal)', () => {
    render(<GuardButton changeName="rx101-x" targetPhase="verify" onComplete={vi.fn()} />)
    const trigger = screen.getByTestId('guard-trigger') as HTMLButtonElement
    expect(trigger.title).toBe('')
    fireEvent.click(trigger)
    expect(screen.getByTestId('guard-confirm-dialog')).toBeTruthy()
  })
})
