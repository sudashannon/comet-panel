import { useEffect, useState } from 'react'
import { fetchWorkspaces, addWorkspace, fetchChangesWithMeta, fetchWikiIndex } from './api/client'
import type { ChangeSummary, WorkspaceConfig, WikiComponent } from './api/types'
import { KpiCards, classifyChanges } from './components/KpiCards'
import { ChangeExplorer } from './components/ChangeExplorer'
import { ChangeDetail } from './components/ChangeDetail'
import { ChatBubble } from './components/ChatBubble'
import { WorkspaceChips } from './components/WorkspaceChips'
import { MarkdownViewer } from './components/MarkdownViewer'
import { WikiGraph } from './components/WikiGraph'
import { LintPanel } from './components/LintPanel'

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
  // App-level view switch: 变更列表 (default) is the existing per-change
  // dashboard; 图谱/Lint are GLOBAL cross-change views over the whole wiki
  // index, so they live as siblings here rather than nested under a change.
  const [view, setView] = useState<'changes' | 'graph' | 'lint'>('changes')
  // Wiki components (id -> path) so a WikiGraph node tap can open the right
  // artifact in MarkdownViewer; fetched independently of the graph view
  // itself since node ids alone don't carry a file path.
  const [wikiComponents, setWikiComponents] = useState<WikiComponent[]>([])
  const [viewerPath, setViewerPath] = useState<string | null>(null)

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

  useEffect(() => {
    fetchWikiIndex()
      .then(setWikiComponents)
      .catch(() => setWikiComponents([]))
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

      <nav className="flex items-center gap-2 p-3 border-b border-[#e8e8ed]" data-testid="view-switcher">
        {(
          [
            ['changes', '变更列表'],
            ['graph', '图谱'],
            ['lint', 'Lint'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setView(key)}
            aria-pressed={view === key}
            className={
              'text-sm px-3 py-1.5 rounded ' +
              (view === key ? 'bg-[#0063f8] text-white' : 'text-[#1d1d1f] hover:bg-[#f0f5ff]')
            }
          >
            {label}
          </button>
        ))}
      </nav>

      {failedWorkspaces.length > 0 && (
        <div data-testid="workspace-warning-banner" className="text-xs bg-[#fdeeee] text-[#dc2626] rounded p-2 m-3">
          ⚠ 以下 workspace 无法读取，已跳过：{failedWorkspaces.join(', ')}
        </div>
      )}

      {view === 'changes' && (
        <>
          <div className="flex">
            <aside
              data-testid="sidebar"
              className={
                (sidebarOpen ? 'block' : 'hidden') +
                ' xl:block w-full xl:w-[280px] border-r border-[#e8e8ed] p-3'
              }
            >
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

          {selectedChange && <ChatBubble key={selectedChange.name} changeName={selectedChange.name} />}
        </>
      )}

      {view === 'graph' && (
        <div className="p-4">
          <WikiGraph
            onNodeClick={(id) => {
              const component = wikiComponents.find((c) => c.id === id)
              setViewerPath(component?.path ?? id)
            }}
          />
        </div>
      )}

      {view === 'lint' && (
        <div className="p-4">
          <LintPanel />
        </div>
      )}

      <MarkdownViewer path={viewerPath} onClose={() => setViewerPath(null)} />
    </div>
  )
}
