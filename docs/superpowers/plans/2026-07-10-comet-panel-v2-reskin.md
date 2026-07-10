# comet-panel V2 视觉重塑（方向 A）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把参考图的设计语言（悬浮 icon 侧栏 + 渐变背景 + 图标 KPI 卡 + 柔和阴影）套到 comet-panel 现有信息架构上，纯视觉/布局 reskin。

**Architecture:** 外壳（`SideRail` 侧栏 + 渐变背景 + 内容区页头）作为全局 chrome，三视图（changes/graph/lint）共用；`App.tsx` 外层从 flex-col 改为 flex-row（rail 左栏 + 内容 1fr），顶部 `<nav>` 职责移入新组件 `SideRail`。其余为组件级 Tailwind 样式精修，不改数据流/API/交互语义。

**Tech Stack:** React 19 + Vite + TypeScript + Tailwind CSS；测试 Vitest + @testing-library/react。

## Global Constraints

- 纯视觉改动：不改任何 fetch / 状态 / 路由 / props 语义 / API。
- **保留所有现有 data-testid 与行为断言**：`view-switcher`、`sidebar`、`hamburger-toggle`、`change-empty-state`、`workspace-warning-banner`、`kpi-grid`、`kpi-active`、`kpi-archived`、`kpi-stuck`、`kpi-verify-failed`、`kpi-incomplete-tasks`、`data-filter-active`、`add-ws-*`、`step-<phase>` + `data-state`、`donut-ring`/`donut-percent`/`donut-fraction`、`phase-unknown-notice`，以及 ChangeExplorer/LintPanel/WorkspaceChips 现有 testid。
- 视图切换断言（`aria-pressed`）在 SideRail 上继续成立。
- rail 精确映射（A1）：🚀 变更列表(changes) / 🗺️ 图谱(graph) / ✓ Lint(lint) + 底部 ⚙️ 设置（disabled 占位）。
- 窄屏 rail 常显（~60px，仅 4 图标）；changes 视图窄屏单栏 + 现有 `sidebarOpen` 抽屉（hamburger 保留，移入内容区页头）。
- 设计令牌：背景渐变 `linear-gradient(135deg,#e9eeff 0%,#f2f4fb 38%,#fdfdff 100%)`；卡片 `rounded-2xl` + `shadow-[0_6px_20px_rgba(30,32,60,0.05),0_1px_2px_rgba(0,0,0,0.03)]`；主色 `#0063f8`；阶段色 open 灰/design 蓝/build 琥珀`#d97706`/verify 紫`#7c3aed`/archive 绿`#16a34a`。
- 每个改动组件跑其现有测试；全量 `cd web && npx vitest run` + `npx tsc --noEmit` 绿。`go test ./...` 不受影响（无后端改动），最终确认一次即可。
- 不 commit 由 lead 决定；本计划每个 Task 末尾的 commit 步骤在 subagent-driven 模式下由 lead 执行。

---

## File Structure

- `web/src/components/SideRail.tsx` **(新)** — 悬浮 icon 侧栏，视图切换 + 设置占位。单一职责：导航 chrome。
- `web/src/components/SideRail.test.tsx` **(新)** — SideRail 行为测试。
- `web/src/App.tsx` **(改)** — 外壳布局重排（flex-row + 渐变底 + rail 挂载 + 内容页头），删顶部 `<nav>`。
- `web/src/components/KpiCards.tsx` **(改)** — 图标 chip + 大数字 + 阴影。
- `web/src/components/WorkspaceChips.tsx` **(改)** — 药丸 chip + 卡片阴影。
- `web/src/components/ChangeExplorer.tsx` **(改)** — 行圆角高亮 + 进度条语义色 + 圆角徽章。
- `web/src/components/ChangeDetail.tsx` **(改)** — 详情卡圆角阴影 + 页头排版。
- `web/src/components/PhaseStepper.tsx` **(改)** — dot/连接线精修（current 加光晕）。
- `web/src/components/TaskDonut.tsx` **(改)** — 环尺寸/中心数字对齐视觉稿。

---

## Task 1: SideRail 组件 + App 外壳重排

