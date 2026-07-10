import { useState } from 'react'
import type { WorkspaceConfig } from '../api/types'

interface Props {
  workspaces: WorkspaceConfig[]
  active: string | null
  onSelect: (alias: string | null) => void
  onAdd: (cfg: WorkspaceConfig) => Promise<void>
}

export function WorkspaceChips({ workspaces, active, onSelect, onAdd }: Props) {
  const [adding, setAdding] = useState(false)
  const [alias, setAlias] = useState('')
  const [path, setPath] = useState('')

  const canSubmit = alias.trim() !== '' && path.trim() !== ''

  async function submit() {
    if (!canSubmit) return
    await onAdd({ alias, path, color: '#0063f8' })
    setAdding(false)
    setAlias('')
    setPath('')
  }

  function cancel() {
    setAdding(false)
    setAlias('')
    setPath('')
  }

  return (
    <div className="relative flex items-center gap-2 flex-wrap">
      <button
        onClick={() => onSelect(null)}
        className={
          'px-3 py-1 rounded-full text-xs ' +
          (active === null ? 'bg-[#0063f8] text-white' : 'bg-[#f5f5f7] text-[#6e6e73]')
        }
      >
        全部
      </button>
      {workspaces.map((w) => (
        <button
          key={w.alias}
          onClick={() => onSelect(w.alias)}
          className={
            'px-3 py-1 rounded-full text-xs ' +
            (active === w.alias ? 'bg-[#0063f8] text-white' : 'bg-[#f5f5f7] text-[#6e6e73]')
          }
        >
          {w.alias}
        </button>
      ))}
      <button onClick={() => setAdding(true)} className="px-3 py-1 rounded-full text-xs border border-dashed border-[#d2d2d7]">
        + 添加
      </button>
      {adding && (
        <div className="absolute top-full left-0 mt-2 z-10 w-64 rounded-lg border border-[#e8e8ed] bg-white p-3 shadow-lg flex flex-col gap-2">
          <input
            data-testid="add-ws-alias"
            placeholder="alias"
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            className="w-full border border-[#e8e8ed] rounded px-2 py-1.5 text-sm"
          />
          <input
            data-testid="add-ws-path"
            placeholder="path"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            className="w-full border border-[#e8e8ed] rounded px-2 py-1.5 text-sm"
          />
          <div className="flex items-center justify-end gap-2 pt-1">
            <button onClick={cancel} className="px-2 py-1 text-xs text-[#6e6e73]">
              取消
            </button>
            <button
              data-testid="add-ws-submit"
              onClick={submit}
              disabled={!canSubmit}
              className={
                'px-3 py-1 rounded text-xs text-white ' +
                (canSubmit ? 'bg-[#0063f8]' : 'bg-[#0063f8]/40 cursor-not-allowed')
              }
            >
              提交
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
