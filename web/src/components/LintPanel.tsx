import { useEffect, useState } from 'react'
import { fetchLintIssues } from '../api/client'
import type { LintIssue } from '../api/types'

const POLL_INTERVAL_MS = 3000
const MAX_POLL_ATTEMPTS = 20

export function LintPanel() {
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
      return <div className="text-xs text-[#6e6e73] animate-pulse">索引构建中…</div>
    }
    return <div className="text-xs text-[#6e6e73]">未发现问题</div>
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
          <div className="sticky top-0 flex items-center gap-2 bg-white/95 py-1 border-b border-[#e8e8ed] mb-1">
            <span className="shrink-0 text-[#c47a06] font-mono font-semibold whitespace-nowrap">{rule}</span>
            <span className="text-[#6e6e73]">({items.length})</span>
          </div>
          <div className="space-y-1">
            {items.map((i, idx) => <LintDetail key={idx} detail={i.detail} />)}
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

function LintDetail({ detail }: { detail: string }) {
  const decodedDetail = safeDecode(detail)
  const match = detail.match(DEAD_LINK_DETAIL_RE)
  if (!match) {
    return (
      <div className="text-[#6e6e73] truncate pl-1" title={decodedDetail}>
        {decodedDetail}
      </div>
    )
  }
  const [, prefix, path, suffix] = match
  return (
    <div className="flex min-w-0 text-[#6e6e73] pl-1" title={decodedDetail}>
      <span className="shrink-0 whitespace-nowrap">{prefix}</span>
      <span className="min-w-0 truncate" dir="rtl" style={{ textAlign: 'left' }}>
        {safeDecode(path)}
      </span>
      <span className="shrink-0 whitespace-nowrap">{suffix}</span>
    </div>
  )
}