**Files:**
- Create: `web/src/components/SideRail.tsx`
- Create: `web/src/components/SideRail.test.tsx`
- Modify: `web/src/App.tsx:91-124`（删顶部 nav，插入 rail + 内容页头，外层改 flex-row + 渐变）

**Interfaces:**
- Produces: `SideRail` 组件 —
  ```ts
  type View = 'changes' | 'graph' | 'lint'
  interface SideRailProps { view: View; onSelect: (v: View) => void }
  export function SideRail(props: SideRailProps): JSX.Element
  ```
  内部渲染一个 `<nav data-testid="view-switcher">`（testid 从旧顶部 nav 迁移至此，值不变），3 个视图按钮各带 `aria-pressed={view===key}`、`aria-label`，选中态蓝底白字；底部 ⚙️ 设置按钮 `disabled aria-disabled="true" title="即将推出"`。
- Consumes（App 侧）：App 现有 `view` state 与 `setView`（`web/src/App.tsx`，`useState<View>`）。

- [ ] **Step 1: 写 SideRail 失败测试**

`web/src/components/SideRail.test.tsx`：
```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { SideRail } from './SideRail'

describe('SideRail', () => {
  it('renders the three view icons inside view-switcher', () => {
    render(<SideRail view="changes" onSelect={() => {}} />)
    const nav = screen.getByTestId('view-switcher')
    expect(nav).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '变更列表' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '图谱' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lint' })).toBeInTheDocument()
  })

  it('marks the active view with aria-pressed', () => {
    render(<SideRail view="graph" onSelect={() => {}} />)
    expect(screen.getByRole('button', { name: '图谱' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '变更列表' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('calls onSelect with the view key when an icon is clicked', () => {
    const onSelect = vi.fn()
    render(<SideRail view="changes" onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button', { name: 'Lint' }))
    expect(onSelect).toHaveBeenCalledWith('lint')
  })

  it('renders a disabled settings placeholder', () => {
    render(<SideRail view="changes" onSelect={() => {}} />)
    const settings = screen.getByRole('button', { name: '设置' })
    expect(settings).toBeDisabled()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd web && npx vitest run src/components/SideRail.test.tsx`
Expected: FAIL — `Failed to resolve import './SideRail'`。

- [ ] **Step 3: 实现 SideRail**

`web/src/components/SideRail.tsx`：
```tsx
type View = 'changes' | 'graph' | 'lint'

interface SideRailProps {
  view: View
  onSelect: (v: View) => void
}

const ITEMS: { key: View; label: string; icon: string }[] = [
  { key: 'changes', label: '变更列表', icon: '🚀' },
  { key: 'graph', label: '图谱', icon: '🗺️' },
  { key: 'lint', label: 'Lint', icon: '✓' },
]

export function SideRail({ view, onSelect }: SideRailProps) {
  return (
    <nav
      data-testid="view-switcher"
      className="sticky top-5 h-[calc(100vh-40px)] w-[60px] shrink-0 ml-4 my-5 bg-white rounded-[22px] shadow-[0_6px_24px_rgba(30,32,60,0.08),0_1px_2px_rgba(0,0,0,0.04)] flex flex-col items-center py-3.5 gap-2.5"
    >
      {ITEMS.map((it) => {
        const on = view === it.key
        return (
          <button
            key={it.key}
            type="button"
            aria-label={it.label}
            aria-pressed={on}
            onClick={() => onSelect(it.key)}
            className={
              'w-[38px] h-[38px] rounded-xl grid place-items-center text-[17px] ' +
              (on
                ? 'bg-[#0063f8] text-white shadow-[0_6px_14px_rgba(0,99,248,0.35)]'
                : 'text-[#6e6e73] hover:bg-[#f0f5ff]')
            }
          >
            <span aria-hidden="true">{it.icon}</span>
          </button>
        )
      })}
      <div className="flex-1" />
      <button
        type="button"
        aria-label="设置"
        aria-disabled="true"
        disabled
        title="即将推出"
        className="w-[38px] h-[38px] rounded-xl grid place-items-center text-[17px] text-[#c7cad4] cursor-not-allowed"
      >
        <span aria-hidden="true">⚙️</span>
      </button>
    </nav>
  )
}
```

