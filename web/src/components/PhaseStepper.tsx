const PHASES = [
  { key: 'open', label: '启动' },
  { key: 'design', label: '设计' },
  { key: 'build', label: '构建' },
  { key: 'verify', label: '验证' },
  { key: 'archive', label: '归档' },
] as const

type StepState = 'done' | 'current' | 'pending' | 'unknown'

function stateFor(index: number, currentIndex: number): StepState {
  if (currentIndex === -1) return 'unknown'
  if (index < currentIndex) return 'done'
  if (index === currentIndex) return 'current'
  return 'pending'
}

export function PhaseStepper({ currentPhase }: { currentPhase: string }) {
  const currentIndex = PHASES.findIndex((p) => p.key === currentPhase)
  const isUnknown = currentIndex === -1

  return (
    <div>
      {isUnknown && (
        <div
          data-testid="phase-unknown-notice"
          className="text-[11px] text-[#c47a06] font-semibold mb-2"
        >
          ⚠ 阶段信息缺失
        </div>
      )}
      <div className="flex items-center flex-col md:flex-row gap-2 md:gap-0">
        {PHASES.map((p, i) => {
          const state = stateFor(i, currentIndex)
          return (
            <div key={p.key} className="flex items-center w-full md:w-auto md:flex-1">
              <div className="flex flex-col items-center flex-1">
                <div
                  data-testid={`step-${p.key}`}
                  data-state={state}
                  className={
                    'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ' +
                    (state === 'done'
                      ? 'bg-[#0063f8] text-white'
                      : state === 'current'
                        ? 'bg-white border-2 border-[#0063f8] text-[#0063f8]'
                        : state === 'unknown'
                          ? 'bg-white border-2 border-[#c47a06] text-[#c47a06]'
                          : 'bg-white border-2 border-[#d2d2d7] text-[#6e6e73]')
                  }
                >
                  {state === 'done' ? '✓' : state === 'unknown' ? '?' : i + 1}
                </div>
                <div
                  className={
                    'text-[10px] mt-1 ' +
                    (state === 'pending'
                      ? 'text-[#6e6e73]'
                      : state === 'unknown'
                        ? 'text-[#c47a06] font-semibold'
                        : 'text-[#0063f8] font-semibold')
                  }
                >
                  {p.label}
                </div>
              </div>
              {i < PHASES.length - 1 && (
                <div
                  className={
                    'hidden md:block flex-1 h-[2px] ' +
                    (i < currentIndex ? 'bg-[#0063f8]' : 'bg-[#d2d2d7]')
                  }
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
