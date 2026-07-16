import { useEffect } from 'react'

type WikiEventHandlers =
  | (() => void)
  | {
      onUpdate?: () => void
      onIndexingStarted?: (changed: number | null) => void
    }

// useWikiEvents subscribes to the backend's /api/wiki/events SSE stream.
// Backward compatible form: useWikiEvents(onUpdate)
// Extended form: useWikiEvents({ onUpdate, onIndexingStarted })
export function useWikiEvents(handlers: WikiEventHandlers) {
  const onUpdate = typeof handlers === 'function' ? handlers : handlers.onUpdate
  const onIndexingStarted = typeof handlers === 'function' ? undefined : handlers.onIndexingStarted

  useEffect(() => {
    if (typeof EventSource === 'undefined') return
    const es = new EventSource('/api/wiki/events')
    if (onUpdate) es.addEventListener('graph-updated', onUpdate)
    if (onIndexingStarted) {
      es.addEventListener('indexing-started', (event: MessageEvent) => {
        let changed: number | null = null
        try {
          const payload = JSON.parse(event.data ?? '{}')
          if (typeof payload.changed === 'number') changed = payload.changed
        } catch {}
        onIndexingStarted(changed)
      })
    }
    return () => es.close()
  }, [onUpdate, onIndexingStarted])
}
