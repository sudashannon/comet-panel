export function TaskDonut({ completed, total }: { completed: number; total: number }) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0
  const color = pct >= 100 ? '#16a34a' : '#0063f8'

  return (
    <div className="flex flex-col items-center justify-center">
      <div
        data-testid="donut-ring"
        className="w-[120px] h-[120px] rounded-full flex items-center justify-center"
        style={{ background: `conic-gradient(${color} 0% ${pct}%, #e8e8ed ${pct}% 100%)` }}
      >
        <div className="w-[88px] h-[88px] rounded-full bg-white flex items-center justify-center">
          <div data-testid="donut-percent" className="text-2xl font-bold">
            {pct}%
          </div>
        </div>
      </div>
      <div data-testid="donut-fraction" className="text-[10px] text-[#6e6e73] mt-2">
        {completed}/{total} 任务完成
      </div>
    </div>
  )
}