- [ ] **Step 4: 跑 SideRail 测试确认通过**

Run: `cd web && npx vitest run src/components/SideRail.test.tsx`
Expected: PASS (4 tests)。

- [ ] **Step 5: 重排 App 外壳**

`web/src/App.tsx`：先加导入（放在其它 component 导入旁）：
```tsx
import { SideRail } from './components/SideRail'
```

把 `return (` 后的外层结构从当前的
`<div className="h-screen flex flex-col bg-[#f5f5f7] overflow-hidden">` + 移动端 hamburger 行 + `<nav data-testid="view-switcher">…</nav>`
改为：外层 flex-row + 渐变背景，左侧挂 `<SideRail>`，右侧为内容列（内含移动端 hamburger 页头 + warning banner + 视图）。具体替换 `App.tsx:92-124`（外层 div 开标签、移动端 hamburger 块、整个顶部 nav 块）为：
```tsx
    <div className="h-screen flex bg-gradient-to-br from-[#e9eeff] via-[#f2f4fb] to-[#fdfdff] overflow-hidden">
      <SideRail view={view} onSelect={setView} />
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <div className="xl:hidden flex items-center p-3 shrink-0">
          <button
            data-testid="hamburger-toggle"
            onClick={() => setSidebarOpen((v) => !v)}
            className="text-sm"
          >
            ☰ 工作区
          </button>
        </div>
```
注意：这样新增了一个内容列 wrapper `<div className="flex-1 min-w-0 flex flex-col overflow-hidden">`，因此**文件末尾原 `</div>`（第 238 行外层收尾）前需再补一个 `</div>`** 关闭内容列。视图块（`{view === 'changes' && …}` 等，现 132-237 行）整体保持不动，位置落在内容列 wrapper 内、hamburger 块之后。warning banner（126-130）也保持不动，落在内容列内。

- [ ] **Step 6: 跑 App 测试确认视图切换仍工作**

Run: `cd web && npx vitest run src/App.test.tsx`
Expected: PASS。若因结构变化有个别选择器失败，更新选择器使其定位到 SideRail 内的按钮（`view-switcher` testid 与 `aria-pressed` 语义不变），不弱化断言。

- [ ] **Step 7: tsc + 视觉自检**

Run: `cd web && npx tsc --noEmit`
Expected: 无输出。
（视觉：rail 悬浮左侧、渐变背景铺满、三视图可切换——lead 在 Task 5 统一截图验收。）

- [ ] **Step 8: Commit**

```bash
git add web/src/components/SideRail.tsx web/src/components/SideRail.test.tsx web/src/App.tsx
git commit -m "feat(ui): 悬浮 icon 侧栏 + 渐变外壳（方向A 外壳）"
```

---

## Task 2: KpiCards 图标卡升级

**Files:**
- Modify: `web/src/components/KpiCards.tsx:54-112`
- Test: `web/src/components/KpiCards.test.tsx`（现有，跑通即可；如需新增图标断言可加）

**Interfaces:**
- Consumes: 无（自包含）。Props/testid/`onFilterSelect`/`data-filter-active` 全部不变。
- Produces: 视觉升级后的 KpiCards，外部契约不变。

- [ ] **Step 1: 给 cards 数据加图标/色，先跑现有测试建立基线**

Run: `cd web && npx vitest run src/components/KpiCards.test.tsx`
Expected: PASS（基线）。

- [ ] **Step 2: 升级卡片渲染**

