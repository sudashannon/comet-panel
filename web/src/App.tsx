import { useEffect, useState } from 'react'
import { fetchChanges } from './api/client'
import type { ChangeSummary } from './api/types'
import { KpiCards } from './components/KpiCards'
import { ChangeExplorer } from './components/ChangeExplorer'
import { ChangeDetail } from './components/ChangeDetail'
import { ChatBubble } from './components/ChatBubble'

export default function App() {
  const [changes, setChanges] = useState<ChangeSummary[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    fetchChanges().then(setChanges).catch(() => setChanges([]))
  }, [])

  const selectedChange = changes.find((c) => c.name === selected) ?? null

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

      <div className="flex">
        <aside
          data-testid="sidebar"
          className={
            (sidebarOpen ? 'block' : 'hidden') +
            ' xl:block w-full xl:w-[280px] border-r border-[#e8e8ed] p-3'
          }
        >
          <ChangeExplorer changes={changes} selected={selected} onSelect={setSelected} />
        </aside>

        <main className="flex-1 p-4 space-y-4">
          <KpiCards changes={changes} stuckThresholdDays={14} />
          {selectedChange && <ChangeDetail change={selectedChange} />}
        </main>
      </div>

      {selectedChange && <ChatBubble changeName={selectedChange.name} />}
    </div>
  )
}
