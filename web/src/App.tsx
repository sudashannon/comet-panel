import { useEffect, useState, useCallback } from 'react'
import { fetchWorkspaces, addWorkspace, fetchChangesWithMeta, fetchWikiIndex, fetchBookmarks, addBookmark, removeBookmark } from './api/client'
import type { ChangeSummary, WorkspaceConfig, WikiComponent, Bookmark } from './api/types'
import { KpiCards, classifyChanges } from './components/KpiCards'
import { ChangeExplorer } from './components/ChangeExplorer'
import { ChangeDetail } from './components/ChangeDetail'
import { ChatBubble } from './components/ChatBubble'
import { WorkspaceChips } from './components/WorkspaceChips'
import { MarkdownViewer } from './components/MarkdownViewer'
import { WikiGraph } from './components/WikiGraph'
import { WikiTimeline } from './components/WikiTimeline'
import { LintPanel } from './components/LintPanel'
import { RecentPanel } from './components/RecentPanel'
import { SideRail } from './components/SideRail'
import { SettingsPanel } from './components/SettingsPanel'
import { ReportView } from './components/ReportView'
import { BookmarkPanel } from './components/BookmarkPanel'
import { SemanticSearch } from './components/SemanticSearch'
import { ShareList } from './components/ShareList'
import { CalendarPanel } from './components/CalendarPanel'
import { useWikiEvents } from './hooks/useWikiEvents'

// Single source of truth for the "stuck" threshold: shared by KpiCards'
// internal counts and the KPI-filter classification below so the two can
// never drift apart (see task-17b spec).
const STUCK_THRESHOLD_DAYS = 14