`web/src/components/KpiCards.tsx`：把 `cards` 数组每项加 `icon` 与 `chip`（chip 为图标底色）字段（`54-66`）：
```tsx
  const cards = [
    { key: 'active', label: '活跃变更', value: classification.active.length, testId: 'kpi-active', icon: '◔', chip: 'bg-[#eaf1ff] text-[#0063f8]' },
    { key: 'archived', label: '已归档', value: classification.archived.length, testId: 'kpi-archived', icon: '✓', chip: 'bg-[#eafaf0] text-[#16a34a]' },
    { key: 'stuck', label: '卡死预警', value: classification.stuck.length, testId: 'kpi-stuck', warn: classification.stuck.length > 0, icon: '⚠', chip: 'bg-[#fff3e0] text-[#d97706]' },
    { key: 'verify-failed', label: 'Verify 失败', value: classification.verifyFailed.length, testId: 'kpi-verify-failed', danger: classification.verifyFailed.length > 0, icon: '◎', chip: 'bg-[#f3eeff] text-[#7c3aed]' },
    { key: 'incomplete-tasks', label: '未完成任务', value: incompleteTasks, testId: 'kpi-incomplete-tasks', icon: '▤', chip: 'bg-[#f3f4f8] text-[#6e6e73]' },
  ]
```
把卡片 JSX（`74-109`）改为图标 chip + 标签在上、大数字在下：
```tsx
          <div
            key={c.key}
            data-testid={c.testId}
            data-filter-active={isFilterActive ? 'true' : 'false'}
            role="button"
            tabIndex={0}
            onClick={selectCard}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                selectCard()
              }
            }}
            className={
              'bg-white rounded-2xl px-4 py-4 shadow-[0_6px_20px_rgba(30,32,60,0.05),0_1px_2px_rgba(0,0,0,0.03)] cursor-pointer flex flex-col gap-2.5' +
              (c.warn ? ' outline outline-[1.5px] outline-[#f0cf9a] bg-[#fffdf8]' : '') +
              (isFilterActive ? ' ring-2 ring-[#0063f8]' : '')
            }
          >
            <div className="flex items-center gap-2.5">
              <div className={'w-[34px] h-[34px] rounded-[10px] grid place-items-center text-base ' + c.chip}>
                <span aria-hidden="true">{c.icon}</span>
              </div>
              <div className={'text-[13px] ' + (c.warn ? 'text-[#d97706] font-semibold' : 'text-[#6e6e73]')}>
                {c.label}
              </div>
            </div>
            <div className={'text-[27px] font-bold leading-none tracking-tight ' + (c.warn ? 'text-[#d97706]' : c.danger ? 'text-[#dc2626]' : 'text-[#1d1d1f]')}>
              {c.value}
            </div>
          </div>
```
（注意：`kpi-stuck` 的 `label` 从 `'⚠ 卡死预警'` 改为 `'卡死预警'`，⚠ 移到图标 chip。若 KpiCards.test.tsx 有断言文案含 ⚠，更新为不含 ⚠ 的 `'卡死预警'`。）

- [ ] **Step 3: 跑 KpiCards 测试确认通过**

Run: `cd web && npx vitest run src/components/KpiCards.test.tsx`
Expected: PASS。若 ⚠ 文案断言失败，按上一步说明更新为 `'卡死预警'`。

- [ ] **Step 4: tsc**

Run: `cd web && npx tsc --noEmit`
Expected: 无输出。

- [ ] **Step 5: Commit**

```bash
git add web/src/components/KpiCards.tsx web/src/components/KpiCards.test.tsx
git commit -m "feat(ui): KPI 图标卡（chip+大数字+柔阴影）"
```

---

## Task 3: 列表侧精修（WorkspaceChips + ChangeExplorer）

**Files:**
- Modify: `web/src/components/WorkspaceChips.tsx`（chip 药丸 + 添加卡阴影）
- Modify: `web/src/components/ChangeExplorer.tsx`（行圆角高亮 + 进度条语义色 + 圆角徽章）
- Test: `web/src/components/WorkspaceChips.test.tsx`、`web/src/components/ChangeExplorer.test.tsx`（现有，跑通）

**Interfaces:**
- Consumes: 无外部契约变化。所有 testid（`add-ws-*`、ChangeExplorer 行/搜索/筛选/分组 testid）与自动展开逻辑保持。
- Produces: 视觉升级，契约不变。

- [ ] **Step 1: 跑基线**

Run: `cd web && npx vitest run src/components/WorkspaceChips.test.tsx src/components/ChangeExplorer.test.tsx`
Expected: PASS（基线）。

