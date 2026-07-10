import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import {
  streamChat,
  fetchChatSession,
  fetchChangeDetail,
  fetchChatConfig,
  updateChatConfig,
  fetchChatProviders,
  type ChatSessionMessage,
} from '../api/client'
import type { ChatProviderInfo } from '../api/types'

interface ChatMessage {
  role: 'user' | 'assistant' | 'error'
  text: string
  thinking?: string
}

// Backend content blocks separate `text` and `thinking` blocks (see
// provider.ContentBlock); the component's ChatMessage flattens each kind
// into its own field, matching how handleSend already accumulates streamed
// deltas/thinking onto a single message.
function toChatMessage(msg: ChatSessionMessage): ChatMessage {
  const role = msg.role === 'user' ? 'user' : 'assistant'
  let text = ''
  let thinking = ''
  for (const block of msg.content ?? []) {
    if (block.type === 'thinking') thinking += block.thinking ?? ''
    else text += block.text ?? ''
  }
  return thinking ? { role, text, thinking } : { role, text }
}

export function ChatBubble({ changeName, workspace }: { changeName: string; workspace?: string }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [contextFiles, setContextFiles] = useState<string[]>([])
  const [selectedFiles, setSelectedFiles] = useState<string[]>([])
  const [contextPanelOpen, setContextPanelOpen] = useState(true)
  // 配置面板：懒加载 provider 列表与当前配置，仅在用户点击 ⚙ 时才请求，
  // 避免每次打开聊天窗口都多打两个后端请求。
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [settingsError, setSettingsError] = useState('')
  const [settingsSaved, setSettingsSaved] = useState(false)
  const [providers, setProviders] = useState<ChatProviderInfo[]>([])
  const [providerName, setProviderName] = useState('')
  const [model, setModel] = useState('')
  const [apiKeyPlaceholder, setApiKeyPlaceholder] = useState('')
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [temperature, setTemperature] = useState(0)
  const [maxTokens, setMaxTokens] = useState(0)
  const [thinking, setThinking] = useState('auto')
  const messagesRef = useRef<HTMLDivElement>(null)
  // Guards against the history load resolving AFTER the user has already
  // sent a message (e.g. slow /api/chat/session, fast first keystroke):
  // without this, the late resolve would stomp the just-sent message with
  // the (now stale) persisted history.
  const userActedRef = useRef(false)

  // 会话按变更隔离：挂载时加载该变更持久化的历史消息，还原之前的对话；
  // App.tsx 给 ChatBubble 加了 key={changeName}，切换变更会整体重新挂载
  // 本组件（内存 state 清空），随后这里再从后端拉回该变更自己的历史。
  useEffect(() => {
    let cancelled = false
    fetchChatSession(changeName)
      .then((session) => {
        if (cancelled || userActedRef.current) return
        setMessages((session.messages ?? []).map(toChatMessage))
      })
      .catch(() => {
        // 加载历史失败不阻塞聊天：静默保持空会话，用户仍可正常发送新消息。
      })
    return () => {
      cancelled = true
    }
  }, [changeName])

  // 上下文文件注入：挂载时拉取该变更的产物清单，把已存在的产物文件路径
  // 作为可勾选的上下文文件展示；用户勾选后发送时会连同消息一起传给后端。
  useEffect(() => {
    let cancelled = false
    fetchChangeDetail(changeName, workspace)
      .then((detail) => {
        if (cancelled) return
        const paths = (detail.phases ?? [])
          .flatMap((phase) => phase.artifacts ?? [])
          .filter((artifact) => artifact.exists)
          .map((artifact) => artifact.path || artifact.file)
        setContextFiles(paths)
      })
      .catch(() => {
        // 产物清单加载失败不阻塞聊天：静默保持空的上下文文件选择器。
      })
    return () => {
      cancelled = true
    }
  }, [changeName, workspace])

  function toggleContextFile(path: string) {
    setSelectedFiles((prev) => (prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path]))
  }

  // 配置面板懒加载：打开时并发拉取可用 provider 列表与当前生效配置，
  // 用当前 active_provider 对应的配置回填表单；provider 列表请求失败也
  // 不阻塞配置请求的结果展示（各自独立捕获错误）。
  function openSettings() {
    setSettingsOpen(true)
    setSettingsSaved(false)
    setSettingsError('')
    setSettingsLoading(true)
    Promise.all([fetchChatProviders(), fetchChatConfig()])
      .then(([providersResp, config]) => {
        setProviders(providersResp.providers ?? [])
        const active = config.active_provider || providersResp.active
        const activeConfig = config.providers?.[active]
        setProviderName(active)
        setModel(activeConfig?.model ?? '')
        setApiKeyPlaceholder(activeConfig?.api_key ?? '')
        setApiKeyInput('')
        setTemperature(activeConfig?.temperature ?? 0.7)
        setMaxTokens(activeConfig?.max_tokens ?? 4096)
        setThinking(activeConfig?.thinking || 'auto')
      })
      .catch((err) => {
        setSettingsError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => setSettingsLoading(false))
  }

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
    setSettingsError('')
    try {
      const patch: Parameters<typeof updateChatConfig>[0] = {
        active_provider: providerName,
        providers: {
          [providerName]: {
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
      setSettingsSaved(true)
      setSettingsOpen(false)
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : String(err))
    }
  }

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight
    }
  }, [messages])

  async function handleSend() {
    const text = input.trim()
    if (!text || sending) return
    userActedRef.current = true

    // 上下文文件注入：把用户在选择器中勾选的产物路径作为 contextFiles 传给后端。
    const filesToSend = selectedFiles

    setMessages((prev) => [...prev, { role: 'user', text }])
    setInput('')
    setSending(true)

    // Placeholder assistant message accumulates thinking/delta events in place.
    setMessages((prev) => [...prev, { role: 'assistant', text: '', thinking: '' }])

    try {
      await streamChat(changeName, text, filesToSend, (event) => {
        setMessages((prev) => {
          const next = [...prev]
          const last = next[next.length - 1]
          if (last?.role !== 'assistant') return prev
          if (event.type === 'thinking') {
            next[next.length - 1] = { ...last, thinking: (last.thinking ?? '') + (event.content ?? '') }
          } else if (event.type === 'delta') {
            next[next.length - 1] = { ...last, text: last.text + (event.content ?? '') }
          }
          return next
        })
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setMessages((prev) => [...prev, { role: 'error', text: message }])
    } finally {
      setSending(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <>
      <button
        data-testid="chat-bubble-button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 w-10 h-10 rounded-full bg-[#0063f8] text-white shadow-lg flex items-center justify-center text-lg"
      >
        💬
      </button>
      {open && (
        <div
          data-testid="chat-overlay"
          className="fixed bottom-20 right-4 w-[440px] h-[min(80vh,720px)] bg-white rounded-lg shadow-2xl border border-[#e8e8ed] flex flex-col"
        >
          <div className="flex items-center justify-between p-3 border-b border-[#e8e8ed]">
            <span className="text-sm font-semibold">Chat · {changeName}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="chat-settings-toggle"
                onClick={() => (settingsOpen ? setSettingsOpen(false) : openSettings())}
                title="AI 配置"
                aria-label="AI 配置"
                className="text-[#6e6e73] hover:text-[#1d1d1f]"
              >
                ⚙
              </button>
              <button data-testid="chat-overlay-close" onClick={() => setOpen(false)}>
                ✕
              </button>
            </div>
          </div>
          {settingsOpen ? (
            <div data-testid="chat-settings-panel" className="flex-1 overflow-y-auto p-3 text-sm space-y-3">
              {settingsLoading ? (
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
                  {settingsError && (
                    <div data-testid="chat-settings-error" className="text-red-600 text-xs">
                      {settingsError}
                    </div>
                  )}
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      data-testid="chat-settings-cancel"
                      onClick={() => setSettingsOpen(false)}
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
          ) : (
            <>
              {settingsSaved && (
                <div data-testid="chat-settings-saved" className="px-3 py-1 text-xs text-green-700 bg-green-50 border-b border-[#e8e8ed]">
                  配置已保存
                </div>
              )}
          <div
            data-testid="chat-messages"
            ref={messagesRef}
            className="flex-1 overflow-y-auto p-3 text-sm space-y-2"
          >
            {messages.map((msg, i) => (
              <div
                key={i}
                data-testid={`chat-msg-${msg.role}`}
                className={
                  msg.role === 'user'
                    ? 'bg-[#0063f8] text-white rounded-lg px-3 py-2 ml-auto max-w-[85%] whitespace-pre-wrap'
                    : msg.role === 'error'
                      ? 'bg-red-50 text-red-700 border border-red-200 rounded-lg px-3 py-2 max-w-[85%]'
                      : 'bg-[#f5f5f7] text-[#1d1d1f] rounded-lg px-3 py-2 max-w-[85%]'
                }
              >
                {msg.role === 'assistant' ? (
                  <>
                    {msg.thinking && !msg.text && (
                      <div className="text-xs text-[#6e6e73] italic mb-1">💭 {msg.thinking}</div>
                    )}
                    <div className="prose prose-sm max-w-none [&_p]:my-1">
                      <ReactMarkdown>{msg.text}</ReactMarkdown>
                    </div>
                  </>
                ) : (
                  msg.text
                )}
              </div>
            ))}
          </div>
          {contextFiles.length > 0 && (
            <div className="border-t border-[#e8e8ed]">
              <button
                type="button"
                data-testid="context-panel-toggle"
                onClick={() => setContextPanelOpen((v) => !v)}
                className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-medium text-[#6e6e73] hover:text-[#1d1d1f]"
              >
                <span>
                  上下文文件
                  {selectedFiles.length > 0 ? ` (已选 ${selectedFiles.length}/${contextFiles.length})` : ` (${contextFiles.length})`}
                </span>
                <span className="text-[10px]">{contextPanelOpen ? '收起 ▲' : '展开 ▼'}</span>
              </button>
              {contextPanelOpen && (
                <div
                  data-testid="context-file-list"
                  className="flex flex-wrap gap-1.5 px-3 pb-2 max-h-20 overflow-y-auto"
                >
                  {contextFiles.map((path) => {
                    const selected = selectedFiles.includes(path)
                    return (
                      <button
                        key={path}
                        type="button"
                        data-testid={`context-file-chip-${path}`}
                        aria-pressed={selected}
                        onClick={() => toggleContextFile(path)}
                        title={path}
                        className={
                          selected
                            ? 'text-xs rounded-full px-2 py-0.5 bg-[#0063f8] text-white font-medium flex items-center gap-1'
                            : 'text-xs rounded-full px-2 py-0.5 bg-white text-[#6e6e73] border border-[#e8e8ed] hover:border-[#0063f8] hover:text-[#0063f8] flex items-center gap-1'
                        }
                      >
                        {selected && <span aria-hidden="true">✓</span>}
                        {path.split('/').pop()}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}
          <div className="p-3 border-t border-[#e8e8ed] flex gap-2">
            <textarea
              data-testid="chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="询问关于此变更的问题…"
              className="flex-1 resize-none border border-[#e8e8ed] rounded-md p-2 text-sm h-10"
            />
            <button
              data-testid="chat-send"
              onClick={handleSend}
              disabled={sending || !input.trim()}
              className="bg-[#0063f8] text-white rounded-md px-3 text-sm disabled:opacity-50"
            >
              发送
            </button>
          </div>
            </>
          )}
        </div>
      )}
    </>
  )
}
