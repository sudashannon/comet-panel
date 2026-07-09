---
comet_change: complete-v2-dashboard-features
role: verify-scope-review
phase: verify (2b-i deep review)
---

# Deep Verification Review — Scope Audit & Spec Traceability

Reviewer: VerifyReview (spec traceability). Diff range `8b227d3..HEAD` (19 files, +1507/-119),
worktree `.worktrees/v2-implementation`, branch `feature/20260710/complete-v2-dashboard-features`.

This review is READ-ONLY (no source edits). It maps every delta-spec scenario to implementation
and test evidence, audits scope against the proposal, and spot-checks design conformance. It does
NOT re-run the full test suite for its own sake — the counts below were captured to confirm the
already-reported green state, not to re-litigate it.

## 1. Scenario → Implementation → Test Traceability

### dashboard-chat (`specs/dashboard-chat/spec.md`)

| Scenario | Implementation | Test | Status |
|---|---|---|---|
| 打开聊天并发送消息 (POST /api/chat/message, SSE thinking/delta/done) | `web/src/api/client.ts:streamChat` (POST + SSE frame parser); `web/src/components/ChatBubble.tsx:handleSend` (accumulates thinking/delta onto placeholder message) | `client.test.ts` `describe('streamChat')` — `'POSTs change/message/context_files and parses thinking/delta/done SSE frames into onEvent calls'`; `ChatBubble.test.tsx` `'sends a message via streamChat and renders accumulated delta text'` | ✅ Covered |
| 上下文文件注入 (context_files 随消息发送) | `streamChat(change, message, contextFiles, onEvent)` threads `contextFiles` into the POST body (`client.ts`); `ChatBubble.tsx:handleSend` — `const contextFiles: string[] = []` (mechanism wired, no file-picker UI) | `client.test.ts` asserts `context_files` is POSTed (parameter-level); **no test exercises a non-empty `context_files` list end-to-end**, because the UI never produces one | ⚠️ **PARTIAL** — see Finding F1 |
| 会话按变更隔离 (切换 A→B→A 保留历史) | `App.tsx` — `<ChatBubble key={selectedChange.name} …>` forces remount per change; `ChatBubble.tsx` `useEffect` fetches `fetchChatSession(changeName)` on mount, backend `chat.SessionStore` keyed by change name | `App.test.tsx` `'remounts ChatBubble per selected change so switching changes does not bleed chat history'`; `ChatBubble.test.tsx` `'loads persisted history on mount and renders it before any send'` | ✅ Covered |
| 缺少 API key (pre-stream 4xx/5xx JSON, res.ok checked before reader) | `client.ts:streamChat` — checks `res.ok` and throws parsed JSON `message`/`error` *before* calling `res.body!.getReader()` | `client.test.ts` `'throws with the error-body message when res.ok is false, WITHOUT reading the body stream'` (asserts `getReader` never called), `'falls back to statusText…'`; `ChatBubble.test.tsx` `'shows an error message instead of hanging when streamChat rejects'` | ✅ Covered |

### dashboard-wiki-views (`specs/dashboard-wiki-views/spec.md`)

| Scenario | Implementation | Test | Status |
|---|---|---|---|
| 打开文档关系图谱 (app-level nav, fetch /api/wiki/index, render nodes, click MUST act) | `App.tsx` — `view` state + `<nav data-testid="view-switcher">` sibling to change list; `view === 'graph'` mounts `<WikiGraph onNodeClick={…}>` which resolves the clicked node id to a path via `wikiComponents` and opens `MarkdownViewer` | `App.test.tsx` `'switches to the 图谱 view and mounts WikiGraph'`; `WikiGraph.test.tsx` `'fetches components, initializes cytoscape with mapped elements, wires tap-to-click, and destroys on unmount'` (pre-existing, unchanged by this diff) | ✅ Covered |
| 查看 Lint 体检结果 (fetch /api/wiki/lint, group by rule, "无问题" when zero) | `App.tsx` `view === 'lint'` mounts `<LintPanel/>`; `wiki/api.go:HandleLint` normalizes nil→`[]`; `LintPanel.tsx` renders `未发现问题` for zero issues | `App.test.tsx` `'switches to the Lint view and mounts LintPanel'`; `LintPanel.test.tsx` `'lists lint issues grouped by rule'`, `'shows a clean state with zero issues'` (pre-existing); `wiki/api_test.go` `TestHandleLint_CleanGraphReturnsEmptyArrayNotNull` | ✅ Covered |
| 空索引的降级 (empty index → explicit empty-state, no error/blank) | `LintPanel.tsx` — explicit `未发现问题` state (zero issues == zero-index case, handled). `WikiGraph.tsx` — `if (!containerRef.current \|\| components.length === 0) return` — **renders only the bare `<div data-testid="wiki-graph-canvas">`, no empty-state text/explanation** | No test asserts an empty-state *message* for WikiGraph (only `LintPanel.test.tsx` asserts the zero-issue message) | ❌ **NOT MET** — see Finding F2 |

