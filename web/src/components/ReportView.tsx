import { useEffect, useState } from 'react'
import { fetchChatConfig, generateReport, listReports, getReport } from '../api/client'
import type { ChatConfig, ReportMeta, ReportResponse, ReportType, WorkspaceConfig } from '../api/types'
import { MarkdownViewer } from './MarkdownViewer'

interface Props {
  workspace: string | null
  workspaces: WorkspaceConfig[]
  // Owned by the SideRail ⚙ wiring (settings modal); ReportView only needs
  // a hook to jump there from the gate prompt, not the modal state itself.
  onOpenSettings?: () => void
}

// Mirrors the gate check the Go backend performs before POST /api/report:
// no api_key on the active provider means the request would 400 anyway, so
// the UI short-circuits to a guidance card instead of round-tripping first.
function isProviderReady(cfg: ChatConfig | null): boolean {
  if (!cfg) return false
  const active = cfg.active_provider
  const pcfg = cfg.providers?.[active]
  return !!(pcfg?.api_key && pcfg.api_key !== '')
}

export function ReportView({ workspace, workspaces, onOpenSettings }: Props) {
  const [configLoading, setConfigLoading] = useState(true)
  const [providerReady, setProviderReady] = useState(false)

  const [type, setType] = useState<ReportType>('weekly')
  const [start, setStart] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 7)
    return d.toISOString().slice(0, 10)
  })
  const [end, setEnd] = useState(() => new Date().toISOString().slice(0, 10))
  const [reportWorkspace, setReportWorkspace] = useState<string>(workspace ?? '')

  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState<ReportResponse | null>(null)
  const [error, setError] = useState('')

  const [history, setHistory] = useState<ReportMeta[]>([])

  useEffect(() => {
    setConfigLoading(true)
    fetchChatConfig()
      .then((cfg) => setProviderReady(isProviderReady(cfg)))
      .catch(() => setProviderReady(false))
      .finally(() => setConfigLoading(false))
  }, [])

  function reloadHistory() {
    listReports()
      .then(setHistory)
      .catch(() => setHistory([]))
  }

  useEffect(() => {
    reloadHistory()
  }, [])

  async function handleGenerate() {
    setError('')
    setGenerating(true)
    setResult(null)
    try {
      const resp = await generateReport({
        type,
        start,
        end,
        ...(reportWorkspace ? { workspace: reportWorkspace } : {}),
      })
      setResult(resp)
      reloadHistory()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setGenerating(false)
    }
  }

  function handleHistoryClick(item: ReportMeta) {
    setError('')
    getReport(item.name)
      .then(setResult)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }

  function handleDownload() {
    if (!result) return
    const ext = result.format === 'html' ? 'html' : 'md'
    const mime = result.format === 'html' ? 'text/html' : 'text/markdown'
    const blob = new Blob([result.body], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${type}-report-${end}.${ext}`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (configLoading) {
    return <div className="p-4 text-sm text-[#6e6e73]">加载中…</div>
  }

  if (!providerReady) {
    return (
      <div
        data-testid="report-gate"
        className="flex flex-col items-center justify-center gap-3 text-center rounded-2xl border border-dashed border-[#e8e8ed] bg-white py-24 px-6 shadow-[0_6px_24px_rgba(30,32,60,0.08)]"
      >
        <span className="text-4xl text-[#a1a1a6]" aria-hidden="true">
          📊
        </span>
        <p className="text-sm font-medium text-[#1d1d1f]">请先在 ⚙ 设置中配置 LLM provider</p>
        <p className="text-xs text-[#6e6e73]">生成报告需要一个已配置 API Key 的 provider</p>
        {onOpenSettings && (
          <button
            type="button"
            onClick={onOpenSettings}
            className="mt-1 text-sm font-medium px-3 py-1.5 rounded-lg bg-[#0063f8] text-white shadow-[0_6px_14px_rgba(0,99,248,0.35)]"
          >
            去设置
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 h-full min-h-0">
      <div
        data-testid="report-params"
        className="rounded-2xl bg-white shadow-[0_6px_24px_rgba(30,32,60,0.08),0_1px_2px_rgba(0,0,0,0.04)] p-4 flex flex-col gap-3 shrink-0"
      >
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-sm">
            <input
              data-testid="report-type-weekly"
              type="radio"
              name="report-type"
              checked={type === 'weekly'}
              onChange={() => setType('weekly')}
            />
            周报
          </label>
          <label className="flex items-center gap-1.5 text-sm">
            <input
              data-testid="report-type-monthly"
              type="radio"
              name="report-type"
              checked={type === 'monthly'}
              onChange={() => setType('monthly')}
            />
            月报
          </label>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="flex items-center gap-1.5 text-xs text-[#6e6e73]">
            起始
            <input
              data-testid="report-start"
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="border border-[#e8e8ed] rounded-md p-1.5 text-sm"
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-[#6e6e73]">
            截止
            <input
              data-testid="report-end"
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="border border-[#e8e8ed] rounded-md p-1.5 text-sm"
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-[#6e6e73]">
            Workspace
            <select
              data-testid="report-workspace"
              value={reportWorkspace}
              onChange={(e) => setReportWorkspace(e.target.value)}
              className="border border-[#e8e8ed] rounded-md p-1.5 text-sm"
            >
              <option value="">全部</option>
              {workspaces.map((w) => (
                <option key={w.alias} value={w.alias}>
                  {w.alias}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            data-testid="report-generate"
            disabled={generating}
            onClick={handleGenerate}
            className="text-sm font-medium px-3 py-1.5 rounded-lg bg-[#0063f8] text-white shadow-[0_6px_14px_rgba(0,99,248,0.35)] disabled:opacity-50"
          >
            生成
          </button>
        </div>
        {generating && (
          <div data-testid="report-progress" className="text-xs text-[#6e6e73]">
            正在汇总变更… 合成中…
          </div>
        )}
        {error && (
          <div data-testid="report-error" className="text-xs text-[#dc2626]">
            {error}
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 flex gap-4">
        <div className="flex-1 min-h-0">
          {result ? (
            <div className="h-full min-h-0 flex flex-col gap-2">
              <div className="flex justify-end shrink-0">
                <button
                  type="button"
                  data-testid="report-download"
                  onClick={handleDownload}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg border border-[#e8e8ed] text-[#0063f8] hover:bg-[#f0f5ff]"
                >
                  ⬇ 下载
                </button>
              </div>
              <div className="flex-1 min-h-0">
                {result.format === 'html' ? (
                  <iframe data-testid="report-result-frame" srcDoc={result.body} className="w-full h-full rounded-2xl border border-[#e8e8ed] bg-white" />
                ) : (
                  <MarkdownViewer path={null} body={result.body} onClose={() => setResult(null)} />
                )}
              </div>
            </div>
          ) : (
            <div
              data-testid="report-empty-state"
              className="h-full flex flex-col items-center justify-center gap-2 text-center rounded-2xl border border-dashed border-[#e8e8ed] bg-white py-24 px-6"
            >
              <p className="text-sm text-[#6e6e73]">选择参数后点击「生成」，或从右侧历史记录中选择</p>
            </div>
          )}
        </div>

        <aside
          data-testid="report-history"
          className="w-56 shrink-0 rounded-2xl bg-white shadow-[0_6px_24px_rgba(30,32,60,0.08),0_1px_2px_rgba(0,0,0,0.04)] p-3 overflow-y-auto"
        >
          <div className="text-xs font-semibold text-[#6e6e73] mb-2">历史记录</div>
          {history.length === 0 ? (
            <div className="text-xs text-[#a1a1a6]">暂无记录</div>
          ) : (
            <ul className="space-y-1">
              {history.map((item) => (
                <li key={item.name}>
                  <button
                    type="button"
                    data-testid="report-history-item"
                    onClick={() => handleHistoryClick(item)}
                    className="w-full text-left text-xs text-[#1d1d1f] hover:text-[#0063f8] hover:bg-[#f0f5ff] rounded px-2 py-1.5 truncate"
                    title={item.name}
                  >
                    {item.type === 'weekly' ? '周报' : '月报'} {item.start} ~ {item.end}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  )
}
