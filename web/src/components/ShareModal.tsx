import { useState, useCallback } from 'react'
import { createShareLink, revokeShareLink } from '../api/client'

interface ShareModalProps {
  path: string | null
  workspace?: string
  onClose: () => void
}

const TTL_OPTIONS: { label: string; value: number | 0 }[] = [
  { label: '1 小时', value: 3600 },
  { label: '24 小时', value: 86400 },
  { label: '7 天', value: 604800 },
  { label: '永不过期', value: 0 },
]

export function ShareModal({ path, workspace, onClose }: ShareModalProps) {
  const [ttl, setTtl] = useState<number>(3600)
  const [link, setLink] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editableUrl, setEditableUrl] = useState<string | null>(null)

  const handleCreate = useCallback(async () => {
    if (!path) return
    setLoading(true)
    setError(null)
    try {
      // createShareLink returns {url}, we extract token from the URL
      const resp = await createShareLink(path, workspace, ttl, window.location.origin)
      setLink(resp.url)
      setEditableUrl(resp.url)
      const parts = resp.url.split('/share/')
      if (parts.length === 2) setToken(parts[1])
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建失败')
    } finally {
      setLoading(false)
    }
  }, [path, workspace, ttl])

  const handleRevoke = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      await revokeShareLink(token)
      setLink(null)
      setToken(null)
      setEditableUrl(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '撤销失败')
    } finally {
      setLoading(false)
    }
  }, [token])

  const handleCopy = useCallback(async () => {
    const urlToCopy = editableUrl ?? link
    if (!urlToCopy) return
    try {
      await navigator.clipboard.writeText(urlToCopy)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback for non-HTTPS contexts
      const el = document.createElement('textarea')
      el.value = urlToCopy
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [link])

  return (
    <div
      className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6" data-testid="share-modal">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-[#1d1d1f]">分享文档</h2>
          <button
            onClick={onClose}
            className="text-[#8e8e93] hover:text-[#1d1d1f] text-lg leading-none"
            aria-label="关闭"
          >✕</button>
        </div>

        {!link ? (
          <>
            <label className="block text-xs text-[#6e6e73] mb-1">链接有效期</label>
            <div className="flex gap-2 mb-4">
              {TTL_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  data-testid={`share-ttl-${opt.value}`}
                  aria-pressed={ttl === opt.value}
                  onClick={() => setTtl(opt.value)}
                  className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                    ttl === opt.value
                      ? 'bg-[#0063f8] text-white border-[#0063f8]'
                      : 'bg-white text-[#1d1d1f] border-[#e8e8ed] hover:border-[#0063f8]'
                  }`}
                >{opt.label}</button>
              ))}
            </div>
            <button
              onClick={handleCreate}
              disabled={loading}
              data-testid="share-create-btn"
              className="w-full py-2 rounded-lg bg-[#0063f8] text-white text-sm font-semibold disabled:opacity-50 hover:bg-[#0052d4] transition-colors"
            >{loading ? '创建中…' : '生成分享链接'}</button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-4">
              <input
                type="text"
                value={editableUrl ?? link}
                onChange={(e) => setEditableUrl(e.target.value)}
                data-testid="share-link-input"
                className="flex-1 text-xs bg-[#f5f5f7] rounded-lg px-3 py-2 border border-[#e8e8ed] text-[#1d1d1f] overflow-hidden text-ellipsis"
              />
              <button
                onClick={handleCopy}
                data-testid="share-copy-btn"
                className={`shrink-0 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                  copied ? 'bg-[#10b981] text-white' : 'bg-[#0063f8] text-white hover:bg-[#0052d4]'
                }`}
              >{copied ? '已复制' : '复制'}</button>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                disabled={loading}
                className="flex-1 py-2 rounded-lg border border-[#e8e8ed] text-[#1d1d1f] text-xs font-semibold hover:bg-[#f5f5f7] transition-colors"
              >重新生成</button>
              <button
                onClick={handleRevoke}
                disabled={loading}
                data-testid="share-revoke-btn"
                className="flex-1 py-2 rounded-lg border border-[#dc2626] text-[#dc2626] text-xs font-semibold hover:bg-[#fdeeee] transition-colors"
              >撤销分享</button>
            </div>
          </>
        )}
        {error && <p className="mt-3 text-xs text-[#dc2626]">{error}</p>}
      </div>
    </div>
  )
}
