import { useEffect, useState } from 'react'
import { fetchChatConfig, updateChatConfig, fetchChatProviders } from '../api/client'
import type { ChatProviderInfo } from '../api/types'

// 独立的 provider 设置面板：原先内嵌在 ChatBubble 里，现抽出为独立组件，
// 由 SideRail 的 ⚙️ 入口打开（App.tsx 以 modal 形式渲染）。挂载即拉取
// provider 列表与当前配置，保存后调用 onClose 关闭 modal。
export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [providers, setProviders] = useState<ChatProviderInfo[]>([])
  const [providerName, setProviderName] = useState('')
  const [model, setModel] = useState('')
  const [apiKeyPlaceholder, setApiKeyPlaceholder] = useState('')
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [temperature, setTemperature] = useState(0)
  const [maxTokens, setMaxTokens] = useState(0)
  const [thinking, setThinking] = useState('auto')
  const [apiBase, setApiBase] = useState('')

  // 挂载时并发拉取可用 provider 列表与当前生效配置，用当前 active_provider
  // 对应的配置回填表单；provider 列表请求失败也不阻塞配置请求的结果展示
  // （各自独立捕获错误）。
  useEffect(() => {
    setError('')
    setLoading(true)
    Promise.all([fetchChatProviders(), fetchChatConfig()])
      .then(([providersResp, config]) => {
        setProviders(providersResp.providers ?? [])
        const active = config.active_provider || providersResp.active
        const activeConfig = config.providers?.[active]
        setProviderName(active)
        setApiKeyPlaceholder(activeConfig?.api_key ?? '')
        setApiBase(activeConfig?.api_base ?? '')
        setApiKeyInput('')
        setTemperature(activeConfig?.temperature ?? 0.7)
        setMaxTokens(activeConfig?.max_tokens ?? 4096)
        setThinking(activeConfig?.thinking || 'auto')
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => setLoading(false))
  }, [])

  function handleProviderChange(name: string) {
    setProviderName(name)
    const info = providers.find((p) => p.name === name)
    setModel(info?.models?.[0] ?? '')
    // 切换 provider 后原有的已配置 key 提示不再适用；密码框留空，
    // 保存时若用户没填新 key 就不下发 api_key，交给后端保留原值。
    setApiKeyPlaceholder('')
    setApiKeyInput('')
  }

  async function handleSaveSettings() {
    setError('')
    try {
      const patch: Parameters<typeof updateChatConfig>[0] = {
        active_provider: providerName,
        providers: {
          [providerName]: {
            api_base: apiBase,
            model,
            temperature,
            max_tokens: maxTokens,
            thinking,
            // 留空/未改动则不下发 api_key，PUT 端点按合并语义保留原值。
            ...(apiKeyInput.trim() ? { api_key: apiKeyInput.trim() } : {}),
          },
        },
      }
      await updateChatConfig(patch)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div data-testid="chat-settings-panel" className="p-3 text-sm space-y-3">
      {loading ? (
        <div className="text-[#6e6e73]">加载中…</div>
      ) : (
        <>
          <label className="block">
            <span className="block text-xs font-medium text-[#6e6e73] mb-1">Provider</span>
            <select
              data-testid="chat-settings-provider"
              value={providerName}
              onChange={(e) => handleProviderChange(e.target.value)}
              className="w-full border border-[#e8e8ed] rounded-md p-1.5 text-sm"
            >
              {providers.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-[#6e6e73] mb-1">Model</span>
            <select
              data-testid="chat-settings-model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full border border-[#e8e8ed] rounded-md p-1.5 text-sm"
            >
              {(providers.find((p) => p.name === providerName)?.models ?? []).map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-[#6e6e73] mb-1">API Base</span>
            <input
              data-testid="chat-settings-api-base"
              type="text"
              value={apiBase}
              onChange={(e) => setApiBase(e.target.value)}
              placeholder="https://api.minimaxi.com"
              className="w-full border border-[#e8e8ed] rounded-md p-1.5 text-sm font-mono"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-[#6e6e73] mb-1">API Key</span>
            <input
              data-testid="chat-settings-api-key"
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder={apiKeyPlaceholder || '未配置'}
              className="w-full border border-[#e8e8ed] rounded-md p-1.5 text-sm"
            />
          </label>
          <div className="flex gap-2">
            <label className="block flex-1">
              <span className="block text-xs font-medium text-[#6e6e73] mb-1">Temperature</span>
              <input
                data-testid="chat-settings-temperature"
                type="number"
                step="0.1"
                min="0"
                max="2"
                value={temperature}
                onChange={(e) => setTemperature(Number(e.target.value))}
                className="w-full border border-[#e8e8ed] rounded-md p-1.5 text-sm"
              />
            </label>
            <label className="block flex-1">
              <span className="block text-xs font-medium text-[#6e6e73] mb-1">Max Tokens</span>
              <input
                data-testid="chat-settings-max-tokens"
                type="number"
                min="1"
                value={maxTokens}
                onChange={(e) => setMaxTokens(Number(e.target.value))}
                className="w-full border border-[#e8e8ed] rounded-md p-1.5 text-sm"
              />
            </label>
          </div>
          <label className="block">
            <span className="block text-xs font-medium text-[#6e6e73] mb-1">Thinking</span>
            <select
              data-testid="chat-settings-thinking"
              value={thinking}
              onChange={(e) => setThinking(e.target.value)}
              className="w-full border border-[#e8e8ed] rounded-md p-1.5 text-sm"
            >
              <option value="auto">auto</option>
              <option value="disabled">disabled</option>
            </select>
          </label>
          {error && (
            <div data-testid="chat-settings-error" className="text-red-600 text-xs">
              {error}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              data-testid="chat-settings-cancel"
              onClick={onClose}
              className="text-sm text-[#6e6e73] px-3 py-1.5 rounded-md hover:bg-[#f5f5f7]"
            >
              取消
            </button>
            <button
              type="button"
              data-testid="chat-settings-save"
              onClick={handleSaveSettings}
              className="bg-[#0063f8] text-white rounded-md px-3 py-1.5 text-sm"
            >
              保存
            </button>
          </div>
        </>
      )}
    </div>
  )
}
