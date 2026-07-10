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

  return (
    <div className="space-y-1 text-xs">
      {issues.map((i, idx) => (
        <div key={idx} className="flex gap-2">
          <span className="text-[#c47a06] font-mono">{i.rule}</span>
          <span className="text-[#6e6e73] truncate">{i.detail}</span>
        </div>
      ))}
    </div>
  )
}
