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
    render(<ChangeDetail change={change} onChangeUpdated={() => {}} onOpenArtifact={() => {}} />)
    expect(screen.getByTestId('step-build').dataset.state).toBe('current')
    expect(screen.getByTestId('donut-fraction').textContent).toBe('19/31 任务完成')
    expect(screen.getByTestId('badge-visualized').dataset.tone).toBe('ok')

    // Flush BacklinksPanel's pending fetch-driven state update inside act()
    // before the test (and RTL's auto-cleanup/unmount) completes.
    await waitFor(() => {})
  })

  it('disables the guard button when tasks are incomplete at build phase', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : (input as Request).url
      if (url.includes('/api/changes/')) {
        return { ok: true, json: async () => ({ name: 'rx101-x', phases: [] }) } as Response
      }
      return { ok: true, json: async () => ({ component: {}, forward: [], backlinks: [] }) } as Response
    })

    const change: ChangeSummary = {
      name: 'rx101-x', workflow: 'full', phase: 'build', archived: false,
      tasksCompleted: 9, tasksTotal: 72, verifyResult: 'pending', createdAt: '2026-05-29',
      artifacts: {}, visualized: true, designReviewed: true, verifyReviewed: false,
      verifiedAt: '', buildMode: '', reviewMode: '', tddMode: '', autoTransition: false,
    }
    render(<ChangeDetail change={change} onChangeUpdated={() => {}} onOpenArtifact={() => {}} />)
    const trigger = screen.getByTestId('guard-trigger') as HTMLButtonElement
    expect(trigger.disabled).toBe(true)
    expect(trigger.title).toBe('任务未全部完成 (9/72)，无法进入验证')

    await waitFor(() => {})
  })

  it('calls onOpenArtifact (not its own viewer) when an artifact button is clicked', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : (input as Request).url
      if (url.includes('/api/changes/')) {
        return {
          ok: true,
          json: async () => ({
            name: 'rx101-x',
            phases: [
              {
                key: 'design',
                label: '设计',
                artifacts: [{ file: 'design.md', label: '设计文档', exists: true, path: '/x/rx101-x/design.md' }],
              },
            ],
          }),
        } as Response
      }
      return { ok: true, json: async () => ({ component: {}, forward: [], backlinks: [] }) } as Response
    })

    const change: ChangeSummary = {
      name: 'rx101-x', workflow: 'full', phase: 'build', archived: false,
      tasksCompleted: 19, tasksTotal: 31, verifyResult: 'pending', createdAt: '2026-05-29',
      artifacts: {}, visualized: true, designReviewed: true, verifyReviewed: false,
      verifiedAt: '', buildMode: '', reviewMode: '', tddMode: '', autoTransition: false,
    }
    const onOpenArtifact = vi.fn()
    render(<ChangeDetail change={change} onChangeUpdated={() => {}} onOpenArtifact={onOpenArtifact} />)

    const artifactButton = await screen.findByText('设计文档')
    artifactButton.click()

    expect(onOpenArtifact).toHaveBeenCalledWith('/x/rx101-x/design.md')
    // ChangeDetail no longer owns a viewer of its own.
    expect(screen.queryByRole('region', { name: 'design.md' })).toBeNull()

    await waitFor(() => {})
  })

  it('calls onArtifactsChanged with the flattened, existing-only artifact list for the current change', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : (input as Request).url
      if (url.includes('/api/changes/')) {
        return {
          ok: true,
          json: async () => ({
            name: 'rx101-x',
            phases: [
              {
                key: 'design',
                label: '设计',
                artifacts: [
                  { file: 'design.md', label: '设计文档', exists: true, path: '/x/rx101-x/design.md' },
                  { file: 'proposal.md', label: '提案', exists: false },
                ],
              },
              {
                key: 'build',
                label: '构建',
                artifacts: [{ file: 'tasks.md', label: '任务清单', exists: true, path: '/x/rx101-x/tasks.md' }],
              },
            ],
          }),
        } as Response
      }
      return { ok: true, json: async () => ({ component: {}, forward: [], backlinks: [] }) } as Response
    })

    const change: ChangeSummary = {
      name: 'rx101-x', workflow: 'full', phase: 'build', archived: false,
      tasksCompleted: 19, tasksTotal: 31, verifyResult: 'pending', createdAt: '2026-05-29',
      artifacts: {}, visualized: true, designReviewed: true, verifyReviewed: false,
      verifiedAt: '', buildMode: '', reviewMode: '', tddMode: '', autoTransition: false,
    }
    const onArtifactsChanged = vi.fn()
    render(
      <ChangeDetail
        change={change}
        onChangeUpdated={() => {}}
        onOpenArtifact={() => {}}
        onArtifactsChanged={onArtifactsChanged}
      />,
    )

    await waitFor(() =>
      expect(onArtifactsChanged).toHaveBeenCalledWith([
        { path: '/x/rx101-x/design.md', label: '设计文档' },
        { path: '/x/rx101-x/tasks.md', label: '任务清单' },
      ]),
    )
  })
})
