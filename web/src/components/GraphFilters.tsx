import { COMMUNITY_COLORS } from './WikiGraph'

interface GraphFiltersProps {
  workspaces: string[]
  activeWorkspaces: Set<string>
  onToggleWorkspace: (ws: string) => void
  communityLabels: Record<string, string>
  activeCommunity: number | null
  onSelectCommunity: (id: number | null) => void
}

// Shared filter toolbar for the two wiki graph views (WikiGraph, WikiTimeline):
// a row of workspace chips (multi-select toggle) and a community legend row
// where clicking a dot filters down to that single community, clicking it
// again clears the filter. Purely presentational -- all filter state lives
// in the parent component's local useState.
export function GraphFilters({
  workspaces,
  activeWorkspaces,
  onToggleWorkspace,
  communityLabels,
  activeCommunity,
  onSelectCommunity,
}: GraphFiltersProps) {
  const communityIds = Object.keys(communityLabels)
    .map(Number)
    .sort((a, b) => a - b)

  return (
    <div data-testid="graph-filters" className="flex flex-wrap items-center gap-3 border-b border-[#e8e8ed] px-2 py-1.5">
      {(activeCommunity !== null || activeWorkspaces.size < workspaces.length) && (
        <button
          type="button"
          data-testid="filter-reset"
          onClick={() => {
            onSelectCommunity(null)
            workspaces.forEach((ws) => { if (!activeWorkspaces.has(ws)) onToggleWorkspace(ws) })
          }}
          className="rounded-full border border-[#dc2626] bg-[#fef2f2] px-2 py-0.5 text-[11px] text-[#dc2626]"
        >
          ✕ 重置筛选
        </button>
      )}
      {workspaces.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[10px] font-medium text-[#6e6e73]">工作区</span>
          {workspaces.map((ws) => {
            const active = activeWorkspaces.has(ws)
            return (
              <button
                key={ws}
                type="button"
                data-testid="workspace-chip"
                aria-pressed={active}
                onClick={() => onToggleWorkspace(ws)}
                className={
                  active
                    ? 'rounded-full border border-[#0063f8] bg-[#0063f8]/10 px-2 py-0.5 text-[11px] text-[#0063f8]'
                    : 'rounded-full border border-[#e8e8ed] bg-white px-2 py-0.5 text-[11px] text-[#8e8e93]'
                }
              >
                {ws}
              </button>
            )
          })}
        </div>
      )}
      {communityIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[10px] font-medium text-[#6e6e73]">社区</span>
          {communityIds.map((id) => {
            const active = activeCommunity === id
            return (
              <button
                key={id}
                type="button"
                data-testid="community-chip"
                aria-pressed={active}
                onClick={() => onSelectCommunity(active ? null : id)}
                className={
                  active
                    ? 'flex items-center gap-1 rounded-full border border-[#1d1d1f] bg-[#1d1d1f]/5 px-2 py-0.5 text-[11px] text-[#1d1d1f]'
                    : 'flex items-center gap-1 rounded-full border border-[#e8e8ed] bg-white px-2 py-0.5 text-[11px] text-[#6e6e73]'
                }
              >
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: COMMUNITY_COLORS[id % COMMUNITY_COLORS.length] }}
                />
                {communityLabels[String(id)]}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
