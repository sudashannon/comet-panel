import { useEffect, useState } from 'react'
import { fetchLintIssues } from '../api/client'
import type { LintIssue } from '../api/types'

export function LintPanel() {
  const [issues, setIssues] = useState<LintIssue[] | null>(null)

  useEffect(() => {
    fetchLintIssues().then(setIssues).catch(() => setIssues([]))
  }, [])

  if (issues === null) return null
  if (issues.length === 0) {
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
