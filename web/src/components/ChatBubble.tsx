import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { streamChat, fetchChatSession, type ChatSessionMessage } from '../api/client'

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

export function ChatBubble({ changeName }: { changeName: string }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
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

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight
    }
  }, [messages])

  async function handleSend() {
    const text = input.trim()
    if (!text || sending) return
    userActedRef.current = true

    // Context files: no file-picker UI yet, so every send passes an empty
    // list. The mechanism (parameter threaded through to streamChat) is what
    // the spec requires here; a future task can wire an actual @-mention picker.
    const contextFiles: string[] = []

    setMessages((prev) => [...prev, { role: 'user', text }])
    setInput('')
    setSending(true)

    // Placeholder assistant message accumulates thinking/delta events in place.
    setMessages((prev) => [...prev, { role: 'assistant', text: '', thinking: '' }])

    try {
      await streamChat(changeName, text, contextFiles, (event) => {
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
          className="fixed bottom-20 right-4 w-96 h-[500px] bg-white rounded-lg shadow-2xl border border-[#e8e8ed] flex flex-col"
        >
          <div className="flex items-center justify-between p-3 border-b border-[#e8e8ed]">
            <span className="text-sm font-semibold">Chat · {changeName}</span>
            <button data-testid="chat-overlay-close" onClick={() => setOpen(false)}>
              ✕
            </button>
          </div>
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
        </div>
      )}
    </>
  )
}