- [ ] **Step 2: WorkspaceChips 药丸化**

`web/src/components/WorkspaceChips.tsx`：将 workspace chip 与"+ 添加"按钮的 className 改为药丸风：选中 `bg-[#0063f8] text-white`、未选 `bg-[#f2f3f7] text-[#6e6e73]`、添加按钮 `bg-white border border-dashed border-[#d5d7e0] text-[#6e6e73]`，统一 `rounded-full px-3 py-1.5 text-xs`。添加表单弹层容器加 `rounded-xl shadow-lg border border-[#e8e8ed] bg-white`。错误态（`add-ws-error`，已有）文案样式保留 `text-xs text-[#dc2626]`。不改任何 state / onAdd / testid。

- [ ] **Step 3: ChangeExplorer 行与进度条精修**

`web/src/components/ChangeExplorer.tsx`：
- 变更行容器：默认 `rounded-xl px-2.5 py-2.5`，hover `hover:bg-[#f7f8fc]`，选中 `bg-[#eef4ff] shadow-[inset_0_0_0_1px_#cfe0ff]`（替换现有 hover/选中 class，保留选中判断逻辑与 testid）。
- 进度条：轨道 `h-[5px] rounded-full bg-[#eef0f5]`，填充色按阶段语义——build 用 `#d97706`（未满）/`#16a34a`（满 100%），design `#0063f8`，verify `#7c3aed`，archive `#16a34a`，open `#c7cad4`。用现有 `change.phase` 与完成度百分比计算，写一个小 helper `barColor(phase, pct)` 置于组件文件顶部。
- 徽章：`rounded-full`（现为直角）→ 沿用阶段色映射 class，不新增文案。

`barColor` helper：
```tsx
function barColor(phase: string, pct: number): string {
  if (pct >= 100) return '#16a34a'
  switch (phase) {
    case 'design': return '#0063f8'
    case 'verify': return '#7c3aed'
    case 'archive': return '#16a34a'
    case 'build': return '#d97706'
    default: return '#c7cad4'
  }
}
```

- [ ] **Step 4: 跑列表侧测试确认通过**

Run: `cd web && npx vitest run src/components/WorkspaceChips.test.tsx src/components/ChangeExplorer.test.tsx`
Expected: PASS。若因 class/结构调整个别选择器失败，更新选择器（定位仍靠 testid），不弱化行为断言（搜索/筛选/自动展开/选中）。

- [ ] **Step 5: tsc + Commit**

Run: `cd web && npx tsc --noEmit` → 无输出。
```bash
git add web/src/components/WorkspaceChips.tsx web/src/components/ChangeExplorer.tsx web/src/components/WorkspaceChips.test.tsx web/src/components/ChangeExplorer.test.tsx
git commit -m "feat(ui): 列表侧精修（药丸工作区chip + 语义色进度条 + 圆角行）"
```

---

## Task 4: 详情侧精修（ChangeDetail + PhaseStepper + TaskDonut）

**Files:**
- Modify: `web/src/components/ChangeDetail.tsx:50`（卡片圆角阴影）
- Modify: `web/src/components/PhaseStepper.tsx:42-73`（dot/连接线精修）
- Modify: `web/src/components/TaskDonut.tsx`（环尺寸/中心数字）
- Test: `web/src/components/ChangeDetail.test.tsx`、`PhaseStepper.test.tsx`、`TaskDonut.test.tsx`（现有，跑通）

**Interfaces:**
- Consumes: 无契约变化。`step-<phase>`+`data-state`、`donut-ring`/`donut-percent`/`donut-fraction`、`phase-unknown-notice` 全部保留。
- Produces: 视觉升级，契约不变。

- [ ] **Step 1: 跑基线**

Run: `cd web && npx vitest run src/components/ChangeDetail.test.tsx src/components/PhaseStepper.test.tsx src/components/TaskDonut.test.tsx`
Expected: PASS（基线）。

- [ ] **Step 2: ChangeDetail 卡片质感**

