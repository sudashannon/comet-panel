import { useEffect, useState } from 'react'
import { fetchWorkspaces, addWorkspace, fetchChangesWithMeta } from './api/client'
import type { ChangeSummary, WorkspaceConfig } from './api/types'
import { KpiCards, classifyChanges } from './components/KpiCards'
import { ChangeExplorer } from './components/ChangeExplorer'
import { ChangeDetail } from './components/ChangeDetail'
import { ChatBubble } from './components/ChatBubble'
import { WorkspaceChips } from './components/WorkspaceChips'

// Single source of truth for the "stuck" threshold: shared by KpiCards'
// internal counts and the KPI-filter classification below so the two can
// never drift apart (see task-17b spec).
const STUCK_THRESHOLD_DAYS = 14

export default function App() {
  const [changes, setChanges] = useState<ChangeSummary[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [workspaces, setWorkspaces] = useState<WorkspaceConfig[]>([])
  const [activeWorkspace, setActiveWorkspace] = useState<string | null>(null)
  const [failedWorkspaces, setFailedWorkspaces] = useState<string[]>([])
  const [activeKpiFilter, setActiveKpiFilter] = useState<string | null>(null)

  useEffect(() => {
    fetchWorkspaces()
      .then((ws) => setWorkspaces(ws ?? []))
      .catch(() => setWorkspaces([]))
  }, [])

  useEffect(() => {
    fetchChangesWithMeta()
      .then((r) => {
        setChanges(r.changes ?? [])
        setFailedWorkspaces(r.failedWorkspaces ?? [])
      })
      .catch(() => setChanges([]))
  }, [])

  const selectedChange = changes.find((c) => c.name === selected) ?? null

  // `now` is computed once per render and threaded into both KpiCards (for
  // its displayed counts) and classifyChanges below (for the KPI filter), so
  // the "stuck" bucket can never disagree between what's shown and what's
  // filtered.
  const now = new Date()

  // Workspace filter narrows the pool that KpiCards counts from (preserves
  // pre-existing behavior: KPI numbers reflect the active workspace scope).
  // It intentionally does NOT include the KPI filter itself — selecting a
  // KPI filter (e.g. "已归档") must narrow the change list below, not
  // change what the OTHER cards report.
  const workspaceChanges = activeWorkspace
    ? changes.filter((c) => c.workspace === activeWorkspace)
    : changes

  const classified = classifyChanges(workspaceChanges, STUCK_THRESHOLD_DAYS, now)
  const kpiFilterSets: Record<string, ChangeSummary[]> = {
    active: classified.active,
    archived: classified.archived,
    stuck: classified.stuck,
    'verify-failed': classified.verifyFailed,
    'incomplete-tasks': classified.incomplete,
  }
  const visibleChanges = activeKpiFilter
    ? kpiFilterSets[activeKpiFilter] ?? []
    : workspaceChanges

  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      <div className="xl:hidden flex items-center p-3 border-b border-[#e8e8ed]">
        <button
          data-testid="hamburger-toggle"
          onClick={() => setSidebarOpen((v) => !v)}
          className="text-sm"
        >
          ☰ 工作区
        </button>
      </div>

      <div className="flex">
        <aside
          data-testid="sidebar"
          className={
            (sidebarOpen ? 'block' : 'hidden') +
            ' xl:block w-full xl:w-[280px] border-r border-[#e8e8ed] p-3'
          }
        >
          {failedWorkspaces.length > 0 && (
            <div data-testid="workspace-warning-banner" className="text-xs bg-[#fdeeee] text-[#dc2626] rounded p-2 mb-2">
              ⚠ 以下 workspace 无法读取，已跳过：{failedWorkspaces.join(', ')}
            </div>
          )}
          <WorkspaceChips
            workspaces={workspaces}
            active={activeWorkspace}
            onSelect={setActiveWorkspace}
            onAdd={async (cfg) => {
              await addWorkspace(cfg)
              setWorkspaces((prev) => [...prev, cfg])
            }}
          />
          <ChangeExplorer changes={visibleChanges} selected={selected} onSelect={setSelected} />
        </aside>

        <main className="flex-1 p-4 space-y-4">
          <KpiCards
            changes={workspaceChanges}
            stuckThresholdDays={STUCK_THRESHOLD_DAYS}
            now={now}
            activeFilter={activeKpiFilter}
            onFilterSelect={setActiveKpiFilter}
          />
          {selectedChange && (
            <ChangeDetail
              change={selectedChange}
              onChangeUpdated={() =>
                fetchChangesWithMeta()
                  .then((r) => {
                    setChanges(r.changes ?? [])
                    setFailedWorkspaces(r.failedWorkspaces ?? [])
                  })
                  .catch(() => {})
              }
            />
          )}
        </main>
      </div>

      {selectedChange && <ChatBubble changeName={selectedChange.name} />}
    </div>
  )
}