export default function App() {
  const [changes, setChanges] = useState<ChangeSummary[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [workspaces, setWorkspaces] = useState<WorkspaceConfig[]>([])
  const [activeWorkspace, setActiveWorkspace] = useState<string | null>(null)
  const [failedWorkspaces, setFailedWorkspaces] = useState<string[]>([])
  const [activeKpiFilter, setActiveKpiFilter] = useState<string | null>(null)
  // App-level view switch: 变更列表 (default) is the existing per-change
  // dashboard; 图谱/Lint are GLOBAL cross-change views over the whole wiki
  // index, so they live as siblings here rather than nested under a change.
  const [view, setView] = useState<'changes' | 'graph' | 'timeline' | 'search' | 'recent' | 'lint' | 'report' | 'shares' | 'calendar'>('changes')
  // Wiki components (id -> path) so a WikiGraph node tap can open the right
  // artifact in MarkdownViewer; fetched independently of the graph view
  // itself since node ids alone don't carry a file path.
  const [wikiComponents, setWikiComponents] = useState<WikiComponent[]>([])
  const [viewerPath, setViewerPath] = useState<string | null>(null)
  // Current change's flattened, existing-only artifact list — fed by
  // ChangeDetail (which already fetches the change detail for ArtifactList's
  // sibling data) and consumed by MarkdownViewer's in-viewer switcher, so a
  // user reading one artifact can hop to another without closing the viewer.
  const [changeArtifacts, setChangeArtifacts] = useState<{ path: string; label: string }[]>([])
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [bookmarkPanelOpen, setBookmarkPanelOpen] = useState(false)
  const [wikiIndexing, setWikiIndexing] = useState(false)
  const [wikiIndexingChanged, setWikiIndexingChanged] = useState<number | null>(null)

  // Every SideRail view switch must close any open MarkdownViewer first —
  // otherwise a doc opened while viewing 变更列表/图谱 stays mounted (still
  // reading changeArtifacts/wikiComponents state from the view being left)
  // after switching to a sibling view, e.g. lingering into 报告 or Lint.
  function handleViewChange(v: 'changes' | 'graph' | 'timeline' | 'search' | 'recent' | 'lint' | 'report' | 'shares' | 'calendar') {
    setViewerPath(null)
    setView(v)
  }

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

  const refreshWikiIndex = useCallback(() => {
    fetchWikiIndex()
      .then(setWikiComponents)
      .catch(() => setWikiComponents([]))
  }, [])

  useEffect(() => {
    refreshWikiIndex()
  }, [refreshWikiIndex])

  useEffect(() => {
    fetchBookmarks()
      .then(setBookmarks)
      .catch(() => setBookmarks([]))
  }, [])

  useWikiEvents({
    onIndexingStarted: (changed) => {
      setWikiIndexingChanged(changed)
      setWikiIndexing(true)
    },
    onUpdate: () => {
      setWikiIndexing(false)
      setWikiIndexingChanged(null)
      refreshWikiIndex()
    },
  })

  useEffect(() => {
    if (!wikiIndexing) return
    const timer = window.setTimeout(() => {
      setWikiIndexing(false)
      setWikiIndexingChanged(null)
    }, 8000)
    return () => window.clearTimeout(timer)
  }, [wikiIndexing])

  const isBookmarked = (path: string) => bookmarks.some((b) => b.path === path)

  // Toggle star: adds via POST if not yet starred, removes via DELETE if
  // already starred. `type` is inferred from the path so callers don't need
  // to thread the artifact kind through every MarkdownViewer.
  function handleToggleStar(path: string, title: string) {
    if (isBookmarked(path)) {
      removeBookmark(path)
        .then(setBookmarks)
        .catch(() => {})
    } else {
      const type = path.split('.').pop() || 'doc'
      addBookmark({ path, title, type })
        .then(setBookmarks)
        .catch(() => {})
    }
  }

  function handleRemoveBookmark(path: string) {
    removeBookmark(path)
      .then(setBookmarks)
      .catch(() => {})
  }

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
    <div className="h-screen flex bg-gradient-to-br from-[#e9eeff] via-[#f2f4fb] to-[#fdfdff] overflow-hidden relative">
      <SideRail
        view={view}
        onSelect={handleViewChange}
        onOpenSettings={() => setSettingsOpen(true)}
        onToggleBookmarks={() => setBookmarkPanelOpen((v) => !v)}
        bookmarkPanelOpen={bookmarkPanelOpen}
      />
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <div className="xl:hidden flex items-center p-3 shrink-0">
          <button
            data-testid="hamburger-toggle"
            onClick={() => setSidebarOpen((v) => !v)}
            className="text-sm"
          >
            ☰ 工作区
          </button>
        </div>

      {failedWorkspaces.length > 0 && (
        <div data-testid="workspace-warning-banner" className="text-xs bg-[#fdeeee] text-[#dc2626] rounded p-2 m-3 shrink-0">
          ⚠ 以下 workspace 无法读取，已跳过：{failedWorkspaces.join(', ')}
        </div>
      )}

      {wikiIndexing && (
        <div data-testid="wiki-indexing-banner" className="text-xs bg-[#eef4ff] text-[#0063f8] rounded p-2 mx-3 mb-3 shrink-0">
          ℹ {typeof wikiIndexingChanged === 'number' ? `检测到 ${wikiIndexingChanged} 个文件更新，正在进入搜索库…` : '已检测到文档更新，正在进入搜索库…'} 几秒后即可检索
        </div>
      )}

      {view === 'changes' && (
        <>
          <div className="flex-1 flex min-h-0">
            <aside
              data-testid="sidebar"
              className={
                (sidebarOpen ? 'block' : 'hidden') +
                ' xl:block w-full xl:w-[340px] shrink-0 border-r border-[#e8e8ed] p-3 overflow-y-auto'
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
              <ChangeExplorer
                changes={visibleChanges}
                selected={selected}
                onSelect={(name) => {
                  setViewerPath(null)
                  setChangeArtifacts([])
                  setSelected(name)
                  setSidebarOpen(false)
                }}
              />
            </aside>

            <main className="flex-1 min-h-0 overflow-y-auto p-4">
              {viewerPath ? (
                <MarkdownViewer
                  path={viewerPath}
                  artifacts={changeArtifacts}
                  workspace={selectedChange?.workspace}
                  onSelectArtifact={setViewerPath}
                  onClose={() => setViewerPath(null)}
                  onToggleStar={handleToggleStar}
                  isStarred={isBookmarked(viewerPath)}
                />
              ) : (
                <div className="space-y-4">
                  <KpiCards
                    changes={workspaceChanges}
                    stuckThresholdDays={STUCK_THRESHOLD_DAYS}
                    now={now}
                    activeFilter={activeKpiFilter}
                    onFilterSelect={setActiveKpiFilter}
                  />
                  {selectedChange ? (
                    <ChangeDetail
                      change={selectedChange}
                      onOpenArtifact={setViewerPath}
                      onArtifactsChanged={setChangeArtifacts}
                      onChangeUpdated={() =>
                        fetchChangesWithMeta()
                          .then((r) => {
                            setChanges(r.changes ?? [])
                            setFailedWorkspaces(r.failedWorkspaces ?? [])
                          })
                          .catch(() => {})
                      }
                    />
                  ) : (
                    <div
                      data-testid="change-empty-state"
                      className="flex flex-col items-center justify-center gap-2 text-center rounded-lg border border-dashed border-[#e8e8ed] bg-white py-24 px-6"
                    >
                      <span className="text-4xl text-[#a1a1a6]" aria-hidden="true">
                        ◇
                      </span>
                      <p className="text-sm font-medium text-[#1d1d1f]">从左侧选择一个变更查看详情</p>
                      <p className="text-xs text-[#6e6e73]">
                        可通过上方 KPI 卡片筛选，或在左侧工作区与搜索中定位目标变更
                      </p>
                    </div>
                  )}
                </div>
              )}
            </main>
          </div>

        </>
      )}

      {view === 'graph' && (
        <div className="flex-1 min-h-0 p-4">
          {viewerPath ? (
            <MarkdownViewer
              path={viewerPath}
              onClose={() => setViewerPath(null)}
              onToggleStar={handleToggleStar}
              isStarred={isBookmarked(viewerPath)}
            />
          ) : (
            <WikiGraph
              onNodeClick={(id) => {
                const component = wikiComponents.find((c) => c.id === id)
                setViewerPath(component?.path ?? id)
              }}
            />
          )}
        </div>
      )}

      {view === 'timeline' && (
        <div className="flex-1 min-h-0 p-4">
          <WikiTimeline />
        </div>
      )}

      <div className="flex-1 min-h-0 relative overflow-hidden" style={{ display: view === 'search' ? undefined : 'none' }}>
        <div className="absolute inset-0 overflow-y-auto p-4">
          <SemanticSearch
            onNodeClick={(id) => {
              const component = wikiComponents.find((c) => c.id === id)
              setViewerPath(component?.path ?? id)
            }}
          />
        </div>
        {viewerPath && view === 'search' && (
          <div className="absolute inset-0 z-10 overflow-y-auto bg-white">
            <MarkdownViewer
              path={viewerPath}
              onClose={() => setViewerPath(null)}
              onToggleStar={handleToggleStar}
              isStarred={isBookmarked(viewerPath)}
            />
          </div>
        )}
      </div>

      {view === 'report' && (
        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          <ReportView workspace={activeWorkspace} workspaces={workspaces} onOpenSettings={() => setSettingsOpen(true)} />
        </div>
      )}

      {view === 'lint' && (
        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          {viewerPath ? (
            <MarkdownViewer
              path={viewerPath}
              onClose={() => setViewerPath(null)}
              onToggleStar={handleToggleStar}
              isStarred={isBookmarked(viewerPath)}
            />
          ) : (
            <LintPanel onOpen={(path) => setViewerPath(path)} />
          )}
        </div>
      )}

      {view === 'recent' && (
        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          {viewerPath ? (
            <MarkdownViewer
              path={viewerPath}
              onClose={() => setViewerPath(null)}
              onToggleStar={handleToggleStar}
              isStarred={isBookmarked(viewerPath)}
            />
          ) : (
            <RecentPanel onOpen={(path) => setViewerPath(path)} />
          )}
        </div>
      )}

      {view === 'shares' && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <ShareList />
        </div>
      )}

      {view === 'calendar' && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <CalendarPanel onOpen={(path) => setViewerPath(path)} />
        </div>
      )}
      </div>
      {bookmarkPanelOpen && (
        <div className="absolute top-5 left-[76px] z-40">
          <BookmarkPanel
            bookmarks={bookmarks}
            onOpen={(path) => {
              setViewerPath(path)
              setBookmarkPanelOpen(false)
            }}
            onRemove={handleRemoveBookmark}
            onClose={() => setBookmarkPanelOpen(false)}
          />
        </div>
      )}
      {settingsOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-md max-h-[85vh] overflow-y-auto">
            <SettingsPanel onClose={() => setSettingsOpen(false)} />
          </div>
        </div>
      )}
      {viewerPath && (
        <ChatBubble
          key={viewerPath}
          changeName={selectedChange?.name}
          workspace={selectedChange?.workspace}
          documentPath={viewerPath}
        />
      )}
    </div>
  )
}