`web/src/components/ChangeDetail.tsx:50`：外层 class 从
`"bg-white rounded-lg p-4 shadow-[0_4px_12px_rgba(0,0,0,0.06)] space-y-4"`
改为
`"bg-white rounded-2xl p-5 shadow-[0_8px_26px_rgba(30,32,60,0.06),0_1px_2px_rgba(0,0,0,0.03)] space-y-4"`。
其余结构不动。

- [ ] **Step 3: PhaseStepper current 光晕**

`web/src/components/PhaseStepper.tsx:42-53`：dot 的 `current` 态 class 从
`'bg-white border-2 border-[#0063f8] text-[#0063f8]'`
改为
`'bg-[#0063f8] text-white shadow-[0_0_0_4px_rgba(0,99,248,0.15)]'`；`done` 态保持 `bg-[#0063f8] text-white`（或改 `bg-[#16a34a]` 绿以对齐视觉稿的"已完成=绿"——采用绿）。连接线 `done` 段（`67-73`）`i < currentIndex` 时用 `bg-[#16a34a]`。`data-state` 与 testid 不变。

- [ ] **Step 4: TaskDonut 尺寸/中心**

`web/src/components/TaskDonut.tsx`：环 `w-[88px] h-[88px]` → `w-[120px] h-[120px]`，内圈 `w-16 h-16` → `w-[88px] h-[88px]`，中心百分比 `text-lg` → `text-2xl font-bold`，`donut-fraction` 文案与 testid 不变。`color` 逻辑（满绿/未满蓝）保留。

- [ ] **Step 5: 跑详情侧测试确认通过**

Run: `cd web && npx vitest run src/components/ChangeDetail.test.tsx src/components/PhaseStepper.test.tsx src/components/TaskDonut.test.tsx`
Expected: PASS。若个别选择器因 class 变化失败，更新选择器（靠 testid/`data-state`），不弱化断言。

- [ ] **Step 6: tsc + Commit**

Run: `cd web && npx tsc --noEmit` → 无输出。
```bash
git add web/src/components/ChangeDetail.tsx web/src/components/PhaseStepper.tsx web/src/components/TaskDonut.tsx web/src/components/ChangeDetail.test.tsx web/src/components/PhaseStepper.test.tsx web/src/components/TaskDonut.test.tsx
git commit -m "feat(ui): 详情侧精修（卡片质感 + stepper光晕 + 大donut）"
```

---

## Task 5: 全量验证 + 构建 + 视觉验收

**Files:** 无新增（收尾任务）。

**Interfaces:** 无。

- [ ] **Step 1: 全量前端测试**

Run: `cd web && npx vitest run`
Expected: 全绿（现有 141 + 新增 SideRail 测试）。任何失败在对应 Task 内修复后再回到此步。

- [ ] **Step 2: tsc 全量**

Run: `cd web && npx tsc --noEmit`
Expected: 无输出。

- [ ] **Step 3: Go 测试确认无回归**

Run: `cd /home/shanl/workspace/comet-panel && go test ./... && go vet ./...`
Expected: 全 `ok`（无后端改动，应 cached/pass）。

- [ ] **Step 4: 构建 + 重启服务**

Run: `cd /home/shanl/workspace/comet-panel && make build && systemctl --user restart comet-panel && sleep 3 && curl -s -o /dev/null -w ":8989=%{http_code}\n" http://localhost:8989/`
Expected: `make` 成功、`:8989=200`。

- [ ] **Step 5: 视觉验收（1920px + 窄屏）**

用 browser 打开 `http://localhost:8989/`：
- 1920×1080：确认悬浮 rail、渐变背景、KPI 图标卡、语义色进度条、详情卡质感、stepper 光晕、donut 对齐视觉稿 `/tmp/mock/dirA.html`。
- 窄屏（如 768px）：rail 仍常显，changes 单栏，hamburger 抽屉正常。
- 切换 图谱 / Lint：确认继承新外壳、无割裂。
截图对照视觉稿。

- [ ] **Step 6: 最终 Commit（如收尾有微调）**

```bash
git add -A && git commit -m "chore(ui): 方向A reskin 视觉验收收尾"
```
（若无微调则跳过。）
