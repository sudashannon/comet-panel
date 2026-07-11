import { useEffect } from 'react'

// useWikiEvents subscribes to the backend's /api/wiki/events SSE stream and
// invokes onUpdate whenever the wiki watcher (see wiki/watcher.go
// processBatch) finishes a rebuild after detecting file changes -- so
// consumers can refetch instead of waiting on their own poll interval or a
// manual page refresh.
//
// EventSource is unavailable in the jsdom test environment (and in any
// runtime without it); guarding on its existence lets components using this
// hook keep working -- minus live updates -- in both cases instead of
// throwing during render.
export function useWikiEvents(onUpdate: () => void) {
  useEffect(() => {
    if (typeof EventSource === 'undefined') return
    const es = new EventSource('/api/wiki/events')
    es.addEventListener('graph-updated', onUpdate)
    return () => es.close()
  }, [onUpdate])
}
