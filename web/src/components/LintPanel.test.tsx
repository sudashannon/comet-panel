import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { LintPanel } from './LintPanel'

afterEach(() => vi.restoreAllMocks())

describe('LintPanel', () => {
  it('lists lint issues grouped by rule', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => [
        { rule: 'orphan', componentId: '/x/orphan.md', detail: 'Orphan' },
        { rule: 'dead-link', componentId: '/x/src.md', detail: 'broken' },
      ],
    } as Response)
    render(<LintPanel />)
    await waitFor(() => expect(screen.getByText(/orphan/)).toBeTruthy())
    await waitFor(() => expect(screen.getByText(/dead-link/)).toBeTruthy())
  })

  it('shows a clean state with zero issues', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => [] } as Response)
    render(<LintPanel />)
    await waitFor(() => expect(screen.getByText('未发现问题')).toBeTruthy())
  })
})
