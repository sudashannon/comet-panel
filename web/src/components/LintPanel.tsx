import { useEffect, useState } from 'react'
import { fetchLintIssues } from '../api/client'
import type { LintIssue } from '../api/types'

const POLL_INTERVAL_MS = 3000
const MAX_POLL_ATTEMPTS = 20

export function LintPanel({ onOpen }: { onOpen?: (path: string) => void }) {
  const [issues, setIssues] = useState<LintIssue[]>([])
  const [gaveUp, setGaveUp] = useState(false)

  useEffect(() => {
    let cancelled = false
    let attempts = 0
    let timer: number | undefined

    const poll = () => {
      fetchLintIssues()
        .then((data) => {
          if (cancelled) return
          if (data.length > 0) {
            setIssues(data)
            return
          }
          setIssues([])
          attempts += 1
          if (attempts >= MAX_POLL_ATTEMPTS) {
            setGaveUp(true)
            return
          }
          timer = window.setTimeout(poll, POLL_INTERVAL_MS)
        })
        .catch(() => {
          if (cancelled) return
          setIssues([])
          setGaveUp(true)
        })
    }

    poll()

    return () => {
      cancelled = true
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [])

  if (issues.length === 0) {
    if (!gaveUp) {
      return <div className="text-xs text-[var(--color-text-secondary)] animate-pulse">索引构建中…</div>
    }
    return <div className="text-xs text-[var(--color-text-secondary)]">未发现问题</div>
  }

  const groups = new Map<string, LintIssue[]>()
  for (const issue of issues) {
    const list = groups.get(issue.rule)
    if (list) list.push(issue)
    else groups.set(issue.rule, [issue])
  }

  return (
    <div className="space-y-4 text-xs">
      {[...groups.entries()].map(([rule, items]) => (
        <section key={rule}>
          <div className="sticky top-0 flex items-center gap-2 bg-white/95 py-1 border-b border-[var(--color-border)] mb-1">
            <span className="shrink-0 text-[var(--color-warn)] font-mono font-semibold whitespace-nowrap">{rule}</span>
            <span className="text-[var(--color-text-secondary)]">({items.length})</span>
          </div>
          <div className="space-y-1">
            {items.map((i, idx) => (
              <LintDetail key={idx} detail={i.detail} componentId={i.componentId} onOpen={onOpen} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

// Dead-link details look like "link to <path> has no matching component" —
// the path can be a long absolute filesystem path, and the component filename
// at its tail is the actually useful part. A plain `truncate` ellipsis cuts
// the string from the right, hiding exactly that filename. Splitting off the
// static prefix/suffix and rendering the path in an RTL-truncated span keeps
// the ellipsis on the LEFT of the path instead, so the filename stays visible.
// Detail text may embed percent-encoded paths (e.g. URL-encoded CJK filenames
// like `%E4%BA%A7%E7%BA%BF`); decode them so filenames render as readable
// text instead of escape sequences. Malformed sequences throw, so guard and
// fall back to the raw string.
function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
}

const DEAD_LINK_DETAIL_RE = /^(link to )(.+)( has no matching component)$/

function LintDetail({ detail, componentId, onOpen }: { detail: string; componentId: string; onOpen?: (path: string) => void }) {
  const decodedDetail = safeDecode(detail)
  const match = detail.match(DEAD_LINK_DETAIL_RE)

  // Source file button (the component that has the broken link)
  const sourceButton = onOpen && componentId ? (
    <button
      type="button"
      onClick={() => onOpen(componentId)}
      className="shrink-0 ml-1 text-[var(--color-accent)] hover:underline"
      title={`打开来源: ${componentId}`}
    >
      📄
    </button>
  ) : null

  if (!match) {
    return (
      <div className="flex items-center min-w-0 text-[var(--color-text-secondary)] pl-1" title={decodedDetail}>
        <span className="truncate">{decodedDetail}</span>
        {sourceButton}
      </div>
    )
  }
  const [, prefix, path, suffix] = match
  return (
    <div className="flex items-center min-w-0 text-[var(--color-text-secondary)] pl-1" title={decodedDetail}>
      <span className="shrink-0 whitespace-nowrap">{prefix}</span>
      <span className="min-w-0 truncate" dir="rtl" style={{ textAlign: 'left' }}>
        {safeDecode(path)}
      </span>
      <span className="shrink-0 whitespace-nowrap">{suffix}</span>
      {sourceButton}
    </div>
  )
}

