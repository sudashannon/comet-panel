import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchChanges } from './client'

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