### change-explorer-search (`specs/change-explorer-search/spec.md`)

| Scenario | Implementation | Test | Status |
|---|---|---|---|
| 关键词搜索 (case-insensitive substring) | `ChangeExplorer.tsx:matchesFilters` — `change.name.toLowerCase().includes(search.toLowerCase())` | `ChangeExplorer.test.tsx` `'narrows the list to a case-insensitive substring match on name via the search input'` | ✅ Covered |
| 按 workflow 筛选 | `matchesFilters` — `workflow !== 'all' && change.workflow !== workflow` | `'filters by workflow using the workflow select'` | ✅ Covered |
| 按 phase 筛选 | `matchesFilters` — `phase !== 'all' && change.phase !== phase` | `'filters by phase using the phase select'` | ✅ Covered |
| 组合筛选与清空 (intersection + clear restores full list) | `ChangeExplorer.tsx:56-64` — single `filtered = changes.filter(matchesFilters)` applied to both active/archived; all filters are independent `useState` | `'applies search + workflow + phase filters as an intersection'`, `'shows a "无匹配" message…'`, `'clearing the search input restores the full list'`; status-select also covered by `'filters by status using the status select, spanning both active and archived groups'` | ✅ Covered |

### workspace-wiki-consistency (`specs/workspace-wiki-consistency/spec.md`)

| Scenario | Implementation | Test | Status |
|---|---|---|---|
| 运行时新增 workspace 后重建 → index 反映新 workspace | `wiki/api.go` — `WorkspaceLister` interface, `API.SetLister`, `HandleRebuild` reads `lister.List()` when non-nil instead of frozen `a.ws`; `main.go:65` — `wikiAPI.SetLister(registryLister{reg})` adapts live `*WorkspaceRegistry` | `wiki/api_test.go:TestHandleRebuild_UsesLiveListerNotConstructionSnapshot` — registers a workspace live via `SetLister` after construction, rebuilds, asserts new component present AND old construction-only component absent | ✅ Covered |
| 无 workspace 时的索引 (empty registry + `--dir` default → index at least default dir, or explicit empty, never permanently stale) | `main.go:58` constructs `wikiAPI` from `toWikiWorkspaces(reg.List())` at startup — if registry is empty, wiki index is built from an **empty slice**, not from `*baseDir`. `HandleRebuild` with an empty lister list also produces an empty (not stale) index — satisfies the "explicit empty index" half of the OR, never the "index default dir" half. This gap **predates this change** (wikiAPI was never wired to `*baseDir` before or after this diff) | `TestHandleRebuild_NilListerFallsBackToConstructionWorkspaces` covers the nil-lister fallback, but **no test exercises an empty-registry + non-empty `--dir` combination** for either startup or rebuild | ⚠️ **PARTIAL, PRE-EXISTING GAP** — see Finding F3 |

### multi-workspace-routing (`specs/multi-workspace-routing/spec.md`)

| Scenario | Implementation | Test | Status |
|---|---|---|---|
| 多 workspace 下读取详情 (`handleGetChange` via workspace path) | `main.go:resolveWorkspaceDir` (alias→registry lookup, unregistered alias → hard error, never silent baseDir fallback); `handleGetChange` calls it | `main_workspace_test.go:TestHandleGetChange_RoutesViaWorkspaceAlias`, `TestHandleGetChange_FallsBackToBaseDirWhenNoWorkspaceParam`, `TestHandleGetChange_UnregisteredWorkspaceAliasReturns400` | ✅ Covered |
| 多 workspace 下读取 artifact (`handleGetArtifact` correct path + traversal guard recomputed on resolved root) | `handleGetArtifact` uses `resolveWorkspaceDir`; traversal guard uses `filepath.Rel(rootAbs, absPath)` bounded check (rejects `".."` / leading `"../"`) recomputed from the *resolved* workspace root, not a static baseDir | `main_workspace_test.go:TestHandleGetArtifact_TraversalGuardUsesResolvedWorkspaceRoot`, `TestHandleGetArtifact_SiblingPrefixEscapeBlocked` (regression test for the A2-security-review sibling-prefix bypass) | ✅ Covered |
| 多 workspace 下状态迁移 (`handleTransition` runs guard in the resolved workspace dir) | `handleTransition` — `resolveWorkspaceDir(r, defaultDir, reg)` → `workspaceDir` passed to `TriggerTransition` | `main_transition_test.go:TestHandleTransition_RunsAgainstAliasedWorkspacePath` | ✅ Covered |

