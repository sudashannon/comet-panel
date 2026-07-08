import { useState } from 'react'

export function ChatBubble({ changeName }: { changeName: string }) {
  const [open, setOpen] = useState(false)

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
          <div className="flex-1 overflow-y-auto p-3 text-sm text-[#6e6e73]">
            {/* existing chat/handler.go SSE wiring migrates here in a follow-up
                task once the /api/chat/* contract is confirmed unchanged */}
          </div>
        </div>
      )}
    </>
  )
}
