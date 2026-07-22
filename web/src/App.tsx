import { useEffect, useState, useCallback, useMemo } from 'react'
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
import { CommandPalette } from './components/CommandPalette'
import { useKeyboardShortcuts, formatShortcut } from './hooks/useKeyboardShortcuts'
import { useCommandPalette } from './hooks/useCommandPalette'
import { useAppZoom } from './hooks/useAppZoom'
import type { CommandAction } from './hooks/useCommandPalette'

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
  
  // ── Command Palette actions ─────────────────────────────────────────────
  // Registered once; palette and shortcuts share the same action list.
  // View names and labels intentionally match SideRail for consistency.
  const viewLabels: Record<string, string> = {
    changes: '变更仪表盘',
    graph: '知识图谱',
    timeline: '时间线',
    search: '语义搜索',
    recent: '最近更新',
    lint: '文档健康检查',
    report: '报告生成',
    shares: '分享管理',
    calendar: '产品日历',
  }

  const commandActions: CommandAction[] = useMemo(() => [
    ...Object.entries(viewLabels).map(([v, label]) => ({
      id: `nav-${v}`,
      label,
      category: 'Navigation',
      icon: '📍',
      run: () => handleViewChange(v as typeof view),
    })),
    { id: 'bookmarks', label: '收藏夹', category: 'Navigation', icon: '⭐', run: () => setBookmarkPanelOpen((p) => !p) },
    { id: 'settings', label: '设置', category: 'Navigation', icon: '⚙️', run: () => setSettingsOpen(true) },
    { id: 'refresh', label: '刷新数据', category: 'Commands', icon: '🔄', run: () => window.location.reload() },
  ], [])

  const palette = useCommandPalette(commandActions)
  const appZoom = useAppZoom()

  const shortcutDefs = useMemo(() => [
    { key: 'k', ctrlOrCmd: true, label: '命令面板', run: () => {} },
    { key: '1', ctrlOrCmd: true, label: '变更仪表盘', run: () => {} },
    { key: '2', ctrlOrCmd: true, label: '知识图谱', run: () => {} },
    { key: '3', ctrlOrCmd: true, label: '时间线', run: () => {} },
    { key: '4', ctrlOrCmd: true, label: '语义搜索', run: () => {} },
    { key: '5', ctrlOrCmd: true, label: '最近更新', run: () => {} },
    { key: '6', ctrlOrCmd: true, label: '文档健康', run: () => {} },
    { key: '7', ctrlOrCmd: true, label: '产品日历', run: () => {} },
    { key: 'b', ctrlOrCmd: true, label: '收藏夹', run: () => {} },
    { key: 'Escape', ctrlOrCmd: false, label: '关闭面板', run: () => {} },
    { key: "=", ctrlOrCmd: true, label: "放大", run: () => {} },
    { key: "-", ctrlOrCmd: true, label: "缩小", run: () => {} },
    { key: "0", ctrlOrCmd: true, label: "重置缩放", run: () => {} },
  ], [])

  // ── Keyboard shortcuts ──────────────────────────────────────────────────
  useKeyboardShortcuts([
    { key: 'k', ctrlOrCmd: true, label: '命令面板', run: () => palette.togglePalette() },
    { key: '1', ctrlOrCmd: true, label: '变更仪表盘', run: () => handleViewChange('changes') },
    { key: '2', ctrlOrCmd: true, label: '知识图谱', run: () => handleViewChange('graph') },
    { key: '3', ctrlOrCmd: true, label: '时间线', run: () => handleViewChange('timeline') },
    { key: '4', ctrlOrCmd: true, label: '语义搜索', run: () => handleViewChange('search') },
    { key: '5', ctrlOrCmd: true, label: '最近更新', run: () => handleViewChange('recent') },
    { key: '6', ctrlOrCmd: true, label: '文档健康', run: () => handleViewChange('lint') },
    { key: '7', ctrlOrCmd: true, label: '产品日历', run: () => handleViewChange('calendar') },
    { key: 'b', ctrlOrCmd: true, label: '收藏夹', run: () => setBookmarkPanelOpen((p) => !p) },
    { key: 'Escape', ctrlOrCmd: false, label: '关闭面板', run: () => { palette.closePalette(); setViewerPath(null); setBookmarkPanelOpen(false); setSettingsOpen(false) } },
    { key: "=", ctrlOrCmd: true, label: "放大", run: appZoom.zoomIn },
    { key: "-", ctrlOrCmd: true, label: "缩小", run: appZoom.zoomOut },
    { key: "0", ctrlOrCmd: true, label: "重置缩放", run: appZoom.zoomReset },
  ])

  // Every SideRail view switch must close any open MarkdownViewer first —
  // otherwise a doc opened while viewing 变更列表/图谱 stays mounted (still
  // reading changeArtifacts/wikiComponents state from the view being left)
  // after switching to a sibling view, e.g. lingering into 报告 or Lint.
  // Navigate to the changes view and select a specific change by name.
  // Extracts the change name from a document path (e.g. .../changes/<name>/proposal.md).
  function navigateToChange(changeName: string) {
    setView('changes')
    setSelected(changeName)
    setViewerPath(null)
  }

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
    <div className="h-screen flex bg-gradient-to-br from-[#e9eeff] via-[#f2f4fb] to-[#fdfdff] overflow-hidden relative" style={{ zoom: appZoom.zoom }}>
      <SideRail
        view={view}
        onSelect={handleViewChange}
        onOpenSettings={() => setSettingsOpen(true)}
        onToggleBookmarks={() => setBookmarkPanelOpen((v) => !v)}
        bookmarkPanelOpen={bookmarkPanelOpen}
        onOpenPalette={() => palette.openPalette()}
        zoomPercent={appZoom.zoomPercent}
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
              onNavigateToChange={navigateToChange}
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
              onNavigateToChange={navigateToChange}
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
              onNavigateToChange={navigateToChange}
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
          {viewerPath ? (
            <MarkdownViewer
              path={viewerPath}
              onClose={() => setViewerPath(null)}
              onToggleStar={handleToggleStar}
              isStarred={isBookmarked(viewerPath)}
              onNavigateToChange={navigateToChange}
            />
          ) : (
            <CalendarPanel onOpen={(path) => setViewerPath(path)} />
          )}
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
      <CommandPalette palette={palette} shortcuts={shortcutDefs} />
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
