import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchChanges, fetchWorkspaces, addWorkspace, fetchChangesWithMeta } from './client'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('fetchChanges', () => {
  it('unwraps the {changes, dir} envelope into a bare array', async () => {
    const mockResponse = {
      dir: '../miao/openspec',
      changes: [
        {
          name: 'rx101-system-sw-architecture',
          workflow: 'full',
          phase: 'build',
          archived: false,
          tasksCompleted: 19,
          tasksTotal: 31,
          verifyResult: 'pending',
          createdAt: '2026-05-29',
          artifacts: {},
          visualized: true,
          designReviewed: true,
          verifyReviewed: false,
          verifiedAt: '',
          buildMode: 'subagent-driven-development',
          reviewMode: 'standard',
          tddMode: 'direct',
          autoTransition: true,
          stateWarning: '',
        },
      ],
    }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response)

    const result = await fetchChanges()
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('rx101-system-sw-architecture')
    expect(result[0].tasksTotal).toBe(31)
  })

  it('throws on non-OK response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 500 } as Response)
    await expect(fetchChanges()).rejects.toThrow()
  })

  it('resolves to [] when changes is null (nil slice JSON-encodes as null)', async () => {
    const mockResponse = { changes: null, dir: '../miao/openspec' }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response)

    const result = await fetchChanges()
    expect(result).toEqual([])
  })
})

describe('fetchWorkspaces', () => {
  it('returns the parsed workspace list', async () => {
    const mockResponse = [
      { alias: 'miao', path: '/x/miao', color: '#0063f8' },
      { alias: 'wan2_2_deploy', path: '/x/wan', color: '#16a34a' },
    ]
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response)

    const result = await fetchWorkspaces()
    expect(result).toEqual(mockResponse)
  })

  it('throws on non-OK response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 500 } as Response)
    await expect(fetchWorkspaces()).rejects.toThrow()
  })
})

describe('addWorkspace', () => {
  it('POSTs the workspace config as JSON', async () => {
    const cfg = { alias: 'new-ws', path: '/x/new', color: '#0063f8' }
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true } as Response)

    await addWorkspace(cfg)

    expect(fetchSpy).toHaveBeenCalledWith('/api/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg),
    })
  })

  it('throws on non-OK response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 409 } as Response)
    await expect(addWorkspace({ alias: 'miao', path: '/x/miao', color: '#0063f8' })).rejects.toThrow()
  })
})

describe('fetchChangesWithMeta', () => {
  it('returns the full envelope, preserving failedWorkspaces', async () => {
    const mockResponse = {
      changes: [
        {
          name: 'rx101-system-sw-architecture',
          workflow: 'full',
          phase: 'build',
          archived: false,
          tasksCompleted: 19,
          tasksTotal: 31,
          verifyResult: 'pending',
          createdAt: '2026-05-29',
          artifacts: {},
          visualized: true,
          designReviewed: true,
          verifyReviewed: false,
          verifiedAt: '',
          buildMode: 'subagent-driven-development',
          reviewMode: 'standard',
          tddMode: 'direct',
          autoTransition: true,
          workspace: 'miao',
        },
      ],
      failedWorkspaces: ['broken-ws'],
    }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response)

    const result = await fetchChangesWithMeta()
    expect(result.changes).toHaveLength(1)
    expect(result.changes[0].name).toBe('rx101-system-sw-architecture')
    expect(result.failedWorkspaces).toEqual(['broken-ws'])
  })

  it('throws on non-OK response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 500 } as Response)
    await expect(fetchChangesWithMeta()).rejects.toThrow()
  })
})
