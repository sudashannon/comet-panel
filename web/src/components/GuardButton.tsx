import { useState } from 'react'

const PHASE_LABELS: Record<string, string> = {
  open: '启动', design: '设计', build: '构建', verify: '验证', archive: '归档',
}

const EXIT_MARKER_RE = /__GUARD_EXIT__:(\d)(?::(.*))?/

interface Props {
  changeName: string
  targetPhase: string
  onComplete: () => void
}

export function GuardButton({ changeName, targetPhase, onComplete }: Props) {
  const [confirming, setConfirming] = useState(false)
  const [output, setOutput] = useState<string[]>([])
  const [running, setRunning] = useState(false)
  const [tone, setTone] = useState<'ok' | 'danger' | null>(null)

  async function execute() {
    setConfirming(false)
    setRunning(true)
    setOutput([])
    setTone(null)
    try {
      const res = await fetch(`/api/changes/${changeName}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetPhase }),
      })
      if (!res.ok || !res.body) {
        setOutput((o) => [...o, `错误: HTTP ${res.status}`])
        setTone('danger')
        return
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let sawSuccess = false
      let sawFailure = false
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value)
        const marker = chunk.match(EXIT_MARKER_RE)
        if (marker) {
          if (marker[1] === '0') sawSuccess = true
          else sawFailure = true
          continue // exit marker is protocol, not guard output — don't display it
        }
        setOutput((o) => [...o, chunk])
      }
      if (sawSuccess) {
        setTone('ok')
        onComplete()
        setOutput([]) // auto-clear on success — the change list refresh (via onComplete) is the confirmation
      } else if (sawFailure) {
        setTone('danger')
      }
    } catch (e) {
      setOutput((o) => [...o, `错误: ${(e as Error).message}`])
      setTone('danger')
    } finally {
      setRunning(false)
    }
  }

  return (
    <>
      <button data-testid="guard-trigger" onClick={() => setConfirming(true)} disabled={running}>
        → {PHASE_LABELS[targetPhase] ?? targetPhase}
      </button>

      {confirming && (
        <div data-testid="guard-confirm-dialog" className="fixed inset-0 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-lg p-4 w-96">
            <p className="text-sm mb-3">
              即将执行: <code>comet-guard {changeName} {targetPhase} --apply</code>
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirming(false)}>取消</button>
              <button data-testid="guard-confirm-yes" onClick={execute}>确认</button>
            </div>
          </div>
        </div>
      )}

      {/* On success, output is cleared immediately after onComplete fires (see
          setOutput([]) above), so this panel naturally does not render —
          satisfying the "成功自动关闭" requirement without a separate timer. */}
      {output.length > 0 && (
        <pre
          data-testid="guard-output"
          data-tone={tone}
          className={
            'text-xs p-2 rounded mt-2 max-h-40 overflow-y-auto ' +
            (tone === 'danger' ? 'bg-[#fdeeee] text-[#dc2626]' : 'bg-[#1d1d1f] text-[#d8dee9]')
          }
        >
          {output.join('')}
        </pre>
      )}
    </>
  )
}