### guard-action-preflight (`specs/guard-action-preflight/spec.md`)

| Scenario | Implementation | Test | Status |
|---|---|---|---|
| 非法变更名禁用按钮 (date-prefixed name → disabled + reason) | `GuardButton.tsx` — `VALID_CHANGE_NAME_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/` (byte-for-byte match to comet-guard 0.4.0's rule per design doc); `disabled={running \|\| !nameValid}`, `title={nameValid ? undefined : '变更名不满足…'}` | `GuardButton.test.tsx` `'disables the trigger with an explanatory tooltip for an invalid (date-prefixed) change name'` | ✅ Covered |
| 合法变更名正常触发 (enabled, confirm dialog shows guard command) | Same component — valid name → `nameValid === true` → button enabled, click opens `guard-confirm-dialog` | `'keeps the trigger enabled and clickable for a valid kebab-case change name'`; pre-existing `'shows a confirm dialog with the exact command before executing'` | ✅ Covered |

## 2. Scope Audit

`git diff --stat 8b227d3..HEAD`: 19 files, +1507/-119 (17 code/test files + 2 change-metadata files:
`.comet/subagent-progress.md`, `tasks.md`).

**Proposal Impact section says**: frontend `ChatBubble.tsx, WikiGraph.tsx, LintPanel.tsx,
ChangeExplorer.tsx, ChangeDetail.tsx, App.tsx, GuardButton.tsx, api/client.ts, api/types.ts`;
backend `wiki/api.go, main.go`; tests: matching `*.test.tsx` / `*_test.go`.

**Actually touched, matches proposal**: `ChatBubble.tsx`, `ChangeExplorer.tsx`, `App.tsx`,
`GuardButton.tsx`, `api/client.ts`, `wiki/api.go`, `main.go`, plus their test files.

**Listed in proposal but NOT touched (intentional, not a gap)**: `WikiGraph.tsx`, `LintPanel.tsx`,
`ChangeDetail.tsx`, `api/types.ts`. Per the design doc §5, WikiGraph/LintPanel were already built +
tested pre-change ("孤儿组件") — this change wires them into `App.tsx`'s new app-level nav rather
than modifying the components themselves. `ChangeDetail.tsx` was never touched because the design
doc explicitly moved WikiGraph/LintPanel to app-level (sibling to ChangeExplorer), not embedded in
per-change detail — a documented design decision, not scope creep or an unimplemented promise.
`api/types.ts` needed no new types (the added `ChatStreamEvent`/`ChatSession`/`WikiComponent`-adjacent
types live in `client.ts` itself).

**Touched but NOT explicitly listed in proposal Impact**: `workspace.go` / `workspace_test.go`
(+34/-3, +14/-3). This adds `validateWorkspacePath` — a hardening guard rejecting non-absolute,
non-existent, or filesystem-root-or-direct-child workspace paths at `WorkspaceRegistry.Add` time.
This is a necessary companion to the `multi-workspace-routing` capability's artifact traversal-guard
fix (design doc §2: "artifact 的 path-traversal 守卫…必须基于解析后的 workspace root 重新计算，防止跨
workspace 越权") — registering `/` or `/etc` as a workspace would make the per-request traversal
guard a no-op. Matches the context's note that "A2 security CRITICALs found+fixed (245dcba)" — this
is that fix. **Not scope creep**: it is in-capability security hardening, just not itemized in the
proposal's Impact list. Flagged as a documentation gap only (SUGGESTION, not a blocker).

**State-inconsistency-detection regression check**: `git diff --stat 8b227d3..HEAD -- scanner.go
scanner_test.go` and `git log --oneline 8b227d3..HEAD -- scanner.go scanner_test.go` both return
empty — **zero commits touched either file**. Confirms the proposal's explicit note ("原评测列出的
「一致性检测缺失」…已实现+已测…故从本 change 范围移除") held: `computeStateWarning` was neither
re-implemented nor regressed.

**Verdict: scope matches the proposal.** No unexplained scope creep; the one addition
(`workspace.go` validation) is a justified, in-scope security hardening, not new capability surface.

## 3. Proposal "What Changes" Goals (1–6)

| # | Goal | Satisfied? | Evidence |
|---|---|---|---|
| 1 | 聊天空壳 → 接通 SSE 流式、上下文文件选择 | ✅ (SSE) / ⚠️ (context files — mechanism only, no picker UI) | §1 dashboard-chat table; Finding F1 |
| 2 | 图谱/Lint 孤儿组件 → 接线进 UI，提供可达入口 | ✅ | `App.tsx` view switcher; §1 dashboard-wiki-views table |
| 3 | 搜索/筛选缺失 → 恢复搜索 + 筛选 | ✅ | §1 change-explorer-search table, full coverage |
| 4 | wiki/workspace 双源割裂 → rebuild 从 registry 实时读取 | ✅ (core scenario) / ⚠️ (empty-registry-with-default-dir edge case, pre-existing) | §1 workspace-wiki-consistency table; Finding F3 |
| 5 | 多 workspace 未贯通详情链路 → 按 workspace 解析路径 | ✅ | §1 multi-workspace-routing table, full coverage incl. security regression test |
| 6 | GuardButton 命名陷阱 → 前端预校验，禁用+提示 | ✅ | §1 guard-action-preflight table, full coverage |

5 of 6 goals fully satisfied with full test coverage; goals 1 and 4 are satisfied for their
core/primary scenario but have a narrower partial gap each (both pre-flagged in the scenario tables
above, neither a regression, neither blocking the stated "What Changes" claim as literally written).

## 4. Design Conformance Spot-Checks

- **streamChat checks `res.ok` before reader**: ✅ Confirmed verbatim in `client.ts:streamChat` —
  `if (!res.ok) { … throw … }` precedes `res.body!.getReader()`. Matches design doc §6 exactly,
  including the "GuardButton.tsx 现有模式" reference (GuardButton's own fetch-and-check pattern was
  the template).
- **wiki rebuild reads live registry via lister**: ✅ Confirmed — `WorkspaceLister` interface,
  `SetLister`, nil-fallback to `a.ws` preserving old single-test behavior, exactly as design doc §1
  specifies (including the explicit "adapter needed because `main.WorkspaceConfig` doesn't satisfy
  `wiki.WorkspaceConfig`" call-out — `registryLister` + `toWikiWorkspaces` is that adapter).
- **guard uses filepath.Rel bounded check**: ✅ Confirmed — `handleGetArtifact` replaced the (implied
  pre-change) `strings.HasPrefix` approach with `filepath.Rel(rootAbs, absPath)` + explicit `".."`/
  `"../"`-prefix rejection, with an inline comment explaining exactly why raw-string `HasPrefix` is
  unsafe (sibling-prefix bypass, e.g. `/tmp/ws-evil` vs `/tmp/ws`). Regression-tested by
  `TestHandleGetArtifact_SiblingPrefixEscapeBlocked`.
- **WikiGraph/LintPanel at app-level, not per-change**: ✅ Confirmed — `App.tsx`'s `view` state
  switcher is a sibling to the `changes` view (which contains `ChangeExplorer`/`ChangeDetail`), not
  nested inside `ChangeDetail`. Matches design doc §5 and the component-interaction diagram
  (`App -->|app-level nav 视图切换| WG & LP`).
- **GuardButton regex matches guard's**: ✅ Confirmed — `/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/`, identical
  to the design doc §7 spec (`isValidChangeName`) and tested against the concrete failure case
  (`2026-06-17-foo`, a date-prefixed name) that motivated this capability.
- **`?workspace=` precedence over `?dir=`**: ✅ Confirmed — `resolveWorkspaceDir` only consults
  `getDir` (which reads `?dir=`) when `?workspace=` is absent; an unregistered `?workspace=` alias
  is a hard 400, never a silent `?dir=`/baseDir fallback, matching design doc §2's precedence rule.

## 5. Regression Sanity

- `go test ./...`: **PASS** — `comet-ui` (ok, 0.016s), `comet-ui/chat` (no test files),
  `comet-ui/chat/provider` (no test files), `comet-ui/internal/pathresolve` (ok, cached),
  `comet-ui/wiki` (ok, cached). No failures.
- `cd web && npx vitest run`: **PASS** — 17 test files, **85/85 tests passed**, 3.35s. (Pre-existing
  React `act(...)` console warnings from `WorkspaceChips` are unrelated to this change's diff and do
  not fail any test.)

Both match the lead's already-reported green state; this review's own run reconfirms rather than
re-litigates.

## 6. Findings

### F1 — WARNING: dashboard-chat context-file injection scenario has no end-to-end coverage
`streamChat`'s `contextFiles` parameter is correctly threaded through to the request body and the
spec's plumbing requirement is met, but `ChatBubble.tsx:handleSend` hardcodes `const contextFiles:
string[] = []` — there is no UI (file picker / @-mention) that ever produces a non-empty list. The
component's own comment acknowledges this ("no file-picker UI yet… a future task can wire an actual
@-mention picker"). The spec scenario "上下文文件注入" (user references an artifact as context) is
therefore **not actually exercisable by an end user today**, even though the transport-layer
contract is tested. This is a real, currently-inert gap between spec scenario and delivered user-facing
behavior — not a regression, but not a satisfied scenario either.
**Recommendation**: either scope this scenario out of the delta spec explicitly (defer to a follow-up
change) or file a fast-follow task to add the file-reference UI before calling this capability complete.

### F2 — WARNING: dashboard-wiki-views empty-index degradation not implemented for WikiGraph
The spec's "空索引的降级" scenario requires WikiGraph to show an explanatory empty state ("MUST 显示
空状态说明，不得报错或白屏"), and the design doc explicitly proposes the copy ("索引为空，先注册
workspace 并重建"). `LintPanel.tsx` implements this correctly (`未发现问题` covers both "no issues"
and "empty index" — since an empty index yields zero lint issues by construction). `WikiGraph.tsx`
does not: when `components.length === 0`, the effect that would initialize cytoscape simply returns
early, leaving only the bare `<div data-testid="wiki-graph-canvas" className="w-full h-[500px]">`
rendered — a blank 500px box, not an explanation. This is not a crash/white-screen (satisfies the
letter of "不得报错或白屏" loosely) but does not satisfy "MUST 显示空状态说明". No test asserts
this text either, so the gap is untested as well as unimplemented.
**Recommendation**: add an empty-state branch to `WikiGraph.tsx` (mirroring `LintPanel`'s pattern)
before considering `dashboard-wiki-views` fully done; this is a small, self-contained fix.

### F3 — SUGGESTION (pre-existing, not introduced by this change): empty-registry wiki index scenario untested
`workspace-wiki-consistency`'s second scenario ("无 workspace 时的索引") requires that an empty
registry with a populated `--dir` default either indexes that default directory or explicitly
returns empty — never silently stays stale forever. The current code satisfies the "explicit empty"
half (an empty lister list correctly produces an empty, current index, not a stale one — this IS
the bug this change fixed, generalized). It does not implement the "index the default dir" half:
`main.go` never converts `*baseDir` into a `wiki.WorkspaceConfig` for the wiki subsystem, at startup
or on rebuild. This gap **predates the diff under review** (`wikiAPI` was never wired to `*baseDir`
before this change either) and is not a regression introduced here — the change's actual mandate
(runtime-added workspaces reflected on rebuild) is fully met and tested. Flagging because the literal
OR in the spec text has an untested/unimplemented left branch, not because this change created the gap.
**Recommendation**: track as a separate, low-priority follow-up; does not block this change.

### Impact-section documentation gap (SUGGESTION, not a defect)
`workspace.go`/`workspace_test.go` (`validateWorkspacePath`) were touched but not listed in the
proposal's Impact section. Functionally justified (closes a path-traversal-adjacent security hole
in workspace registration that would otherwise undermine the `multi-workspace-routing` artifact
guard), not scope creep, and already covered by tests
(`TestWorkspaceRegistry_Add_RejectsRootPath`, `_RejectsNonAbsolutePath`, `_RejectsNonExistentPath`,
`TestHandleAddWorkspace_RootPathReturns400`). Recommend updating the archived proposal's Impact
section to mention `workspace.go` for future-reader accuracy; not required for verify to pass.

## 7. Verdict

**ISSUES-FOUND** — two WARNING-level scenario gaps (F1: context-file injection UI absent, F2:
WikiGraph empty-state message absent) and one pre-existing SUGGESTION-level scenario gap (F3,
not introduced by this change). No CRITICAL findings. Scope matches the proposal (validated:
no creep, no dropped promised capability, state-inconsistency-detection confirmed un-regressed).
5 of 6 "What Changes" goals are fully satisfied with complete test coverage; goals 1
(dashboard-chat) and 4 (workspace-wiki-consistency) are satisfied for their primary/core scenario
but each carry one narrower unmet sub-scenario as detailed above. `go test ./...` and
`vitest run` are both green (reconfirmed: 5 Go packages ok, 85/85 JS tests passed).

Recommend: fix F2 (small, self-contained) before archiving; F1 and F3 are acceptable to explicitly
descope into follow-up work if the change owner records that decision, since neither is a regression
and both are narrow, well-isolated gaps in an otherwise fully-covered, scope-accurate change.
