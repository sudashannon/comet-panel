import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { ChangeDetail } from './ChangeDetail'
import type { ChangeSummary } from '../api/types'

afterEach(() => vi.restoreAllMocks())

describe('ChangeDetail', () => {
  it('renders stepper, donut, and review badges for the given change', async () => {
    // BacklinksPanel and ArtifactList both fetch on mount; mock fetch so this
    // test stays hermetic and doesn't emit act() warnings from a real/unmocked
    // network call resolving after the test's synchronous assertions run
    // (same pattern as client.test.ts / BacklinksPanel.test.tsx). Branches by
    // URL since the two panels hit different endpoints with different
    // response shapes (/api/wiki/component/... vs /api/changes/...).
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : (input as Request).url
      if (url.includes('/api/changes/')) {
        return {
          ok: true,
          json: async () => ({ name: 'rx101-x', phases: [] }),
        } as Response
      }
      return {
        ok: true,
        json: async () => ({ component: {}, forward: [], backlinks: [] }),
      } as Response
    })

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

    // Flush BacklinksPanel's pending fetch-driven state update inside act()
    // before the test (and RTL's auto-cleanup/unmount) completes.
    await waitFor(() => {})
  })
})
