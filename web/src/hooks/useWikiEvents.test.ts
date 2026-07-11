import { renderHook } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { useWikiEvents } from './useWikiEvents'

// Minimal EventSource stand-in: jsdom does not implement EventSource (see
// useWikiEvents.ts's typeof guard), so tests exercising the "EventSource
// available" branch need their own mock. addEventListener only tracks the
// 'graph-updated' listener actually used by the hook -- other event names
// are ignored since the hook never registers them.
class MockEventSource {
  static instances: MockEventSource[] = []
  listeners: Record<string, Array<() => void>> = {}
  closed = false
  constructor(public url: string) {
    MockEventSource.instances.push(this)
  }
  addEventListener(type: string, cb: () => void) {
    ;(this.listeners[type] ??= []).push(cb)
  }
  close() {
    this.closed = true
  }
  emit(type: string) {
    for (const cb of this.listeners[type] ?? []) cb()
  }
}

afterEach(() => {
  MockEventSource.instances.length = 0
  vi.unstubAllGlobals()
})

describe('useWikiEvents', () => {
  it('connects to /api/wiki/events and invokes onUpdate on a graph-updated event', () => {
    vi.stubGlobal('EventSource', MockEventSource)
    const onUpdate = vi.fn()
    renderHook(() => useWikiEvents(onUpdate))

    expect(MockEventSource.instances).toHaveLength(1)
    expect(MockEventSource.instances[0].url).toBe('/api/wiki/events')
    expect(onUpdate).not.toHaveBeenCalled()

    MockEventSource.instances[0].emit('graph-updated')
    expect(onUpdate).toHaveBeenCalledTimes(1)
  })

  it('closes the connection on unmount', () => {
    vi.stubGlobal('EventSource', MockEventSource)
    const { unmount } = renderHook(() => useWikiEvents(() => {}))
    expect(MockEventSource.instances[0].closed).toBe(false)
    unmount()
    expect(MockEventSource.instances[0].closed).toBe(true)
  })

  it('does nothing when EventSource is unavailable (e.g. jsdom default)', () => {
    vi.stubGlobal('EventSource', undefined)
    expect(() => renderHook(() => useWikiEvents(() => {}))).not.toThrow()
    expect(MockEventSource.instances).toHaveLength(0)
  })
})
