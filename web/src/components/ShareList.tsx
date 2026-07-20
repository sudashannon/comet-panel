import { useEffect, useState } from 'react'
import { revokeShareLink } from '../api/client'

interface ShareEntry {
  token: string
  path: string
  workspace: string
  expires_at: string
  created_at: string
  url: string
}

export function ShareList() {
  const [shares, setShares] = useState<ShareEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState<string | null>(null)

  const fetchShares = () => {
    fetch('/api/share/list')
      .then((r) => r.json())
      .then((data) => setShares(Array.isArray(data) ? data : []))
      .catch(() => setShares([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchShares() }, [])

  const handleCopy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      const el = document.createElement('textarea')
      el.value = url
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    }
    setCopied(url)
    setTimeout(() => setCopied(null), 2000)
  }

  const handleRevoke = async (token: string) => {
    try {
      await revokeShareLink(token)
      setShares((prev) => prev.filter((s) => s.token !== token))
    } catch {
      // ignore
    }
  }

  const formatExpiry = (expiresAt: string) => {
    if (!expiresAt || expiresAt === '0001-01-01T00:00:00Z') return '永不过期'
    const d = new Date(expiresAt)
    const now = Date.now()
    const diff = d.getTime() - now
    if (diff <= 0) return '已过期'
    const hours = Math.floor(diff / 3600000)
    if (hours < 1) return `${Math.floor(diff / 60000)} 分钟后过期`
    if (hours < 24) return `${hours} 小时后过期`
    return `${Math.floor(hours / 24)} 天后过期`
  }

  const filename = (path: string) => path.split('/').pop() || path

  if (loading) return <div className="text-[#6e6e73] text-sm p-4">加载中…</div>

  return (
    <div className="p-4" data-testid="share-list">
      <h2 className="text-xs font-semibold text-[#6e6e73] uppercase tracking-wider mb-3">已分享文档</h2>
      {shares.length === 0 ? (
        <p className="text-sm text-[#8e8e93]">暂无分享。在 Markdown 查看器中点击 🔗 创建分享。</p>
      ) : (
        <div className="space-y-2">
          {shares.map((s) => (
            <div key={s.token} className="bg-white border border-[#e8e8ed] rounded-lg p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-[#1d1d1f] truncate" title={s.path}>
                    {filename(s.path)}
                  </div>
                  <div className="text-xs text-[#8e8e93] mt-0.5">
                    <span className="text-[#0063f8]">{s.workspace || '(无 workspace)'}</span>
                    <span className="mx-1.5">·</span>
                    <span className={s.expires_at ? '' : 'text-[#10b981]'}>
                      {formatExpiry(s.expires_at)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleCopy(s.url)}
                    className="text-xs px-2 py-1 rounded border border-[#e8e8ed] hover:bg-[#f0f5ff] hover:border-[#0063f8]"
                    title="复制链接"
                  >
                    {copied === s.url ? '✓' : '复制'}
                  </button>
                  <button
                    onClick={() => handleRevoke(s.token)}
                    className="text-xs px-2 py-1 rounded border border-[#e8e8ed] text-[#dc2626] hover:bg-[#fdeeee] hover:border-[#dc2626]"
                    title="撤销分享"
                  >
                    撤销
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
