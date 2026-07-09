# comet-panel V2.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild comet-panel's frontend on React+Tailwind, add multi-workspace aggregation, build a document relationship graph (backlinks/lint/graph-view/LLM-summaries), and add guarded phase-transition write operations — as specified in `docs/specs/2026-07-09-comet-panel-v2-design.md`.

**Architecture:** Single Go binary (unchanged deployment model), React+Vite frontend embedded via `go:embed`, new `wiki/` Go package for the document graph subsystem with a clean interface boundary, `guard.go` that only forwards to `$COMET_GUARD` (never reimplements its logic).

**Tech Stack:** Go 1.26 (backend, stdlib + existing `chat/` package), React 18 + TypeScript + Vite + Tailwind CSS v4 (frontend), `goldmark` (Go markdown AST parser), `chromem-go` (reserved, disabled retriever), Cytoscape.js (graph view), Vitest + React Testing Library (frontend tests), Playwright (responsive viewport tests).

---

## 执行记录与偏离（Execution Record & Deviations）

> 本节由执行完成后回填，记录计划**实际执行结果**与原始设计的偏离。下方原始计划正文保持不变，作为设计蓝图存档参考；本节是竣工记录。Worktree：`.worktrees/v2-implementation`。

### 1. 实际新增的任务（Additional Tasks Beyond the Original 33）

原计划 33 个任务全部完成；执行过程中另外产生了 11 个计划外的任务/修复，均由集成测试、smoke test 或 Gate 评审触发，而非需求变更：

| # | 任务 | 触发方式 | 内容 | Commit |
|---|---|---|---|---|
| task-12b | PhaseStepper unknown-phase 状态修复 | Task 12 集成测试发现真实 bug | 缺少 `.comet.yaml` 的 change 被误渲染为"全部待处理"，改为明确的 unknown-phase 态 | `b263107` |
| task-17b | KPI 卡片点击筛选 | Gate A 人工评审，用户要求交互式筛选 | KPI 卡片从纯展示改为可点击筛选 change 列表 | `97e8488` |
| task-23b | ScanComponents 权限拒绝容错 | Task 23 真实数据 smoke test 发现真实 bug | vendored Tegra rootfs 树中 37 处权限受限路径导致整棵扫描中止；改为跳过并返回部分结果 | `a3e823c` |
| Phase③ 收尾 #1 | BacklinksPanel 404 修复 | Gate B Critical | 创建 TypeChange wiki 节点，为前端打通真实 componentId | `33e78dc` |
| Phase③ 收尾 #2 | ScanComponents 目录排除 | Gate B Major | 跳过 `.git`/`node_modules`/点目录/`rootfs`，扫描耗时 120s→3s | `b64779b` |
| Phase③ 收尾 #3 | Lint 噪音降噪 | Gate B Major | 排除归档孤儿、文件名回退重复、非路径 YAML 值 | `40816b5` |
| Artifact 浏览 | ArtifactList + MarkdownViewer | Gate A 视觉评审发现 V1 功能缺口 | 后端 API 完好，前端从未消费；补齐 V1 的 artifact 浏览能力 | `1297113` |
| 视觉打磨 | MarkdownViewer 模态化 | 后续打磨 | 模态浮层、frontmatter 剥离、可折叠归档侧栏、代码高亮样式 | `84b2010` |
| 图表渲染 | Mermaid + PlantUML | 后续打磨 | MarkdownViewer 内渲染 Mermaid（客户端 mermaid.js）与 PlantUML（Kroki.io） | `72d0e8e` |
| CI 测试接入 | GitHub Actions 补测试步骤 | Gate A P1 | CI 此前只 build 不 test，补上 `go test`/`npm test` | `5d7b503` |
| Gate C 安全加固 | handleTransition 输入校验 + 超时 | Gate C Important | 输入校验对齐 `handleGetChange`，guard 执行加 context 超时防挂死 | `15ab9e9` |

### 2. 已知缺口（Known Gaps — Not Delivered）

- **Chat SSE 迁移未完成**：Task 10 的 `ChatBubble` 只是外壳组件——到 `/api/chat/*` 的 SSE 接线被推迟为"后续任务"，但该任务从未被排期。后端 `/api/chat/*` 完好且可用，缺的只是 React 前端消费者。需要产品决策：V2 是否可以不带 chat 发布，或补一个专门任务。
- **LintPanel 未挂载**：组件已实现，但没有任何页面引用它。
- **WikiGraph 未挂载**：组件已实现，但没有任何页面引用它。
- **LintTaskArtifacts 从未被调用**：已实现但是死代码——`HandleLint` 只调用了 `g.Lint()`。
- **Retriever 接口（keywordRetriever/vectorRetriever）从未被调用**：`HandleSearch` 自己内联了一套基于标题子串的搜索，未使用该接口。
- **Layer-4 slug 模糊匹配**：Gate B 评审时已明确排除范围（descoped）。

### 3. Brief 缺陷修正记录（Brief-Level Bugs Found & Corrected During Execution）

执行过程中发现并修正的、源自任务 brief 本身的缺陷（非需求变更，均有 RED→GREEN 或真实数据复现证据）：

- **Task 11**：`kpi-grid` 包装 div 造成嵌套 grid 挤压（oracle 报告的 968px 外层宽度 vs 184px 挤压后卡片宽度）；修复为将 `data-testid` 直接移到 `KpiCards` 自身的 grid div 上，删除多余包装层。
- **Task 17**：`setChanges(r.changes)` 缺少 `?? []` 空值保护——单目录部署（无 workspace 注册）时 `r.changes` 为 `null` 会直接崩溃。
- **Task 20**：brief 代码只对 `*ast.Link` 做类型断言，遗漏 `*ast.Image`——goldmark 源码证实两者是各自独立嵌入 `baseLink` 的同级类型（sibling，非父子），导致图片链接被静默丢弃（0 条边而非报错）。
- **Task 23**：`ws.Path` 被 brief 中的代码不一致地当作"openspec 目录"和"项目根目录"两种语义使用——实际约定是前者（`scanner.go`/测试 fixture/生产启动参数均证实），brief 的双重语义会导致所有真实 workspace 找到 0 个 component。
- **Task 23**：`WorkspaceConfig` 跨包引用不可行——Go 不允许 import `package main`；修复为在 `wiki` 包内新增镜像 DTO + `main.go` 侧转换函数。
- **Task 26**：`HandleLint` 空 slice 序列化为 JSON `null`——前端 `useState<T[] | null>(null)` 语义下无法区分"未加载"与"零问题"，修复为显式 `[]LintIssue{}` 归一化。
- **Task 27**：`cytoscape` 在 jsdom 环境下的 canvas 调用会 throw，导致 vitest 进程退出码非 0（CI 回归）；修复为 mock 整个 `cytoscape` 模块。
- **Task 27**：`TYPE_COLORS` 中 3 组临时选定的颜色彼此过于近似；替换为经 CIE Lab ΔE 验证过、两两可分辨的配色方案。
- **Task 28**：`HandleSummarize` 原公式按文件路径深度散落出多个缓存目录（同一 workspace 内 5 个代表性组件产生 3 个不同缓存目录）；修复为复用 Task 23 已有的 `~/.comet-panel/wiki/` 统一缓存目录。
- **多个任务**：brief 中引用的行号普遍失效（代码随文件增长而漂移）；执行时以实际文件内容核对为准，不机械套用行号。
- **多个任务**：brief 给出的人工验证脚本示例使用端口 8989（生产服务端口）；执行时统一改用 8990 等隔离端口，全程未触碰生产进程。

### 4. Gate 评审结论汇总（Gate Review Verdicts）

| Gate | 位置 | 结论 | 关键发现 |
|---|---|---|---|
| Gate A | Task 17 之后（Stage 1-3） | PASS WITH NOTES | Chat 迁移缺口（见"已知缺口"）；CI 只 build 不 test |
| Gate B | Task 29 之后（Phase③） | PASS WITH NOTES | BacklinksPanel 404；Lint 噪音占比 ~90%；扫描耗时 120s；悬空 edge 端点 |
| Gate C | Task 33 之后（Phase④，最终） | PASS WITH NOTES | `handleTransition` 缺输入校验；`TriggerTransition` 无 context 超时（挂死 guard 会永久锁死该 change + goroutine 泄漏） |

三次 Gate 评审均为 **PASS WITH NOTES**——架构与实现整体通过，各自发现的问题均已通过第 1 节列出的修复任务解决。

### 5. 最终指标（Final Metrics）

- **Commit 数**：仓库全部历史 `git rev-list --count HEAD` = 57；其中本次 V2 执行新增 46 个 commit —— 33 个计划任务 + 12 个计划外修复/功能（第 1 节所列 11 项 + 1 个未单独列出的早期 CI/Makefile 修复 `4e80632`）+ 1 个启动前的 `.gitignore` 设置 `47faa43`；其余 11 个为执行前既有历史（9 个 V1 基线 commit + 撰写本设计/计划文档自身的 2 个 commit）。
- **Go 测试**：63 个全部通过（文档更新时以 `go test ./...` 重新验证）。
- **前端测试**：56 个全部通过，vitest 退出码 0（文档更新时以 `vitest run` 重新验证）。
- **Playwright E2E**：6 个全部通过（执行期间记录，本次文档更新未重新运行）。
- **生产服务**：PID 608，端口 8989（文档更新时以 `ps`/`ss` 复核，进程持续运行、全程未被本次执行触碰）。

---

## Global Constraints

- Colors: accent `#0063f8`, success `#16a34a`, danger `#dc2626`, warn `#c47a06` (exact hex values, no substitutions)
- Font: Inter via `@fontsource/inter` npm package — **never** a CDN `<link>` tag (design doc Phase① correction)
- Phase name mapping (Chinese, exact strings): `open`→`启动`, `design`→`设计`, `build`→`构建`, `verify`→`验证`, `archive`→`归档`
- Verify result mapping: `pass`→`通过`, `fail`→`验证失败`, `pending`→`待验证`
- Responsive layout is a **hard Phase① requirement**, not optional polish — the previous mobile CSS patch was discarded, so there is no fallback until this ships
- `wiki/` package must reuse the path-resolution logic already fixed in `makeArtifactExt` (scanner.go) — never re-derive path-joining logic from scratch for links extracted from `.comet.yaml` fields
- `guard.go` must never reimplement comet-guard's pass/fail logic — it only shells out to `$COMET_GUARD` and forwards output verbatim
- No batch operations in Phase④ (one change, one transition, one confirm click at a time)
- No dark mode, no Git Snapshot panel, no Risk panel in this plan (explicit non-goals per design doc)
- Vector search stays behind a disabled feature flag; do not wire it into any UI in this plan

---

## Stage Map (single plan, staged review gates — do not split into separate plan files)

1. **Foundation** (Tasks 1-2) — Vite/React scaffold + Go embed wiring
2. **Phase① — Panel Core Refresh** (Tasks 3-12)
3. **Phase② — Multi-Workspace Aggregation** (Tasks 13-17)
4. **>>> REVIEW GATE A <<<** — oracle review of Stages 1-3 combined before proceeding
5. **Phase③a — Wiki Core** (Tasks 18-24)
6. **Phase③b — Wiki Additive Layers** (Tasks 25-29)
7. **>>> REVIEW GATE B <<<** — oracle review of Phase③ before proceeding
8. **Phase④ — Guarded Write Operations** (Tasks 30-33)
9. **>>> REVIEW GATE C <<<** — oracle review of Phase④, final

---

## Foundation

### Task 1: Scaffold Vite + React + TypeScript + Tailwind v4

**Files:**
- Create: `web/package.json`
- Create: `web/vite.config.ts`
- Create: `web/tsconfig.json`
- Create: `web/index.html`
- Create: `web/src/main.tsx`
- Create: `web/src/App.tsx`
- Create: `web/src/styles.css`

**Interfaces:**
- Produces: a Vite dev server on `:5173` proxying `/api/*` to `:8989`; `npm run build` emits `web/dist/`

- [ ] **Step 1: Create `web/package.json`**

```json
{
  "name": "comet-panel-web",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "test": "vitest run"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "@fontsource/inter": "^5.1.0"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.0.0",
    "@testing-library/react": "^16.0.1",
    "@testing-library/jest-dom": "^6.5.0",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.3",
    "jsdom": "^25.0.1",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.6.3",
    "vite": "^5.4.10",
    "vitest": "^2.1.4"
  }
}
```

- [ ] **Step 2: Create `web/vite.config.ts`**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { outDir: 'dist', emptyOutDir: true },
  server: {
    proxy: {
      '/api': { target: 'http://localhost:8989', changeOrigin: true },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test-setup.ts',
  },
})
```

- [ ] **Step 3: Create `web/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Create `web/index.html`**

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <title>Comet Dashboard</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Create `web/src/styles.css`**

```css
@import "tailwindcss";
@import "@fontsource/inter/400.css";
@import "@fontsource/inter/600.css";
@import "@fontsource/inter/700.css";

:root {
  --color-accent: #0063f8;
  --color-success: #16a34a;
  --color-danger: #dc2626;
  --color-warn: #c47a06;
}

body {
  font-family: Inter, sans-serif;
  -webkit-font-smoothing: antialiased;
}
```

- [ ] **Step 6: Create `web/src/App.tsx`**

```tsx
export default function App() {
  return (
    <div className="min-h-screen bg-[#f5f5f7] p-6">
      <h1 className="text-2xl font-bold text-[#1d1d1f]">Comet Dashboard</h1>
    </div>
  )
}
```

- [ ] **Step 7: Create `web/src/main.tsx`**

```tsx
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

createRoot(document.getElementById('root')!).render(<App />)
```

- [ ] **Step 8: Install and verify dev server**

Run: `cd web && npm install && npm run build`
Expected: `web/dist/index.html` and `web/dist/assets/*.js` exist, build exits 0

- [ ] **Step 9: Commit**

```bash
git add web/
git commit -m "feat: scaffold Vite+React+Tailwind frontend for V2.0"
```

---

### Task 2: Wire Go embed to serve `web/dist`

**Files:**
- Modify: `main.go`
- Test: `main_test.go` (create)

**Interfaces:**
- Consumes: `web/dist/` (built by Task 1)
- Produces: `embeddedStatic embed.FS` variable other handlers can serve from

- [ ] **Step 1: Write the failing test**

```go
// main_test.go
package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestServesEmbeddedIndex(t *testing.T) {
	req := httptest.NewRequest("GET", "/", nil)
	w := httptest.NewRecorder()
	staticHandler().ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./... -run TestServesEmbeddedIndex -v`
Expected: FAIL — `staticHandler` undefined

- [ ] **Step 3: Implement embed wiring**

Find the existing `//go:embed static/*` directive in `main.go` and replace it and its handler wiring with:

```go
//go:embed web/dist
var webDist embed.FS

func staticHandler() http.Handler {
	sub, err := fs.Sub(webDist, "web/dist")
	if err != nil {
		log.Fatalf("embed sub: %v", err)
	}
	return http.FileServer(http.FS(sub))
}
```

Update the route registration (wherever `static/*` was previously mounted) to use `staticHandler()` instead. Leave `/api/*` routes untouched.

- [ ] **Step 4: Run test to verify it passes**

Run: `go test ./... -run TestServesEmbeddedIndex -v`
Expected: PASS

- [ ] **Step 5: Full build sanity check**

Run: `cd web && npm run build && cd .. && go build -o comet-panel .`
Expected: exits 0, binary produced

- [ ] **Step 6: Commit**

```bash
git add main.go main_test.go
git commit -m "feat: embed Vite build output, replace static/* embed"
```

---

## Phase① — Panel Core Refresh

### Task 3: scanner.go — consume review/lifecycle/workflow-mode fields + state consistency check

**Files:**
- Modify: `scanner.go`
- Test: `scanner_test.go` (create)

**Interfaces:**
- Consumes: existing `cometYAML`/`ChangeSummary` structs (scanner.go:11-52)
- Produces: `ChangeSummary` gains `Visualized`, `DesignReviewed`, `VerifyReviewed bool`; `VerifiedAt`, `BuildMode`, `ReviewMode`, `TddMode string`; `AutoTransition bool`; `StateWarning string` (empty when consistent, else a Chinese message)

- [ ] **Step 1: Write the failing test**

```go
// scanner_test.go
package main

import (
	"os"
	"path/filepath"
	"testing"
)

func writeYAML(t *testing.T, dir, content string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(dir, ".comet.yaml"), []byte(content), 0644); err != nil {
		t.Fatal(err)
	}
}

func TestParseCometYAML_ReviewAndLifecycleFields(t *testing.T) {
	dir := t.TempDir()
	writeYAML(t, dir, `
phase: build
visualized: true
design_reviewed: true
verify_reviewed: false
created_at: 2026-07-01
verified_at: null
build_mode: subagent-driven-development
review_mode: standard
tdd_mode: direct
auto_transition: true
`)
	cy, err := parseCometYAML(filepath.Join(dir, ".comet.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	if !cy.Visualized || !cy.DesignReviewed || cy.VerifyReviewed {
		t.Fatalf("review flags mismatch: %+v", cy)
	}
	if cy.CreatedAt != "2026-07-01" || cy.VerifiedAt != "" {
		t.Fatalf("lifecycle fields mismatch: %+v", cy)
	}
	if cy.BuildMode != "subagent-driven-development" || cy.ReviewMode != "standard" || cy.TddMode != "direct" {
		t.Fatalf("mode fields mismatch: %+v", cy)
	}
	if !cy.AutoTransition {
		t.Fatalf("auto_transition mismatch: %+v", cy)
	}
}

func TestStateWarning_ArchivedTrueButPhaseNotArchive(t *testing.T) {
	got := computeStateWarning(true, "build")
	if got == "" {
		t.Fatal("expected a warning, got none")
	}
}

func TestStateWarning_PhaseArchiveButNotArchived(t *testing.T) {
	got := computeStateWarning(false, "archive")
	if got == "" {
		t.Fatal("expected a warning, got none")
	}
}

func TestStateWarning_Consistent(t *testing.T) {
	if got := computeStateWarning(false, "build"); got != "" {
		t.Fatalf("expected no warning, got %q", got)
	}
	if got := computeStateWarning(true, "archive"); got != "" {
		t.Fatalf("expected no warning, got %q", got)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./... -run 'TestParseCometYAML_ReviewAndLifecycleFields|TestStateWarning' -v`
Expected: FAIL — `cy.Visualized` etc. undefined (fields don't exist yet), `computeStateWarning` undefined

- [ ] **Step 3: Extend `cometYAML` struct and parser**

In `scanner.go`, replace the `cometYAML` struct (lines 44-52) with:

```go
type cometYAML struct {
	Workflow           string
	Phase              string
	VerifyResult       string
	DesignDoc          string
	Plan               string
	VerificationReport string
	Archived           bool
	Visualized         bool
	DesignReviewed     bool
	VerifyReviewed     bool
	CreatedAt          string
	VerifiedAt         string
	BuildMode          string
	ReviewMode         string
	TddMode            string
	AutoTransition     bool
}
```

Add these `case` branches inside the `switch key` block in `parseCometYAML` (after the existing `case "archived":` branch):

```go
		case "visualized":
			c.Visualized = val == "true"
		case "design_reviewed":
			c.DesignReviewed = val == "true"
		case "verify_reviewed":
			c.VerifyReviewed = val == "true"
		case "created_at":
			c.CreatedAt = val
		case "verified_at":
			c.VerifiedAt = val
		case "build_mode":
			c.BuildMode = val
		case "review_mode":
			c.ReviewMode = val
		case "tdd_mode":
			c.TddMode = val
		case "auto_transition":
			c.AutoTransition = val == "true"
```

- [ ] **Step 4: Add `computeStateWarning` and extend `ChangeSummary`**

Add this function near `phaseStatus` (scanner.go, after line 140):

```go
func computeStateWarning(archived bool, phase string) string {
	if archived && phase != "archive" && phase != "" {
		return fmt.Sprintf("archived=true 但 phase=%s（状态不一致）", phase)
	}
	if !archived && phase == "archive" {
		return "phase=archive 但 archived=false（状态不一致）"
	}
	return ""
}
```

Extend `ChangeSummary` (lines 11-21) with:

```go
type ChangeSummary struct {
	Name            string          `json:"name"`
	Workflow        string          `json:"workflow"`
	Phase           string          `json:"phase"`
	Archived        bool            `json:"archived"`
	TasksCompleted  int             `json:"tasksCompleted"`
	TasksTotal      int             `json:"tasksTotal"`
	VerifyResult    string          `json:"verifyResult"`
	CreatedAt       string          `json:"createdAt"`
	Artifacts       map[string]bool `json:"artifacts"`
	Visualized      bool            `json:"visualized"`
	DesignReviewed  bool            `json:"designReviewed"`
	VerifyReviewed  bool            `json:"verifyReviewed"`
	VerifiedAt      string          `json:"verifiedAt"`
	BuildMode       string          `json:"buildMode"`
	ReviewMode      string          `json:"reviewMode"`
	TddMode         string          `json:"tddMode"`
	AutoTransition  bool            `json:"autoTransition"`
	StateWarning    string          `json:"stateWarning,omitempty"`
}
```

- [ ] **Step 5: Wire the new fields into `scanChange`**

In `scanChange` (scanner.go:185-236), after the `createdAt := ""` block (line 220-223), replace with:

```go
	createdAt := ""
	if archived {
		createdAt = extractDate(name)
	} else if cy != nil && cy.CreatedAt != "" {
		createdAt = cy.CreatedAt
	}

	var visualized, designReviewed, verifyReviewed, autoTransition bool
	var verifiedAt, buildMode, reviewMode, tddMode string
	if cy != nil {
		visualized = cy.Visualized
		designReviewed = cy.DesignReviewed
		verifyReviewed = cy.VerifyReviewed
		verifiedAt = cy.VerifiedAt
		buildMode = cy.BuildMode
		reviewMode = cy.ReviewMode
		tddMode = cy.TddMode
		autoTransition = cy.AutoTransition
	}
```

Then update the final `return ChangeSummary{...}` literal (lines 225-235) to include the new fields:

```go
	return ChangeSummary{
		Name:           name,
		Workflow:       workflow,
		Phase:          phase,
		Archived:       archived,
		TasksCompleted: completed,
		TasksTotal:     total,
		VerifyResult:   verifyResult,
		CreatedAt:      createdAt,
		Artifacts:      artifacts,
		Visualized:     visualized,
		DesignReviewed: designReviewed,
		VerifyReviewed: verifyReviewed,
		VerifiedAt:     verifiedAt,
		BuildMode:      buildMode,
		ReviewMode:     reviewMode,
		TddMode:        tddMode,
		AutoTransition: autoTransition,
		StateWarning:   computeStateWarning(archived, phase),
	}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `go test ./... -run 'TestParseCometYAML_ReviewAndLifecycleFields|TestStateWarning' -v`
Expected: PASS (all 4 tests)

- [ ] **Step 7: Full test suite + build sanity**

Run: `go build ./... && go test ./...`
Expected: builds clean, all tests pass (including Task 2's `TestServesEmbeddedIndex`)

- [ ] **Step 8: Commit**

```bash
git add scanner.go scanner_test.go
git commit -m "feat: scanner consumes review/lifecycle/mode fields, detects state inconsistency"
```

---

### Task 4: React — API types + client for ChangeSummary

**Files:**
- Create: `web/src/api/types.ts`
- Create: `web/src/api/client.ts`
- Create: `web/src/api/client.test.ts`
- Modify: `web/package.json` (add test deps already present from Task 1)

**Interfaces:**
- Consumes: JSON shape produced by `handleListChanges` (main.go:93-103) — **verified from source**: `{"changes": ChangeSummary[], "dir": string}`, not a bare array
- Produces: `fetchChanges(): Promise<ChangeSummary[]>` (unwraps the `changes` key), `ChangeSummary` TS type

- [ ] **Step 1: Write the failing test**

```typescript
// web/src/api/client.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchChanges } from './client'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('fetchChanges', () => {
  it('unwraps the {changes, dir} envelope into a bare array', async () => {
    const mockResponse = {
      dir: '../miao/openspec',
      changes: [
        {
          name: 'rx101-system-sw-architecture',
          workflow: 'full',
          phase: 'build',
          archived: false,
          tasksCompleted: 19,
          tasksTotal: 31,
          verifyResult: 'pending',
          createdAt: '2026-05-29',
          artifacts: {},
          visualized: true,
          designReviewed: true,
          verifyReviewed: false,
          verifiedAt: '',
          buildMode: 'subagent-driven-development',
          reviewMode: 'standard',
          tddMode: 'direct',
          autoTransition: true,
          stateWarning: '',
        },
      ],
    }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response)

    const result = await fetchChanges()
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('rx101-system-sw-architecture')
    expect(result[0].tasksTotal).toBe(31)
  })

  it('throws on non-OK response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 500 } as Response)
    await expect(fetchChanges()).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/api/client.test.ts`
Expected: FAIL — `./client` module not found

- [ ] **Step 3: Write `web/src/api/types.ts`**

```typescript
export interface ChangeSummary {
  name: string
  workflow: string
  phase: string
  archived: boolean
  tasksCompleted: number
  tasksTotal: number
  verifyResult: 'pass' | 'fail' | 'pending' | string
  createdAt: string
  artifacts: Record<string, boolean>
  visualized: boolean
  designReviewed: boolean
  verifyReviewed: boolean
  verifiedAt: string
  buildMode: string
  reviewMode: string
  tddMode: string
  autoTransition: boolean
  stateWarning?: string
  workspace?: string // added in Phase②, optional until then
}

export interface ChangesResponse {
  changes: ChangeSummary[]
  dir?: string
  failedWorkspaces?: string[]
}
```

- [ ] **Step 4: Write `web/src/api/client.ts`**

```typescript
import type { ChangeSummary, ChangesResponse } from './types'

export async function fetchChanges(): Promise<ChangeSummary[]> {
  const res = await fetch('/api/changes')
  if (!res.ok) {
    throw new Error(`fetchChanges failed: ${res.status}`)
  }
  const body: ChangesResponse = await res.json()
  return body.changes
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd web && npx vitest run src/api/client.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add web/src/api/
git commit -m "feat: add ChangeSummary API types and client, unwrap {changes,dir} envelope"
```

---

### Task 5: React — KpiCards component

**Files:**
- Create: `web/src/components/KpiCards.tsx`
- Create: `web/src/components/KpiCards.test.tsx`

**Interfaces:**
- Consumes: `ChangeSummary[]` (from Task 4)
- Produces: `<KpiCards changes={ChangeSummary[]} stuckThresholdDays={number} />`

- [ ] **Step 1: Write the failing test**

```tsx
// web/src/components/KpiCards.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { KpiCards } from './KpiCards'
import type { ChangeSummary } from '../api/types'

function makeChange(overrides: Partial<ChangeSummary>): ChangeSummary {
  return {
    name: 'x', workflow: 'full', phase: 'build', archived: false,
    tasksCompleted: 0, tasksTotal: 0, verifyResult: 'pending', createdAt: '',
    artifacts: {}, visualized: false, designReviewed: false, verifyReviewed: false,
    verifiedAt: '', buildMode: '', reviewMode: '', tddMode: '', autoTransition: false,
    ...overrides,
  }
}

describe('KpiCards', () => {
  it('counts active, archived, verify-failed, incomplete tasks, and stuck changes', () => {
    const today = new Date('2026-07-09')
    const changes = [
      makeChange({ name: 'a', archived: false, phase: 'build', createdAt: '2026-07-01', tasksCompleted: 5, tasksTotal: 10 }),
      makeChange({ name: 'b', archived: true }),
      makeChange({ name: 'c', archived: false, phase: 'verify', verifyResult: 'fail' }),
      makeChange({ name: 'd', archived: false, phase: 'build', createdAt: '2026-05-01', tasksCompleted: 0, tasksTotal: 3 }),
    ]
    render(<KpiCards changes={changes} stuckThresholdDays={14} now={today} />)

    expect(screen.getByTestId('kpi-active').textContent).toContain('3')
    expect(screen.getByTestId('kpi-archived').textContent).toContain('1')
    expect(screen.getByTestId('kpi-verify-failed').textContent).toContain('1')
    expect(screen.getByTestId('kpi-stuck').textContent).toContain('1')
    expect(screen.getByTestId('kpi-incomplete-tasks').textContent).toContain('8')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/components/KpiCards.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write `web/src/components/KpiCards.tsx`**

```tsx
import type { ChangeSummary } from '../api/types'

interface Props {
  changes: ChangeSummary[]
  stuckThresholdDays: number
  now?: Date
}

function daysSince(dateStr: string, now: Date): number {
  if (!dateStr) return 0
  const then = new Date(dateStr)
  return Math.floor((now.getTime() - then.getTime()) / (1000 * 60 * 60 * 24))
}

export function KpiCards({ changes, stuckThresholdDays, now = new Date() }: Props) {
  const active = changes.filter((c) => !c.archived)
  const archived = changes.filter((c) => c.archived)
  const verifyFailed = active.filter((c) => c.verifyResult === 'fail')
  const stuck = active.filter(
    (c) => c.phase === 'build' && daysSince(c.createdAt, now) > stuckThresholdDays,
  )
  const incompleteTasks = active.reduce((sum, c) => sum + (c.tasksTotal - c.tasksCompleted), 0)

  const cards = [
    { key: 'active', label: '活跃变更', value: active.length, testId: 'kpi-active' },
    { key: 'archived', label: '已归档', value: archived.length, testId: 'kpi-archived' },
    {
      key: 'stuck', label: '⚠ 卡死预警', value: stuck.length, testId: 'kpi-stuck',
      warn: stuck.length > 0,
    },
    {
      key: 'verify-failed', label: 'Verify 失败', value: verifyFailed.length,
      testId: 'kpi-verify-failed', danger: verifyFailed.length > 0,
    },
    { key: 'incomplete-tasks', label: '未完成任务', value: incompleteTasks, testId: 'kpi-incomplete-tasks' },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
      {cards.map((c) => (
        <div
          key={c.key}
          data-testid={c.testId}
          className={
            'bg-white rounded-lg p-3 shadow-[0_4px_12px_rgba(0,0,0,0.06)]' +
            (c.warn ? ' border border-[#c47a06]' : '')
          }
        >
          <div
            className={
              'text-[11px] ' + (c.warn ? 'text-[#c47a06] font-semibold' : 'text-[#6e6e73]')
            }
          >
            {c.label}
          </div>
          <div
            className={
              'text-[28px] font-bold ' +
              (c.warn ? 'text-[#c47a06]' : c.danger ? 'text-[#dc2626]' : 'text-[#1d1d1f]')
            }
          >
            {c.value}
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/components/KpiCards.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/components/KpiCards.tsx web/src/components/KpiCards.test.tsx
git commit -m "feat: add KpiCards component with stuck-change detection"
```

---

### Task 6: React — PhaseStepper component

**Files:**
- Create: `web/src/components/PhaseStepper.tsx`
- Create: `web/src/components/PhaseStepper.test.tsx`

**Interfaces:**
- Consumes: `phase: string` (one of `open|design|build|verify|archive`)
- Produces: `<PhaseStepper currentPhase={string} />`

- [ ] **Step 1: Write the failing test**

```tsx
// web/src/components/PhaseStepper.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { PhaseStepper } from './PhaseStepper'

describe('PhaseStepper', () => {
  it('marks phases before current as done, current as current, rest as pending', () => {
    render(<PhaseStepper currentPhase="build" />)
    expect(screen.getByTestId('step-open').dataset.state).toBe('done')
    expect(screen.getByTestId('step-design').dataset.state).toBe('done')
    expect(screen.getByTestId('step-build').dataset.state).toBe('current')
    expect(screen.getByTestId('step-verify').dataset.state).toBe('pending')
    expect(screen.getByTestId('step-archive').dataset.state).toBe('pending')
  })

  it('renders Chinese labels', () => {
    render(<PhaseStepper currentPhase="open" />)
    expect(screen.getByText('启动')).toBeTruthy()
    expect(screen.getByText('设计')).toBeTruthy()
    expect(screen.getByText('构建')).toBeTruthy()
    expect(screen.getByText('验证')).toBeTruthy()
    expect(screen.getByText('归档')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/components/PhaseStepper.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write `web/src/components/PhaseStepper.tsx`**

```tsx
const PHASES = [
  { key: 'open', label: '启动' },
  { key: 'design', label: '设计' },
  { key: 'build', label: '构建' },
  { key: 'verify', label: '验证' },
  { key: 'archive', label: '归档' },
] as const

type StepState = 'done' | 'current' | 'pending'

function stateFor(index: number, currentIndex: number): StepState {
  if (index < currentIndex) return 'done'
  if (index === currentIndex) return 'current'
  return 'pending'
}

export function PhaseStepper({ currentPhase }: { currentPhase: string }) {
  const currentIndex = PHASES.findIndex((p) => p.key === currentPhase)

  return (
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
                      : 'bg-white border-2 border-[#d2d2d7] text-[#6e6e73]')
                }
              >
                {state === 'done' ? '✓' : i + 1}
              </div>
              <div
                className={
                  'text-[10px] mt-1 ' +
                  (state === 'pending' ? 'text-[#6e6e73]' : 'text-[#0063f8] font-semibold')
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
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/components/PhaseStepper.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/components/PhaseStepper.tsx web/src/components/PhaseStepper.test.tsx
git commit -m "feat: add PhaseStepper component"
```

---

### Task 7: React — TaskDonut component

**Files:**
- Create: `web/src/components/TaskDonut.tsx`
- Create: `web/src/components/TaskDonut.test.tsx`

**Interfaces:**
- Consumes: `completed: number`, `total: number`
- Produces: `<TaskDonut completed={number} total={number} />`

- [ ] **Step 1: Write the failing test**

```tsx
// web/src/components/TaskDonut.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { TaskDonut } from './TaskDonut'

describe('TaskDonut', () => {
  it('renders the percentage and fraction text', () => {
    render(<TaskDonut completed={19} total={31} />)
    expect(screen.getByTestId('donut-percent').textContent).toBe('61%')
    expect(screen.getByTestId('donut-fraction').textContent).toBe('19/31 任务完成')
  })

  it('handles zero total without dividing by zero', () => {
    render(<TaskDonut completed={0} total={0} />)
    expect(screen.getByTestId('donut-percent').textContent).toBe('0%')
  })

  it('uses success color at 100%', () => {
    render(<TaskDonut completed={5} total={5} />)
    const ring = screen.getByTestId('donut-ring')
    expect(ring.style.background).toContain('#16a34a')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/components/TaskDonut.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write `web/src/components/TaskDonut.tsx`**

```tsx
export function TaskDonut({ completed, total }: { completed: number; total: number }) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0
  const color = pct >= 100 ? '#16a34a' : '#0063f8'

  return (
    <div className="flex flex-col items-center justify-center">
      <div
        data-testid="donut-ring"
        className="w-[88px] h-[88px] rounded-full flex items-center justify-center"
        style={{ background: `conic-gradient(${color} 0% ${pct}%, #e8e8ed ${pct}% 100%)` }}
      >
        <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center">
          <div data-testid="donut-percent" className="text-lg font-bold">
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/components/TaskDonut.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/components/TaskDonut.tsx web/src/components/TaskDonut.test.tsx
git commit -m "feat: add TaskDonut component"
```

---

### Task 8: React — ReviewBadges component

**Files:**
- Create: `web/src/components/ReviewBadges.tsx`
- Create: `web/src/components/ReviewBadges.test.tsx`

**Interfaces:**
- Consumes: `visualized`, `designReviewed`, `verifyReviewed: boolean` (from `ChangeSummary`)
- Produces: `<ReviewBadges visualized designReviewed verifyReviewed />`

- [ ] **Step 1: Write the failing test**

```tsx
// web/src/components/ReviewBadges.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ReviewBadges } from './ReviewBadges'

describe('ReviewBadges', () => {
  it('shows pass tone when true, neutral tone when false', () => {
    render(<ReviewBadges visualized={true} designReviewed={false} verifyReviewed={true} />)
    expect(screen.getByTestId('badge-visualized').dataset.tone).toBe('ok')
    expect(screen.getByTestId('badge-design-reviewed').dataset.tone).toBe('neutral')
    expect(screen.getByTestId('badge-verify-reviewed').dataset.tone).toBe('ok')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/components/ReviewBadges.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write `web/src/components/ReviewBadges.tsx`**

```tsx
interface Props {
  visualized: boolean
  designReviewed: boolean
  verifyReviewed: boolean
}

function Pill({ testId, tone, label }: { testId: string; tone: 'ok' | 'neutral'; label: string }) {
  const cls =
    tone === 'ok'
      ? 'bg-[#e6f7ec] text-[#16a34a]'
      : 'bg-[#f5f5f7] text-[#6e6e73]'
  return (
    <span
      data-testid={testId}
      data-tone={tone}
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}
    >
      {tone === 'ok' ? '✓ ' : '○ '}
      {label}
    </span>
  )
}

export function ReviewBadges({ visualized, designReviewed, verifyReviewed }: Props) {
  return (
    <div className="flex gap-2">
      <Pill testId="badge-visualized" tone={visualized ? 'ok' : 'neutral'} label="可视化" />
      <Pill testId="badge-design-reviewed" tone={designReviewed ? 'ok' : 'neutral'} label="设计已审" />
      <Pill testId="badge-verify-reviewed" tone={verifyReviewed ? 'ok' : 'neutral'} label="验证已审" />
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/components/ReviewBadges.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/components/ReviewBadges.tsx web/src/components/ReviewBadges.test.tsx
git commit -m "feat: add ReviewBadges component"
```

---

### Task 9: React — ChangeExplorer + ChangeDetail composition

**Files:**
- Create: `web/src/components/ChangeExplorer.tsx`
- Create: `web/src/components/ChangeExplorer.test.tsx`
- Create: `web/src/components/ChangeDetail.tsx`
- Create: `web/src/components/ChangeDetail.test.tsx`

**Interfaces:**
- Consumes: `ChangeSummary[]` (Task 4), `KpiCards` (Task 5), `PhaseStepper` (Task 6), `TaskDonut` (Task 7), `ReviewBadges` (Task 8)
- Produces: `<ChangeExplorer changes={ChangeSummary[]} onSelect={(name: string) => void} selected={string | null} />`, `<ChangeDetail change={ChangeSummary} />`

- [ ] **Step 1: Write the failing test for ChangeExplorer**

```tsx
// web/src/components/ChangeExplorer.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ChangeExplorer } from './ChangeExplorer'
import type { ChangeSummary } from '../api/types'

function makeChange(name: string): ChangeSummary {
  return {
    name, workflow: 'full', phase: 'build', archived: false,
    tasksCompleted: 1, tasksTotal: 2, verifyResult: 'pending', createdAt: '2026-07-01',
    artifacts: {}, visualized: false, designReviewed: false, verifyReviewed: false,
    verifiedAt: '', buildMode: '', reviewMode: '', tddMode: '', autoTransition: false,
  }
}

describe('ChangeExplorer', () => {
  it('lists changes and calls onSelect when clicked', () => {
    const onSelect = vi.fn()
    render(
      <ChangeExplorer changes={[makeChange('foo'), makeChange('bar')]} selected={null} onSelect={onSelect} />,
    )
    expect(screen.getByText('foo')).toBeTruthy()
    expect(screen.getByText('bar')).toBeTruthy()
    fireEvent.click(screen.getByText('bar'))
    expect(onSelect).toHaveBeenCalledWith('bar')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/components/ChangeExplorer.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write `web/src/components/ChangeExplorer.tsx`**

```tsx
import type { ChangeSummary } from '../api/types'

interface Props {
  changes: ChangeSummary[]
  selected: string | null
  onSelect: (name: string) => void
}

export function ChangeExplorer({ changes, selected, onSelect }: Props) {
  return (
    <div className="space-y-2">
      {changes.map((c) => (
        <div
          key={c.name}
          onClick={() => onSelect(c.name)}
          className={
            'rounded-xl border p-3 cursor-pointer ' +
            (selected === c.name ? 'border-[#0063f8] bg-[#f0f5ff]' : 'border-[#e8e8ed]')
          }
        >
          <div className="text-sm font-medium">{c.name}</div>
          <div className="text-xs text-[#6e6e73]">
            {c.phase} · {c.tasksCompleted}/{c.tasksTotal}
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Run ChangeExplorer test to verify it passes**

Run: `cd web && npx vitest run src/components/ChangeExplorer.test.tsx`
Expected: PASS

- [ ] **Step 5: Write the failing test for ChangeDetail**

```tsx
// web/src/components/ChangeDetail.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ChangeDetail } from './ChangeDetail'
import type { ChangeSummary } from '../api/types'

describe('ChangeDetail', () => {
  it('renders stepper, donut, and review badges for the given change', () => {
    const change: ChangeSummary = {
      name: 'rx101-x', workflow: 'full', phase: 'build', archived: false,
      tasksCompleted: 19, tasksTotal: 31, verifyResult: 'pending', createdAt: '2026-05-29',
      artifacts: {}, visualized: true, designReviewed: true, verifyReviewed: false,
      verifiedAt: '', buildMode: '', reviewMode: '', tddMode: '', autoTransition: false,
    }
    render(<ChangeDetail change={change} />)
    expect(screen.getByTestId('step-build').dataset.state).toBe('current')
    expect(screen.getByTestId('donut-fraction').textContent).toBe('19/31 任务完成')
    expect(screen.getByTestId('badge-visualized').dataset.tone).toBe('ok')
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd web && npx vitest run src/components/ChangeDetail.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 7: Write `web/src/components/ChangeDetail.tsx`**

```tsx
import type { ChangeSummary } from '../api/types'
import { PhaseStepper } from './PhaseStepper'
import { TaskDonut } from './TaskDonut'
import { ReviewBadges } from './ReviewBadges'

export function ChangeDetail({ change }: { change: ChangeSummary }) {
  return (
    <div className="bg-white rounded-lg p-4 shadow-[0_4px_12px_rgba(0,0,0,0.06)] space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{change.name}</h3>
        <ReviewBadges
          visualized={change.visualized}
          designReviewed={change.designReviewed}
          verifyReviewed={change.verifyReviewed}
        />
      </div>
      {change.stateWarning && (
        <div className="text-xs text-[#dc2626] bg-[#fdeeee] rounded p-2">
          ⚠ {change.stateWarning}
        </div>
      )}
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="flex-[2]">
          <PhaseStepper currentPhase={change.phase} />
        </div>
        <div className="flex-1">
          <TaskDonut completed={change.tasksCompleted} total={change.tasksTotal} />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd web && npx vitest run src/components/ChangeDetail.test.tsx`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add web/src/components/ChangeExplorer.tsx web/src/components/ChangeExplorer.test.tsx web/src/components/ChangeDetail.tsx web/src/components/ChangeDetail.test.tsx
git commit -m "feat: add ChangeExplorer list and ChangeDetail composition"
```

---

### Task 10: React — ChatBubble floating overlay

**Files:**
- Create: `web/src/components/ChatBubble.tsx`
- Create: `web/src/components/ChatBubble.test.tsx`

**Interfaces:**
- Consumes: nothing new (wraps existing `/api/chat/*` endpoints — do not change `chat/handler.go`)
- Produces: `<ChatBubble changeName={string} />` — floating button bottom-right, click toggles an overlay panel

- [ ] **Step 1: Write the failing test**

```tsx
// web/src/components/ChatBubble.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ChatBubble } from './ChatBubble'

describe('ChatBubble', () => {
  it('is collapsed by default and expands on click', () => {
    render(<ChatBubble changeName="rx101-x" />)
    expect(screen.queryByTestId('chat-overlay')).toBeNull()
    fireEvent.click(screen.getByTestId('chat-bubble-button'))
    expect(screen.getByTestId('chat-overlay')).toBeTruthy()
  })

  it('collapses again when the close button is clicked', () => {
    render(<ChatBubble changeName="rx101-x" />)
    fireEvent.click(screen.getByTestId('chat-bubble-button'))
    fireEvent.click(screen.getByTestId('chat-overlay-close'))
    expect(screen.queryByTestId('chat-overlay')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/components/ChatBubble.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write `web/src/components/ChatBubble.tsx`**

```tsx
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/components/ChatBubble.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/components/ChatBubble.tsx web/src/components/ChatBubble.test.tsx
git commit -m "feat: add ChatBubble floating overlay shell"
```

---

### Task 11: Responsive layout breakpoints

**Files:**
- Create: `web/src/App.tsx` (rewrite from Task 1's placeholder)
- Create: `web/tests/responsive.spec.ts` (Playwright)
- Create: `web/playwright.config.ts`
- Modify: `web/package.json` (add `@playwright/test`, `test:e2e` script)

**Interfaces:**
- Consumes: `KpiCards`, `PhaseStepper`, `TaskDonut`, `ChangeExplorer`, `ChangeDetail`, `ChatBubble` (Tasks 5-10)
- Produces: a working `App.tsx` that composes everything with responsive Tailwind classes; Playwright viewport assertions

- [ ] **Step 1: Add Playwright dependency and config**

```json
// Add to web/package.json devDependencies:
"@playwright/test": "^1.48.0"
```

```json
// Add to web/package.json scripts:
"test:e2e": "playwright test"
```

```typescript
// web/playwright.config.ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  webServer: {
    command: 'npm run dev',
    port: 5173,
    reuseExistingServer: true,
  },
  use: { baseURL: 'http://localhost:5173' },
})
```

Run: `cd web && npm install && npx playwright install --with-deps chromium`

- [ ] **Step 2: Write the failing Playwright test**

```typescript
// web/tests/responsive.spec.ts
import { test, expect } from '@playwright/test'

test('KPI grid collapses to 2 columns below md breakpoint', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await page.goto('/')
  const grid = page.getByTestId('kpi-grid')
  const className = await grid.getAttribute('class')
  expect(className).toContain('grid-cols-2')
})

test('sidebar collapses behind hamburger below xl breakpoint', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 800 })
  await page.goto('/')
  await expect(page.getByTestId('hamburger-toggle')).toBeVisible()
  await expect(page.getByTestId('sidebar')).not.toBeVisible()
})

test('sidebar is visible at xl breakpoint without hamburger', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await expect(page.getByTestId('sidebar')).toBeVisible()
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd web && npx playwright test`
Expected: FAIL — `App.tsx` does not yet compose these test ids

- [ ] **Step 4: Write the composed `web/src/App.tsx`**

```tsx
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
          <div data-testid="kpi-grid">
            <KpiCards changes={changes} stuckThresholdDays={14} />
          </div>
          {selectedChange && <ChangeDetail change={selectedChange} />}
        </main>
      </div>

      {selectedChange && <ChatBubble changeName={selectedChange.name} />}
    </div>
  )
}
```

Note: `KpiCards`'s outer `<div>` (Task 5) already carries `grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5` — the `data-testid="kpi-grid"` wrapper added here in `App.tsx` lets Playwright assert on it without modifying `KpiCards` itself.

- [ ] **Step 5: Run Playwright test to verify it passes**

Run: `cd web && npm run dev &` (background), then `npx playwright test`
Expected: PASS (3 tests). Kill the dev server after: `kill %1`

- [ ] **Step 6: Run full frontend test suite**

Run: `cd web && npm run test`
Expected: all Vitest suites from Tasks 4-10 still pass

- [ ] **Step 7: Commit**

```bash
git add web/src/App.tsx web/tests/ web/playwright.config.ts web/package.json
git commit -m "feat: compose App.tsx with responsive breakpoints, add Playwright viewport tests"
```

---

### Task 12: Phase① integration smoke test (real backend, no mocks)

**Files:**
- Create: `web/tests/integration.spec.ts` (Playwright, hits the real running Go binary)

**Interfaces:**
- Consumes: the actual `comet-panel` binary serving real `.comet.yaml` data (not mocked) — this is the closing verification for Phase①, confirming Task 3's Go changes and Tasks 4-11's React changes integrate correctly end-to-end
- Produces: no new production code; this task only adds a verification test

- [ ] **Step 1: Write the integration test**

```typescript
// web/tests/integration.spec.ts
import { test, expect } from '@playwright/test'

// Runs against the real comet-panel binary (see Step 2 for how it's started),
// not the Vite dev server — this exercises the full embed + API + React chain.
test.use({ baseURL: 'http://localhost:8989' })

test('dashboard loads real changes from the configured workspace and renders KPI cards', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('kpi-grid')).toBeVisible()
  const activeCard = page.getByTestId('kpi-active')
  await expect(activeCard).toBeVisible()
  const text = await activeCard.textContent()
  expect(text).toMatch(/\d+/) // some active-change count rendered, not "NaN" or empty
})

test('selecting a change renders its PhaseStepper with a valid current step', async ({ page }) => {
  await page.goto('/')
  const firstChange = page.locator('[data-testid="sidebar"] >> text=/.+/').first()
  await firstChange.click()
  const steps = ['step-open', 'step-design', 'step-build', 'step-verify', 'step-archive']
  let currentCount = 0
  for (const id of steps) {
    const state = await page.getByTestId(id).getAttribute('data-state')
    if (state === 'current') currentCount++
  }
  expect(currentCount).toBe(1) // exactly one phase is "current"
})
```

- [ ] **Step 2: Build and run the real binary, then run the test**

```bash
cd web && npm run build && cd ..
export PATH="/home/linuxbrew/.linuxbrew/bin:$PATH"
go build -o comet-panel .
./comet-panel --port 8989 --dir ../miao/openspec &
sleep 1
cd web && npx playwright test tests/integration.spec.ts
kill %1
```

Expected: both tests PASS against real `miao` workspace data

- [ ] **Step 3: Commit**

```bash
git add web/tests/integration.spec.ts
git commit -m "test: add Phase① end-to-end integration smoke test against real backend"
```

---

## Phase② — Multi-Workspace Aggregation

**Note on dependency choice:** `workspaces.yaml` has a nested list structure (`workspaces: [{alias, path, color}, ...]`), meaningfully more complex than the existing flat `key: value` `.comet.yaml` parser (scanner.go:54-92). Hand-rolling a nested-list YAML parser risks repeating this session's pattern of fragile hand-written parsing logic causing real bugs (the `../` path-folding and bare-filename bugs fixed earlier). This plan introduces `gopkg.in/yaml.v3` as the project's first external dependency, scoped only to `workspace.go` — the existing `.comet.yaml` flat parser in `scanner.go` is left untouched (not worth the churn of migrating working code).

### Task 13: workspace.go — WorkspaceConfig struct + YAML load

**Files:**
- Create: `workspace.go`
- Create: `workspace_test.go`
- Modify: `go.mod` (add `gopkg.in/yaml.v3`)

**Interfaces:**
- Produces: `type WorkspaceConfig struct { Alias, Path, Color string }`, `func LoadWorkspaces(configPath string) ([]WorkspaceConfig, error)`

- [ ] **Step 1: Add the dependency**

Run: `go get gopkg.in/yaml.v3`
Expected: `go.mod` gains a `require gopkg.in/yaml.v3 vX.Y.Z` line, `go.sum` created

- [ ] **Step 2: Write the failing test**

```go
// workspace_test.go
package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadWorkspaces(t *testing.T) {
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "workspaces.yaml")
	content := `
workspaces:
  - alias: miao
    path: /home/shanl/workspace/miao/openspec
    color: "#0063f8"
  - alias: wan2_2_deploy
    path: /home/shanl/workspace/wan2_2_deploy/openspec
    color: "#16a34a"
`
	if err := os.WriteFile(cfgPath, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}

	ws, err := LoadWorkspaces(cfgPath)
	if err != nil {
		t.Fatal(err)
	}
	if len(ws) != 2 {
		t.Fatalf("expected 2 workspaces, got %d", len(ws))
	}
	if ws[0].Alias != "miao" || ws[0].Path != "/home/shanl/workspace/miao/openspec" || ws[0].Color != "#0063f8" {
		t.Fatalf("workspace[0] mismatch: %+v", ws[0])
	}
}

func TestLoadWorkspaces_MissingFileReturnsEmpty(t *testing.T) {
	ws, err := LoadWorkspaces(filepath.Join(t.TempDir(), "nonexistent.yaml"))
	if err != nil {
		t.Fatalf("expected no error for missing config, got %v", err)
	}
	if len(ws) != 0 {
		t.Fatalf("expected empty slice, got %d entries", len(ws))
	}
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `go test ./... -run TestLoadWorkspaces -v`
Expected: FAIL — `workspace.go` doesn't exist yet

- [ ] **Step 4: Write `workspace.go`**

```go
package main

import (
	"os"

	"gopkg.in/yaml.v3"
)

type WorkspaceConfig struct {
	Alias string `yaml:"alias" json:"alias"`
	Path  string `yaml:"path" json:"path"`
	Color string `yaml:"color" json:"color"`
}

type workspacesFile struct {
	Workspaces []WorkspaceConfig `yaml:"workspaces"`
}

// LoadWorkspaces reads the workspace registry config. A missing file is not
// an error — it means no workspaces are registered yet.
func LoadWorkspaces(configPath string) ([]WorkspaceConfig, error) {
	data, err := os.ReadFile(configPath)
	if os.IsNotExist(err) {
		return []WorkspaceConfig{}, nil
	}
	if err != nil {
		return nil, err
	}
	var f workspacesFile
	if err := yaml.Unmarshal(data, &f); err != nil {
		return nil, err
	}
	if f.Workspaces == nil {
		return []WorkspaceConfig{}, nil
	}
	return f.Workspaces, nil
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `go test ./... -run TestLoadWorkspaces -v`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add workspace.go workspace_test.go go.mod go.sum
git commit -m "feat: add WorkspaceConfig + LoadWorkspaces (introduces yaml.v3 dependency)"
```

---

### Task 14: workspace.go — in-memory registry with hot-reload write-back

**Files:**
- Modify: `workspace.go`
- Modify: `workspace_test.go`

**Interfaces:**
- Consumes: `LoadWorkspaces` (Task 13)
- Produces: `type WorkspaceRegistry struct{...}`, `func NewWorkspaceRegistry(configPath string) (*WorkspaceRegistry, error)`, `func (r *WorkspaceRegistry) List() []WorkspaceConfig`, `func (r *WorkspaceRegistry) Add(cfg WorkspaceConfig) error` (appends + persists to disk + updates in-memory state atomically)

- [ ] **Step 1: Write the failing test**

```go
// append to workspace_test.go

func TestWorkspaceRegistry_AddPersistsAndUpdatesMemory(t *testing.T) {
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "workspaces.yaml")

	reg, err := NewWorkspaceRegistry(cfgPath)
	if err != nil {
		t.Fatal(err)
	}
	if len(reg.List()) != 0 {
		t.Fatalf("expected empty registry, got %d", len(reg.List()))
	}

	if err := reg.Add(WorkspaceConfig{Alias: "miao", Path: "/x/miao/openspec", Color: "#0063f8"}); err != nil {
		t.Fatal(err)
	}

	// in-memory reflects the addition immediately
	if len(reg.List()) != 1 || reg.List()[0].Alias != "miao" {
		t.Fatalf("expected in-memory registry to contain 'miao', got %+v", reg.List())
	}

	// a fresh load from disk also reflects it (proves it was persisted)
	reloaded, err := LoadWorkspaces(cfgPath)
	if err != nil {
		t.Fatal(err)
	}
	if len(reloaded) != 1 || reloaded[0].Alias != "miao" {
		t.Fatalf("expected persisted config to contain 'miao', got %+v", reloaded)
	}
}

func TestWorkspaceRegistry_AddDuplicateAliasRejected(t *testing.T) {
	dir := t.TempDir()
	reg, _ := NewWorkspaceRegistry(filepath.Join(dir, "workspaces.yaml"))
	_ = reg.Add(WorkspaceConfig{Alias: "miao", Path: "/x", Color: "#000"})
	err := reg.Add(WorkspaceConfig{Alias: "miao", Path: "/y", Color: "#111"})
	if err == nil {
		t.Fatal("expected an error when adding a duplicate alias")
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./... -run TestWorkspaceRegistry -v`
Expected: FAIL — `WorkspaceRegistry` undefined

- [ ] **Step 3: Extend `workspace.go`**

Append to `workspace.go`:

```go
import (
	"fmt"
	"sync"
)

type WorkspaceRegistry struct {
	mu         sync.RWMutex
	workspaces []WorkspaceConfig
	configPath string
}

func NewWorkspaceRegistry(configPath string) (*WorkspaceRegistry, error) {
	ws, err := LoadWorkspaces(configPath)
	if err != nil {
		return nil, err
	}
	return &WorkspaceRegistry{workspaces: ws, configPath: configPath}, nil
}

func (r *WorkspaceRegistry) List() []WorkspaceConfig {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]WorkspaceConfig, len(r.workspaces))
	copy(out, r.workspaces)
	return out
}

func (r *WorkspaceRegistry) Add(cfg WorkspaceConfig) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	for _, w := range r.workspaces {
		if w.Alias == cfg.Alias {
			return fmt.Errorf("workspace alias %q already registered", cfg.Alias)
		}
	}

	updated := append(r.workspaces, cfg)
	if err := persistWorkspaces(r.configPath, updated); err != nil {
		return err
	}
	r.workspaces = updated
	return nil
}

func persistWorkspaces(configPath string, ws []WorkspaceConfig) error {
	f := workspacesFile{Workspaces: ws}
	data, err := yaml.Marshal(f)
	if err != nil {
		return err
	}
	if dir := filepath.Dir(configPath); dir != "." {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return err
		}
	}
	return os.WriteFile(configPath, data, 0644)
}
```

Add `"path/filepath"` to the existing `import` block at the top of `workspace.go` (alongside `os` and `gopkg.in/yaml.v3`).

- [ ] **Step 4: Run test to verify it passes**

Run: `go test ./... -run TestWorkspaceRegistry -v`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add workspace.go workspace_test.go
git commit -m "feat: add WorkspaceRegistry with hot-reload write-back and duplicate-alias guard"
```

---

### Task 15: scanner.go — tag ChangeSummary with workspace, add aggregation

**Files:**
- Modify: `scanner.go`
- Modify: `scanner_test.go`

**Interfaces:**
- Consumes: `WorkspaceConfig` (Task 13), existing `scanAllChanges(baseDir string)` (scanner.go:149-183, **left unmodified** for backward compatibility with single-`--dir` deployments)
- Produces: `ChangeSummary.Workspace string` field; `func scanWorkspaceChanges(ws WorkspaceConfig) ([]ChangeSummary, error)`; `func scanAllWorkspaces(registry []WorkspaceConfig) (all []ChangeSummary, failedAliases []string)` (aggregates, skips unreadable workspaces and returns their aliases so the HTTP layer can surface a warning — not just a server-side log)

- [ ] **Step 1: Write the failing test**

```go
// append to scanner_test.go

func TestScanWorkspaceChanges_TagsWorkspaceAlias(t *testing.T) {
	dir := t.TempDir()
	changesDir := filepath.Join(dir, "changes")
	os.MkdirAll(filepath.Join(changesDir, "my-change"), 0755)
	writeYAML(t, filepath.Join(changesDir, "my-change"), "phase: build\n")

	ws := WorkspaceConfig{Alias: "miao", Path: dir, Color: "#0063f8"}
	summaries, err := scanWorkspaceChanges(ws)
	if err != nil {
		t.Fatal(err)
	}
	if len(summaries) != 1 || summaries[0].Workspace != "miao" {
		t.Fatalf("expected 1 change tagged with workspace 'miao', got %+v", summaries)
	}
}

func TestScanAllWorkspaces_AggregatesAndSkipsUnreadable(t *testing.T) {
	dir := t.TempDir()
	changesDir := filepath.Join(dir, "changes")
	os.MkdirAll(filepath.Join(changesDir, "my-change"), 0755)
	writeYAML(t, filepath.Join(changesDir, "my-change"), "phase: build\n")

	registry := []WorkspaceConfig{
		{Alias: "good", Path: dir, Color: "#0063f8"},
		{Alias: "broken", Path: "/nonexistent/path/does/not/exist", Color: "#dc2626"},
	}
	summaries, failed := scanAllWorkspaces(registry)
	if len(summaries) != 1 {
		t.Fatalf("expected 1 change from the readable workspace, got %d", len(summaries))
	}
	if summaries[0].Workspace != "good" {
		t.Fatalf("expected workspace tag 'good', got %q", summaries[0].Workspace)
	}
	if len(failed) != 1 || failed[0] != "broken" {
		t.Fatalf("expected failedAliases=['broken'], got %+v", failed)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./... -run 'TestScanWorkspaceChanges|TestScanAllWorkspaces' -v`
Expected: FAIL — `scanWorkspaceChanges`/`scanAllWorkspaces` undefined, `ChangeSummary.Workspace` undefined

- [ ] **Step 3: Add `Workspace` field to `ChangeSummary`**

In `scanner.go`, add `Workspace string \`json:"workspace,omitempty"\`` to the `ChangeSummary` struct (from Task 3) — insert it after the `Name` field.

- [ ] **Step 4: Write `scanWorkspaceChanges` and `scanAllWorkspaces`**

Add to `scanner.go` (after `scanAllChanges`, scanner.go:149-183):

```go
func scanWorkspaceChanges(ws WorkspaceConfig) ([]ChangeSummary, error) {
	summaries, err := scanAllChanges(ws.Path)
	if err != nil {
		return nil, err
	}
	for i := range summaries {
		summaries[i].Workspace = ws.Alias
	}
	return summaries, nil
}

// scanAllWorkspaces aggregates changes across every registered workspace.
// An unreadable workspace path is skipped (logged) rather than failing the
// whole aggregation — one bad path shouldn't take down the dashboard.
// failedAliases is returned (not just logged) so the HTTP layer can surface
// a warning banner to the frontend (design doc error table requirement).
func scanAllWorkspaces(registry []WorkspaceConfig) (all []ChangeSummary, failedAliases []string) {
	for _, ws := range registry {
		summaries, err := scanWorkspaceChanges(ws)
		if err != nil {
			log.Printf("workspace %q (%s) unreadable, skipping: %v", ws.Alias, ws.Path, err)
			failedAliases = append(failedAliases, ws.Alias)
			continue
		}
		all = append(all, summaries...)
	}
	return all, failedAliases
}
```

Add `"log"` to the `import` block at the top of `scanner.go`.

- [ ] **Step 5: Run test to verify it passes**

Run: `go test ./... -run 'TestScanWorkspaceChanges|TestScanAllWorkspaces' -v`
Expected: PASS (2 tests)

- [ ] **Step 6: Full regression check**

Run: `go build ./... && go test ./...`
Expected: builds clean, all tests from Tasks 2, 3, 13, 14, 15 pass

- [ ] **Step 7: Commit**

```bash
git add scanner.go scanner_test.go
git commit -m "feat: tag ChangeSummary with workspace alias, add fault-tolerant aggregation"
```

---

### Task 16: main.go — /api/workspaces + workspace-aware /api/changes

**Files:**
- Modify: `main.go`
- Create: `main_workspace_test.go`

**Interfaces:**
- Consumes: `WorkspaceRegistry` (Task 14), `scanAllWorkspaces` (Task 15)
- Produces: `GET /api/workspaces`, `POST /api/workspaces`, `GET /api/changes?workspace=<alias>` (filter), `GET /api/changes` (aggregates all registered workspaces; **falls back to the existing single-`--dir` `scanAllChanges` behavior when no workspace is registered**, preserving current deployments)

- [ ] **Step 1: Write the failing test**

```go
// main_workspace_test.go
package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestHandleListWorkspaces_Empty(t *testing.T) {
	dir := t.TempDir()
	reg, _ := NewWorkspaceRegistry(filepath.Join(dir, "workspaces.yaml"))

	req := httptest.NewRequest("GET", "/api/workspaces", nil)
	w := httptest.NewRecorder()
	handleListWorkspaces(w, req, reg)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var got []WorkspaceConfig
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if len(got) != 0 {
		t.Fatalf("expected empty list, got %+v", got)
	}
}

func TestHandleAddWorkspace_PersistsAndReturns201(t *testing.T) {
	dir := t.TempDir()
	reg, _ := NewWorkspaceRegistry(filepath.Join(dir, "workspaces.yaml"))

	body, _ := json.Marshal(WorkspaceConfig{Alias: "miao", Path: "/x/miao/openspec", Color: "#0063f8"})
	req := httptest.NewRequest("POST", "/api/workspaces", bytes.NewReader(body))
	w := httptest.NewRecorder()
	handleAddWorkspace(w, req, reg)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
	}
	if len(reg.List()) != 1 {
		t.Fatalf("expected registry to contain 1 workspace, got %d", len(reg.List()))
	}
}

func TestHandleListChanges_FallsBackToSingleDirWhenNoWorkspacesRegistered(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, "changes", "my-change"), 0755)
	writeYAML(t, filepath.Join(dir, "changes", "my-change"), "phase: build\n")

	reg, _ := NewWorkspaceRegistry(filepath.Join(t.TempDir(), "workspaces.yaml")) // empty registry

	req := httptest.NewRequest("GET", "/api/changes", nil)
	w := httptest.NewRecorder()
	handleListChangesMultiWorkspace(w, req, dir, reg)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var body struct {
		Changes []ChangeSummary `json:"changes"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if len(body.Changes) != 1 {
		t.Fatalf("expected fallback to single-dir scan to find 1 change, got %d", len(body.Changes))
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./... -run 'TestHandleListWorkspaces|TestHandleAddWorkspace|TestHandleListChangesMultiWorkspace' -v`
Expected: FAIL — handlers undefined

- [ ] **Step 3: Write the handlers in `main.go`**

Add near `handleListChanges` (main.go:93):

```go
func handleListWorkspaces(w http.ResponseWriter, r *http.Request, reg *WorkspaceRegistry) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(reg.List())
}

func handleAddWorkspace(w http.ResponseWriter, r *http.Request, reg *WorkspaceRegistry) {
	var cfg WorkspaceConfig
	if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil {
		writeJSONError(w, "invalid body", 400)
		return
	}
	if cfg.Alias == "" || cfg.Path == "" {
		writeJSONError(w, "alias and path are required", 400)
		return
	}
	if err := reg.Add(cfg); err != nil {
		writeJSONError(w, err.Error(), 409)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(cfg)
}

// handleListChangesMultiWorkspace replaces handleListChanges as the /api/changes
// entry point. If no workspaces are registered, it preserves the original
// single-directory behavior (scanAllChanges against the --dir flag value) so
// existing deployments keep working without a workspaces.yaml migration.
func handleListChangesMultiWorkspace(w http.ResponseWriter, r *http.Request, defaultDir string, reg *WorkspaceRegistry) {
	w.Header().Set("Content-Type", "application/json")

	registered := reg.List()
	if len(registered) == 0 {
		dir := getDir(r, defaultDir)
		changes, err := scanAllChanges(dir)
		if err != nil {
			writeJSONError(w, err.Error(), 500)
			return
		}
		json.NewEncoder(w).Encode(map[string]interface{}{"changes": changes, "dir": dir})
		return
	}

	filterAlias := r.URL.Query().Get("workspace")
	changes, failedWorkspaces := scanAllWorkspaces(registered)
	if filterAlias != "" {
		var filtered []ChangeSummary
		for _, c := range changes {
			if c.Workspace == filterAlias {
				filtered = append(filtered, c)
			}
		}
		changes = filtered
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"changes": changes, "failedWorkspaces": failedWorkspaces})
}
```

- [ ] **Step 4: Wire the new routes**

Find the route registration block in `main()` (main.go:30-34) and add, alongside the existing `mux.HandleFunc("/api/changes", ...)`:

```go
	reg, err := NewWorkspaceRegistry(filepath.Join(os.Getenv("HOME"), ".comet-panel", "workspaces.yaml"))
	if err != nil {
		log.Fatalf("workspace registry: %v", err)
	}

	mux.HandleFunc("/api/workspaces", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			handleListWorkspaces(w, r, reg)
		case http.MethodPost:
			handleAddWorkspace(w, r, reg)
		default:
			writeJSONError(w, "method not allowed", 405)
		}
	})
```

Replace the body of the existing `mux.HandleFunc("/api/changes", ...)` (main.go:30-32) to call `handleListChangesMultiWorkspace(w, r, dir, reg)` instead of the old `handleListChanges(w, r, dir)`.

- [ ] **Step 5: Run test to verify it passes**

Run: `go test ./... -run 'TestHandleListWorkspaces|TestHandleAddWorkspace|TestHandleListChangesMultiWorkspace' -v`
Expected: PASS (3 tests)

- [ ] **Step 6: Full regression + manual smoke test**

Run: `go build ./... && go test ./...`
Expected: clean build, all tests pass (Tasks 2,3,13,14,15,16)

Run manually: `./comet-panel --port 8989 --dir ../miao/openspec &` then `curl -s localhost:8989/api/changes | head -c 200` — expect the existing `{"changes":[...` shape (no `workspaces.yaml` exists yet, so fallback path is exercised). `kill %1` when done.

- [ ] **Step 7: Commit**

```bash
git add main.go main_workspace_test.go
git commit -m "feat: add /api/workspaces endpoints, workspace-aware /api/changes with single-dir fallback"
```

---

### Task 17: React — workspace filter chips + add-workspace form

**Files:**
- Create: `web/src/components/WorkspaceChips.tsx`
- Create: `web/src/components/WorkspaceChips.test.tsx`
- Modify: `web/src/App.tsx`
- Modify: `web/src/api/client.ts` and `web/src/api/client.test.ts`

**Interfaces:**
- Consumes: `GET /api/workspaces`, `POST /api/workspaces` (Task 16)
- Produces: `<WorkspaceChips workspaces={WorkspaceConfig[]} active={string|null} onSelect={(alias:string|null)=>void} onAdd={(cfg:WorkspaceConfig)=>Promise<void>} />`

- [ ] **Step 1: Write the failing test**

```tsx
// web/src/components/WorkspaceChips.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { WorkspaceChips } from './WorkspaceChips'

const workspaces = [
  { alias: 'miao', path: '/x/miao', color: '#0063f8' },
  { alias: 'wan2_2_deploy', path: '/x/wan', color: '#16a34a' },
]

describe('WorkspaceChips', () => {
  it('renders an "全部" chip plus one chip per workspace', () => {
    render(<WorkspaceChips workspaces={workspaces} active={null} onSelect={vi.fn()} onAdd={vi.fn()} />)
    expect(screen.getByText('全部')).toBeTruthy()
    expect(screen.getByText('miao')).toBeTruthy()
    expect(screen.getByText('wan2_2_deploy')).toBeTruthy()
  })

  it('calls onSelect with the alias when a chip is clicked, null for 全部', () => {
    const onSelect = vi.fn()
    render(<WorkspaceChips workspaces={workspaces} active={null} onSelect={onSelect} onAdd={vi.fn()} />)
    fireEvent.click(screen.getByText('miao'))
    expect(onSelect).toHaveBeenCalledWith('miao')
    fireEvent.click(screen.getByText('全部'))
    expect(onSelect).toHaveBeenCalledWith(null)
  })

  it('opens an add-workspace form and submits it', async () => {
    const onAdd = vi.fn().mockResolvedValue(undefined)
    render(<WorkspaceChips workspaces={workspaces} active={null} onSelect={vi.fn()} onAdd={onAdd} />)
    fireEvent.click(screen.getByText('+ 添加'))
    fireEvent.change(screen.getByTestId('add-ws-alias'), { target: { value: 'new-ws' } })
    fireEvent.change(screen.getByTestId('add-ws-path'), { target: { value: '/x/new' } })
    fireEvent.click(screen.getByTestId('add-ws-submit'))
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ alias: 'new-ws', path: '/x/new' }))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/components/WorkspaceChips.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Add `WorkspaceConfig` type and `fetchWorkspaces`/`addWorkspace` to the API client**

Append to `web/src/api/types.ts`:

```typescript
export interface WorkspaceConfig {
  alias: string
  path: string
  color: string
}
```

Append to `web/src/api/client.ts`:

```typescript
import type { WorkspaceConfig, ChangesResponse } from './types'

export async function fetchWorkspaces(): Promise<WorkspaceConfig[]> {
  const res = await fetch('/api/workspaces')
  if (!res.ok) throw new Error(`fetchWorkspaces failed: ${res.status}`)
  return res.json()
}

export async function addWorkspace(cfg: WorkspaceConfig): Promise<void> {
  const res = await fetch('/api/workspaces', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cfg),
  })
  if (!res.ok) throw new Error(`addWorkspace failed: ${res.status}`)
}

// Distinct from fetchChanges() (Task 4), which discards the envelope's
// metadata for callers that only need the bare array. This variant keeps
// failedWorkspaces so App.tsx can surface the "workspace unreadable"
// warning banner (design doc error-handling table requirement).
export async function fetchChangesWithMeta(): Promise<ChangesResponse> {
  const res = await fetch('/api/changes')
  if (!res.ok) throw new Error(`fetchChangesWithMeta failed: ${res.status}`)
  return res.json()
}
```

- [ ] **Step 4: Write `web/src/components/WorkspaceChips.tsx`**

```tsx
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

  async function submit() {
    await onAdd({ alias, path, color: '#0063f8' })
    setAdding(false)
    setAlias('')
    setPath('')
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
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
        <div className="flex items-center gap-2">
          <input
            data-testid="add-ws-alias"
            placeholder="alias"
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            className="border rounded px-2 py-1 text-xs"
          />
          <input
            data-testid="add-ws-path"
            placeholder="path"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            className="border rounded px-2 py-1 text-xs"
          />
          <button data-testid="add-ws-submit" onClick={submit} className="text-xs text-[#0063f8]">
            提交
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd web && npx vitest run src/components/WorkspaceChips.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 6: Wire into `App.tsx`, add unreadable-workspace warning banner**

In `web/src/App.tsx`, add state and wiring:

```tsx
import { fetchWorkspaces, addWorkspace, fetchChangesWithMeta } from './api/client'
import type { WorkspaceConfig } from './api/types'
import { WorkspaceChips } from './components/WorkspaceChips'

// inside App():
const [workspaces, setWorkspaces] = useState<WorkspaceConfig[]>([])
const [activeWorkspace, setActiveWorkspace] = useState<string | null>(null)
const [failedWorkspaces, setFailedWorkspaces] = useState<string[]>([])

useEffect(() => {
  fetchWorkspaces().then(setWorkspaces).catch(() => setWorkspaces([]))
}, [])

// Replaces the plain fetchChanges() call from Task 11 — this variant also
// captures failedWorkspaces so the warning banner below has real data.
// The existing `useEffect(() => { fetchChanges().then(setChanges)... }, [])`
// from Task 11 should be updated to use this function instead:
useEffect(() => {
  fetchChangesWithMeta()
    .then((r) => {
      setChanges(r.changes)
      setFailedWorkspaces(r.failedWorkspaces ?? [])
    })
    .catch(() => setChanges([]))
}, [])

const visibleChanges = activeWorkspace
  ? changes.filter((c) => c.workspace === activeWorkspace)
  : changes

// render, above <ChangeExplorer>:
{failedWorkspaces.length > 0 && (
  <div data-testid="workspace-warning-banner" className="text-xs bg-[#fdeeee] text-[#dc2626] rounded p-2 mb-2">
    ⚠ 以下 workspace 无法读取，已跳过：{failedWorkspaces.join(', ')}
  </div>
)}
<WorkspaceChips
  workspaces={workspaces}
  active={activeWorkspace}
  onSelect={setActiveWorkspace}
  onAdd={async (cfg) => {
    await addWorkspace(cfg)
    setWorkspaces((prev) => [...prev, cfg])
  }}
/>
```

Replace the `changes` passed to `<KpiCards>` and `<ChangeExplorer>` with `visibleChanges`.

- [ ] **Step 7: Run full frontend suite**

Run: `cd web && npm run test`
Expected: all suites pass

- [ ] **Step 8: Commit**

```bash
git add web/src/components/WorkspaceChips.tsx web/src/components/WorkspaceChips.test.tsx web/src/App.tsx web/src/api/
git commit -m "feat: add workspace filter chips and add-workspace form, wire into App"
```

---

## >>> REVIEW GATE A <<<

**Stop here.** Dispatch @oracle to review all commits from Foundation + Phase① + Phase② (Tasks 1-17) before proceeding to Phase③. Oracle should specifically check:
- React rewrite scope didn't balloon beyond the design doc (chat migration fidelity, 8 components match spec)
- Responsive layout actually satisfies the hard requirement (Task 11/12's Playwright assertions are real coverage, not superficial)
- Task 16's single-dir fallback genuinely preserves existing deployment behavior (no regression for users who never create `workspaces.yaml`)

---

## Phase③a — Wiki Core (Component Index + Graph + Backlinks)

### Task 18: wiki/scan.go — Component struct + file scanner + frontmatter parser

**Files:**
- Create: `wiki/scan.go`
- Create: `wiki/scan_test.go`
- Create: `wiki/wiki.go` (shared types: `ComponentType`, `Component`, `Edge`)
- Modify: `go.mod` (add `github.com/yuin/goldmark`, used starting Task 20)

**Interfaces:**
- Produces: `type Component struct{...}`, `type ComponentType string` with the 8 constants from the design doc, `func ScanComponents(workspaceRoot, workspaceAlias string) ([]Component, error)`

- [ ] **Step 1: Add the goldmark dependency now (used by Task 20, added here to keep `go.mod` changes grouped with the new `wiki` package's first commit)**

Run: `go get github.com/yuin/goldmark`

- [ ] **Step 2: Write the failing test**

```go
// wiki/scan_test.go
package wiki

import (
	"os"
	"path/filepath"
	"testing"
)

func TestScanComponents_FindsMarkdownFilesAndExtractsTitle(t *testing.T) {
	root := t.TempDir()
	changesDir := filepath.Join(root, "changes", "my-change")
	os.MkdirAll(changesDir, 0755)
	os.WriteFile(filepath.Join(changesDir, "proposal.md"), []byte("# My Change Proposal\n\nBody text.\n"), 0644)
	os.WriteFile(filepath.Join(changesDir, "design.md"), []byte("# Design Doc\n\nBody.\n"), 0644)

	components, err := ScanComponents(root, "miao")
	if err != nil {
		t.Fatal(err)
	}
	if len(components) != 2 {
		t.Fatalf("expected 2 components, got %d: %+v", len(components), components)
	}

	byTitle := map[string]Component{}
	for _, c := range components {
		byTitle[c.Title] = c
	}
	prop, ok := byTitle["My Change Proposal"]
	if !ok {
		t.Fatalf("expected a component titled 'My Change Proposal', got %+v", components)
	}
	if prop.Type != TypeProposal {
		t.Fatalf("expected TypeProposal, got %v", prop.Type)
	}
	if prop.Workspace != "miao" {
		t.Fatalf("expected workspace 'miao', got %q", prop.Workspace)
	}
}

func TestScanComponents_FallsBackToFilenameWhenNoHeading(t *testing.T) {
	root := t.TempDir()
	// must be under a recognized directory ("specs") to be classified —
	// classifyPath does not recognize arbitrary directory names like "docs"
	dir := filepath.Join(root, "docs", "superpowers", "specs")
	os.MkdirAll(dir, 0755)
	os.WriteFile(filepath.Join(dir, "notes.md"), []byte("no heading here, just text\n"), 0644)

	components, err := ScanComponents(root, "miao")
	if err != nil {
		t.Fatal(err)
	}
	if len(components) != 1 || components[0].Title != "notes" {
		t.Fatalf("expected fallback title 'notes', got %+v", components)
	}
}

func TestScanComponents_SkipsMalformedFileWithoutAbortingWholeScan(t *testing.T) {
	root := t.TempDir()
	dir := filepath.Join(root, "docs", "superpowers", "specs")
	os.MkdirAll(dir, 0755)
	// malformed frontmatter: unclosed YAML flow sequence — yaml.Unmarshal will error
	os.WriteFile(filepath.Join(dir, "broken.md"), []byte("---\ntags: [unclosed\n---\n# Broken\n"), 0644)
	os.WriteFile(filepath.Join(dir, "good.md"), []byte("# Good Doc\n"), 0644)

	components, err := ScanComponents(root, "miao")
	if err != nil {
		t.Fatal(err)
	}
	if len(components) != 1 || components[0].Title != "Good Doc" {
		t.Fatalf("expected the malformed file to be skipped and the good file still indexed, got %+v", components)
	}
}

func TestScanComponents_ParsesFrontmatter(t *testing.T) {
	root := t.TempDir()
	dir := filepath.Join(root, "docs", "superpowers", "specs")
	os.MkdirAll(dir, 0755)
	content := "---\ntags: [rx101, secure-boot]\nreviewed: true\n---\n# Titled Doc\n"
	os.WriteFile(filepath.Join(dir, "doc.md"), []byte(content), 0644)

	components, err := ScanComponents(root, "miao")
	if err != nil {
		t.Fatal(err)
	}
	if len(components) != 1 {
		t.Fatalf("expected 1 component, got %d", len(components))
	}
	fm := components[0].Frontmatter
	if fm["reviewed"] != true {
		t.Fatalf("expected frontmatter reviewed=true, got %+v", fm)
	}
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `go test ./wiki/... -v`
Expected: FAIL — package `wiki` has no Go files yet

- [ ] **Step 4: Write `wiki/wiki.go`**

```go
package wiki

import "time"

type ComponentType string

const (
	TypeChange   ComponentType = "change"
	TypeProposal ComponentType = "proposal"
	TypeDesign   ComponentType = "design"
	TypeTasks    ComponentType = "tasks"
	TypeSpec     ComponentType = "spec"
	TypePlan     ComponentType = "plan"
	TypeArtifact ComponentType = "artifact"
	TypeDiagram  ComponentType = "diagram"
)

type Component struct {
	ID          string // absolute, canonicalized path — stable identity
	Type        ComponentType
	Title       string
	Path        string
	Workspace   string
	Frontmatter map[string]any
	UpdatedAt   time.Time
}

type Edge struct {
	From, To string // Component.ID
	Kind     string // references | implements | generates | traces-back | supersedes
	Source   string // "yaml" (highest confidence) | "markdown-link" | "slug-match" (lint-only)
}
```

- [ ] **Step 5: Write `wiki/scan.go`**

```go
package wiki

import (
	"bufio"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
)

// ScanComponents walks workspaceRoot for markdown files and builds a
// Component for each one. Classification by ComponentType happens by
// filename convention (proposal.md, design.md, tasks.md) or by directory
// convention (docs/superpowers/specs/, docs/superpowers/plans/,
// docs/superpowers/artifacts/, diagrams/) — anything else is skipped.
//
// A single malformed file must not abort the whole scan (design doc error
// table: "遇到格式错误的 markdown → 跳过+记录日志，不中断整体索引"). Only a
// directory-read failure from filepath.Walk itself propagates as a real
// error; a per-file parse failure is logged and skipped.
func ScanComponents(workspaceRoot, workspaceAlias string) ([]Component, error) {
	var components []Component

	err := filepath.Walk(workspaceRoot, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err // directory traversal error — genuinely fatal, propagate
		}
		if info.IsDir() || !strings.HasSuffix(path, ".md") {
			return nil
		}
		typ := classifyPath(path)
		if typ == "" {
			return nil
		}
		absPath, err := filepath.Abs(path)
		if err != nil {
			log.Printf("wiki scan: skipping %s, could not resolve absolute path: %v", path, err)
			return nil
		}
		fm, title, err := parseFrontmatterAndTitle(path)
		if err != nil {
			log.Printf("wiki scan: skipping %s, parse error: %v", path, err)
			return nil
		}
		components = append(components, Component{
			ID:          absPath,
			Type:        typ,
			Title:       title,
			Path:        absPath,
			Workspace:   workspaceAlias,
			Frontmatter: fm,
			UpdatedAt:   info.ModTime(),
		})
		return nil
	})
	return components, err
}

func classifyPath(path string) ComponentType {
	base := filepath.Base(path)
	switch base {
	case "proposal.md":
		return TypeProposal
	case "design.md":
		return TypeDesign
	case "tasks.md":
		return TypeTasks
	}
	switch {
	case strings.Contains(path, string(filepath.Separator)+"specs"+string(filepath.Separator)):
		return TypeSpec
	case strings.Contains(path, string(filepath.Separator)+"plans"+string(filepath.Separator)):
		return TypePlan
	case strings.Contains(path, string(filepath.Separator)+"artifacts"+string(filepath.Separator)):
		return TypeArtifact
	case strings.Contains(path, string(filepath.Separator)+"diagrams"+string(filepath.Separator)):
		return TypeDiagram
	}
	return ""
}

// parseFrontmatterAndTitle reads a leading "---\n...\n---\n" YAML block (if
// present) and the first "# heading" line. Falls back to the filename
// (without extension) when no heading is found.
func parseFrontmatterAndTitle(path string) (map[string]any, string, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, "", err
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	fm := map[string]any{}
	title := ""

	firstLine := true
	inFrontmatter := false
	var fmLines []string

	for scanner.Scan() {
		line := scanner.Text()
		if firstLine && strings.TrimSpace(line) == "---" {
			inFrontmatter = true
			firstLine = false
			continue
		}
		firstLine = false
		if inFrontmatter {
			if strings.TrimSpace(line) == "---" {
				inFrontmatter = false
				if err := yaml.Unmarshal([]byte(strings.Join(fmLines, "\n")), &fm); err != nil {
					return nil, "", err
				}
				continue
			}
			fmLines = append(fmLines, line)
			continue
		}
		if title == "" && strings.HasPrefix(strings.TrimSpace(line), "# ") {
			title = strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(line), "# "))
		}
	}
	if err := scanner.Err(); err != nil {
		return nil, "", err
	}
	if title == "" {
		title = strings.TrimSuffix(filepath.Base(path), ".md")
	}
	return fm, title, nil
}

var _ = time.Now // silence unused import if UpdatedAt wiring changes later
```

- [ ] **Step 6: Run test to verify it passes**

Run: `go test ./wiki/... -v`
Expected: PASS (4 tests)

- [ ] **Step 7: Commit**

```bash
git add wiki/ go.mod go.sum
git commit -m "feat: add wiki package with Component model, file scanner, frontmatter parser"
```

---

### Task 19: Extract path resolution to `internal/pathresolve` + wiki layer-1 YAML links

**Why this task exists:** `wiki` is a separate Go package and **cannot import package `main`** (a hard Go language restriction — `main` packages cannot be imported). The design doc requires wiki's link extraction to reuse `makeArtifactExt`'s already-fixed path resolution logic rather than re-deriving it. The only correct way to share this logic across both packages is to extract it into a third, importable package. This task does that extraction first, then builds layer-1 (`.comet.yaml`-declared) link extraction on top of it.

**Files:**
- Create: `internal/pathresolve/pathresolve.go`
- Create: `internal/pathresolve/pathresolve_test.go`
- Modify: `scanner.go` (make `makeArtifactExt` call the extracted function instead of inlining the logic)
- Create: `wiki/links.go`
- Create: `wiki/links_test.go`

**Interfaces:**
- Produces: `pathresolve.ResolveArtifactPath(ref, root, changeDir string) string`; `wiki.ExtractYAMLLinks(changeDir, root string) ([]Edge, error)`

- [ ] **Step 1: Write the failing test for the extracted resolver**

```go
// internal/pathresolve/pathresolve_test.go
package pathresolve

import "testing"

func TestResolveArtifactPath_BareFilenameIsChangeDirRelative(t *testing.T) {
	got := ResolveArtifactPath("design.md", "/root/miao", "/root/miao/openspec/changes/my-change")
	want := "/root/miao/openspec/changes/my-change/design.md"
	if got != want {
		t.Fatalf("got %q, want %q", got, want)
	}
}

func TestResolveArtifactPath_PathWithSlashIsRootRelative(t *testing.T) {
	got := ResolveArtifactPath("docs/superpowers/specs/x-design.md", "/root/miao", "/root/miao/openspec/changes/my-change")
	want := "/root/miao/docs/superpowers/specs/x-design.md"
	if got != want {
		t.Fatalf("got %q, want %q", got, want)
	}
}

func TestResolveArtifactPath_EmptyRefReturnsEmpty(t *testing.T) {
	if got := ResolveArtifactPath("", "/root", "/root/x"); got != "" {
		t.Fatalf("expected empty string, got %q", got)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/pathresolve/... -v`
Expected: FAIL — package doesn't exist yet

- [ ] **Step 3: Write `internal/pathresolve/pathresolve.go`**

```go
// Package pathresolve holds the artifact-path resolution rule shared by
// scanner.go (main package) and wiki (separate package, cannot import main).
// A bare filename (no "/") is relative to the change directory; a path
// containing "/" is relative to the workspace root — matching the
// .comet.yaml convention for design_doc/plan/verification_report fields.
package pathresolve

import (
	"path/filepath"
	"strings"
)

func ResolveArtifactPath(ref, root, changeDir string) string {
	if ref == "" {
		return ""
	}
	if !strings.Contains(ref, "/") {
		return filepath.Join(changeDir, ref)
	}
	return filepath.Join(root, ref)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `go test ./internal/pathresolve/... -v`
Expected: PASS (3 tests)

- [ ] **Step 5: Update `makeArtifactExt` in `scanner.go` to call the extracted function**

Replace the body of `makeArtifactExt` (scanner.go:399-412) with:

```go
func makeArtifactExt(file, label, ref, root, changeDir string) ArtifactInfo {
	p := pathresolve.ResolveArtifactPath(ref, root, changeDir)
	if p == "" {
		return ArtifactInfo{File: file, Label: label, Exists: false}
	}
	return ArtifactInfo{File: file, Label: label, Exists: fileExists(p), Path: p, External: true}
}
```

Add the import (replace `module comet-ui` in `go.mod` with whatever the actual module path is — check `go.mod` line 1 for the exact string, then import `"<module-path>/internal/pathresolve"`):

```go
import (
	// ...existing imports...
	"comet-ui/internal/pathresolve"
)
```

- [ ] **Step 6: Regression-check scanner.go still passes its existing tests**

Run: `go build ./... && go test ./...`
Expected: clean build, all Task 3/13/14/15/16 tests still pass — `makeArtifactExt`'s behavior is unchanged, only its implementation moved

- [ ] **Step 7: Write the failing test for wiki layer-1 links**

```go
// wiki/links_test.go
package wiki

import (
	"os"
	"path/filepath"
	"testing"
)

func TestExtractYAMLLinks_DesignDocAndPlan(t *testing.T) {
	root := t.TempDir()
	changeDir := filepath.Join(root, "openspec", "changes", "my-change")
	os.MkdirAll(changeDir, 0755)
	os.WriteFile(filepath.Join(changeDir, ".comet.yaml"), []byte(`
design_doc: docs/superpowers/specs/2026-07-09-my-change-design.md
plan: docs/superpowers/plans/2026-07-09-my-change.md
`), 0644)

	edges, err := ExtractYAMLLinks(changeDir, root)
	if err != nil {
		t.Fatal(err)
	}
	if len(edges) != 2 {
		t.Fatalf("expected 2 edges, got %d: %+v", len(edges), edges)
	}
	for _, e := range edges {
		if e.Source != "yaml" {
			t.Fatalf("expected Source=yaml, got %q", e.Source)
		}
		if e.From != filepath.Join(changeDir, ".comet.yaml") {
			t.Fatalf("unexpected From: %q", e.From)
		}
	}
}

func TestExtractYAMLLinks_BareFilenameResolvesToChangeDir(t *testing.T) {
	root := t.TempDir()
	changeDir := filepath.Join(root, "openspec", "changes", "my-change")
	os.MkdirAll(changeDir, 0755)
	os.WriteFile(filepath.Join(changeDir, ".comet.yaml"), []byte("design_doc: design.md\n"), 0644)

	edges, err := ExtractYAMLLinks(changeDir, root)
	if err != nil {
		t.Fatal(err)
	}
	if len(edges) != 1 || edges[0].To != filepath.Join(changeDir, "design.md") {
		t.Fatalf("expected bare filename resolved to change dir, got %+v", edges)
	}
}
```

- [ ] **Step 8: Run test to verify it fails**

Run: `go test ./wiki/... -run TestExtractYAMLLinks -v`
Expected: FAIL — `ExtractYAMLLinks` undefined

- [ ] **Step 9: Write `wiki/links.go`**

```go
package wiki

import (
	"os"
	"path/filepath"
	"strings"

	"comet-ui/internal/pathresolve"
)

// ExtractYAMLLinks reads .comet.yaml in changeDir and builds Edges for its
// design_doc/plan/verification_report references — the highest-confidence
// link layer, reusing the exact path resolution rule scanner.go uses.
func ExtractYAMLLinks(changeDir, root string) ([]Edge, error) {
	yamlPath := filepath.Join(changeDir, ".comet.yaml")
	data, err := os.ReadFile(yamlPath)
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	var edges []Edge
	fieldToKind := map[string]string{
		"design_doc":           "implements",
		"plan":                 "implements",
		"verification_report":  "references",
	}
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		parts := strings.SplitN(line, ":", 2)
		if len(parts) != 2 {
			continue
		}
		key := strings.TrimSpace(parts[0])
		val := strings.TrimSpace(parts[1])
		kind, ok := fieldToKind[key]
		if !ok || val == "" || val == "null" || val == "~" {
			continue
		}
		target := pathresolve.ResolveArtifactPath(val, root, changeDir)
		edges = append(edges, Edge{
			From:   yamlPath,
			To:     target,
			Kind:   kind,
			Source: "yaml",
		})
	}
	return edges, nil
}
```

- [ ] **Step 10: Run test to verify it passes**

Run: `go test ./wiki/... -run TestExtractYAMLLinks -v`
Expected: PASS (2 tests)

- [ ] **Step 11: Commit**

```bash
git add internal/pathresolve/ scanner.go wiki/links.go wiki/links_test.go
git commit -m "refactor: extract path resolution to internal/pathresolve, add wiki layer-1 YAML links"
```

---

### Task 20: wiki/links.go — goldmark AST markdown-link extraction (layer 2)

**Files:**
- Modify: `wiki/links.go`
- Modify: `wiki/links_test.go`

**Interfaces:**
- Consumes: `github.com/yuin/goldmark` (added in Task 18), `Component` (Task 18)
- Produces: `func ExtractMarkdownLinks(component Component) ([]Edge, error)` — resolves relative links against the **markdown file's own directory** (standard markdown semantics), using Go's `filepath.Join`+`filepath.Clean` (which correctly collapses multi-level `../`, unlike a hand-rolled implementation)

- [ ] **Step 1: Write the failing test — including the multi-level `../` regression case from this session's real bug**

```go
// append to wiki/links_test.go

func TestExtractMarkdownLinks_ResolvesRelativeToFileDir(t *testing.T) {
	root := t.TempDir()
	specDir := filepath.Join(root, "docs", "superpowers", "specs")
	diagramDir := filepath.Join(root, "diagrams", "my-topic")
	os.MkdirAll(specDir, 0755)
	os.MkdirAll(diagramDir, 0755)
	os.WriteFile(filepath.Join(diagramDir, "01-component.svg"), []byte("<svg/>"), 0644)

	specFile := filepath.Join(specDir, "2026-07-09-my-topic-design.md")
	// this is the EXACT bug pattern fixed earlier: 3 levels up from specs/ reaches
	// the workspace root where diagrams/ lives (specs -> superpowers -> docs -> root)
	os.WriteFile(specFile, []byte("![diagram](../../../diagrams/my-topic/01-component.svg)\n"), 0644)

	comp := Component{ID: specFile, Path: specFile, Type: TypeSpec, Workspace: "miao"}
	edges, err := ExtractMarkdownLinks(comp)
	if err != nil {
		t.Fatal(err)
	}
	if len(edges) != 1 {
		t.Fatalf("expected 1 edge, got %d: %+v", len(edges), edges)
	}
	want := filepath.Join(diagramDir, "01-component.svg")
	if edges[0].To != want {
		t.Fatalf("got To=%q, want %q (multi-level ../ must collapse correctly)", edges[0].To, want)
	}
	if edges[0].Source != "markdown-link" {
		t.Fatalf("expected Source=markdown-link, got %q", edges[0].Source)
	}
}

func TestExtractMarkdownLinks_SkipsExternalAndAnchorLinks(t *testing.T) {
	root := t.TempDir()
	f := filepath.Join(root, "doc.md")
	os.WriteFile(f, []byte("[ext](https://example.com/x) [anchor](#section) [rel](./other.md)\n"), 0644)
	os.WriteFile(filepath.Join(root, "other.md"), []byte("# Other\n"), 0644)

	comp := Component{ID: f, Path: f, Type: TypeSpec, Workspace: "miao"}
	edges, err := ExtractMarkdownLinks(comp)
	if err != nil {
		t.Fatal(err)
	}
	if len(edges) != 1 {
		t.Fatalf("expected only the 1 relative-file link to survive, got %d: %+v", len(edges), edges)
	}
	if edges[0].To != filepath.Join(root, "other.md") {
		t.Fatalf("unexpected target: %q", edges[0].To)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./wiki/... -run TestExtractMarkdownLinks -v`
Expected: FAIL — `ExtractMarkdownLinks` undefined

- [ ] **Step 3: Append to `wiki/links.go`**

```go
import (
	// ...existing imports from Task 19...
	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/ast"
	"github.com/yuin/goldmark/text"
)

// ExtractMarkdownLinks parses [text](path) links out of a component's
// source file and resolves relative paths against the file's own
// directory — standard markdown semantics. filepath.Join + filepath.Clean
// correctly collapse multi-level "../" (Go's stdlib does this right; do
// not hand-roll this resolution).
func ExtractMarkdownLinks(component Component) ([]Edge, error) {
	data, err := os.ReadFile(component.Path)
	if err != nil {
		return nil, err
	}

	md := goldmark.New()
	doc := md.Parser().Parse(text.NewReader(data))

	var edges []Edge
	fileDir := filepath.Dir(component.Path)

	ast.Walk(doc, func(n ast.Node, entering bool) (ast.WalkStatus, error) {
		if !entering {
			return ast.WalkContinue, nil
		}
		link, ok := n.(*ast.Link)
		if !ok {
			return ast.WalkContinue, nil
		}
		dest := string(link.Destination)
		if dest == "" || strings.HasPrefix(dest, "http://") || strings.HasPrefix(dest, "https://") ||
			strings.HasPrefix(dest, "#") || strings.HasPrefix(dest, "mailto:") {
			return ast.WalkContinue, nil
		}
		target := filepath.Clean(filepath.Join(fileDir, dest))
		edges = append(edges, Edge{
			From:   component.Path,
			To:     target,
			Kind:   "references",
			Source: "markdown-link",
		})
		return ast.WalkContinue, nil
	})

	return edges, nil
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `go test ./wiki/... -run TestExtractMarkdownLinks -v`
Expected: PASS (2 tests, including the multi-level `../` regression case)

- [ ] **Step 5: Full wiki package regression check**

Run: `go build ./... && go test ./...`
Expected: clean build, all tests pass

- [ ] **Step 6: Commit**

```bash
git add wiki/links.go wiki/links_test.go
git commit -m "feat: add wiki layer-2 markdown-link extraction via goldmark AST, with multi-level ../ regression test"
```

---

### Task 21: wiki/links.go — artifact naming-convention links (layer 3)

**Files:**
- Modify: `wiki/links.go`
- Modify: `wiki/links_test.go`

**Interfaces:**
- Consumes: `Component` (Task 18)
- Produces: `func ExtractArtifactConventionLinks(tasksComponent Component, artifactsDir string) ([]Edge, error)` — links each `task-NN-*.md` in `artifactsDir` back to the `tasks.md` component it belongs to, by filename convention alone (no content parsing)

- [ ] **Step 1: Write the failing test**

```go
// append to wiki/links_test.go

func TestExtractArtifactConventionLinks_MatchesByTaskNumber(t *testing.T) {
	root := t.TempDir()
	tasksPath := filepath.Join(root, "tasks.md")
	os.WriteFile(tasksPath, []byte("- [ ] Task 1\n- [ ] Task 2\n"), 0644)

	artifactsDir := filepath.Join(root, "artifacts", "my-plan")
	os.MkdirAll(artifactsDir, 0755)
	os.WriteFile(filepath.Join(artifactsDir, "task-01-implementer.md"), []byte("x"), 0644)
	os.WriteFile(filepath.Join(artifactsDir, "task-01-oracle-review.md"), []byte("x"), 0644)
	os.WriteFile(filepath.Join(artifactsDir, "task-02-implementer.md"), []byte("x"), 0644)

	tasksComp := Component{ID: tasksPath, Path: tasksPath, Type: TypeTasks, Workspace: "miao"}
	edges, err := ExtractArtifactConventionLinks(tasksComp, artifactsDir)
	if err != nil {
		t.Fatal(err)
	}
	if len(edges) != 3 {
		t.Fatalf("expected 3 edges (one per artifact file), got %d: %+v", len(edges), edges)
	}
	for _, e := range edges {
		if e.Kind != "generates" || e.Source != "markdown-link" {
			// Note: reuses "markdown-link" confidence tier — convention-derived,
			// same high-confidence bucket as layer 2, distinct from "yaml".
			t.Fatalf("unexpected edge shape: %+v", e)
		}
	}
}

func TestExtractArtifactConventionLinks_MissingDirReturnsNoEdges(t *testing.T) {
	root := t.TempDir()
	tasksPath := filepath.Join(root, "tasks.md")
	tasksComp := Component{ID: tasksPath, Path: tasksPath, Type: TypeTasks, Workspace: "miao"}
	edges, err := ExtractArtifactConventionLinks(tasksComp, filepath.Join(root, "nonexistent"))
	if err != nil {
		t.Fatal(err)
	}
	if len(edges) != 0 {
		t.Fatalf("expected 0 edges, got %d", len(edges))
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./wiki/... -run TestExtractArtifactConventionLinks -v`
Expected: FAIL — function undefined

- [ ] **Step 3: Append to `wiki/links.go`**

```go
var taskArtifactRe = regexp.MustCompile(`^task-(\d+)-`)

// ExtractArtifactConventionLinks links every task-NN-*.md file in
// artifactsDir back to tasksComponent, by filename convention alone (no
// content parsing needed — the number in "task-NN-" is authoritative).
func ExtractArtifactConventionLinks(tasksComponent Component, artifactsDir string) ([]Edge, error) {
	entries, err := os.ReadDir(artifactsDir)
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	var edges []Edge
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".md") {
			continue
		}
		if !taskArtifactRe.MatchString(e.Name()) {
			continue
		}
		edges = append(edges, Edge{
			From:   tasksComponent.Path,
			To:     filepath.Join(artifactsDir, e.Name()),
			Kind:   "generates",
			Source: "markdown-link",
		})
	}
	return edges, nil
}
```

Add `"regexp"` to the `import` block in `wiki/links.go`.

- [ ] **Step 4: Run test to verify it passes**

Run: `go test ./wiki/... -run TestExtractArtifactConventionLinks -v`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add wiki/links.go wiki/links_test.go
git commit -m "feat: add wiki layer-3 artifact naming-convention links"
```

---

### Task 22: wiki/graph.go — in-memory graph + backlinks query

**Files:**
- Create: `wiki/graph.go`
- Create: `wiki/graph_test.go`

**Interfaces:**
- Consumes: `[]Component`, `[]Edge` (Tasks 18-21)
- Produces: `type Graph struct{...}`, `func BuildGraph(components []Component, edges []Edge) *Graph`, `func (g *Graph) Component(id string) (Component, bool)`, `func (g *Graph) Forward(id string) []Edge`, `func (g *Graph) Backlinks(id string) []Edge`

- [ ] **Step 1: Write the failing test**

```go
// wiki/graph_test.go
package wiki

import "testing"

func TestBuildGraph_ForwardAndBacklinks(t *testing.T) {
	a := Component{ID: "a", Title: "A"}
	b := Component{ID: "b", Title: "B"}
	components := []Component{a, b}
	edges := []Edge{{From: "a", To: "b", Kind: "implements", Source: "yaml"}}

	g := BuildGraph(components, edges)

	got, ok := g.Component("a")
	if !ok || got.Title != "A" {
		t.Fatalf("expected to find component 'a', got %+v ok=%v", got, ok)
	}

	fwd := g.Forward("a")
	if len(fwd) != 1 || fwd[0].To != "b" {
		t.Fatalf("expected 1 forward edge a->b, got %+v", fwd)
	}

	back := g.Backlinks("b")
	if len(back) != 1 || back[0].From != "a" {
		t.Fatalf("expected 1 backlink from a, got %+v", back)
	}

	if len(g.Backlinks("a")) != 0 {
		t.Fatalf("expected no backlinks for 'a'")
	}
}

func TestBuildGraph_UnknownComponentReturnsFalse(t *testing.T) {
	g := BuildGraph(nil, nil)
	if _, ok := g.Component("nonexistent"); ok {
		t.Fatal("expected ok=false for unknown component")
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./wiki/... -run TestBuildGraph -v`
Expected: FAIL — `Graph`/`BuildGraph` undefined

- [ ] **Step 3: Write `wiki/graph.go`**

```go
package wiki

type Graph struct {
	components map[string]Component
	forward    map[string][]Edge
	backward   map[string][]Edge
}

func BuildGraph(components []Component, edges []Edge) *Graph {
	g := &Graph{
		components: make(map[string]Component, len(components)),
		forward:    make(map[string][]Edge),
		backward:   make(map[string][]Edge),
	}
	for _, c := range components {
		g.components[c.ID] = c
	}
	for _, e := range edges {
		g.forward[e.From] = append(g.forward[e.From], e)
		g.backward[e.To] = append(g.backward[e.To], e)
	}
	return g
}

func (g *Graph) Component(id string) (Component, bool) {
	c, ok := g.components[id]
	return c, ok
}

func (g *Graph) Forward(id string) []Edge {
	return g.forward[id]
}

func (g *Graph) Backlinks(id string) []Edge {
	return g.backward[id]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `go test ./wiki/... -run TestBuildGraph -v`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add wiki/graph.go wiki/graph_test.go
git commit -m "feat: add wiki in-memory graph with forward/backlink queries"
```

---

### Task 23: wiki/api.go — index/component/search/rebuild HTTP handlers

**Files:**
- Create: `wiki/api.go`
- Create: `wiki/api_test.go`
- Create: `wiki/index.go` (orchestrates scan + link extraction + graph build into one `BuildIndex` call)
- Modify: `main.go` (mount `/api/wiki/*` routes)

**Interfaces:**
- Consumes: `ScanComponents` (Task 18), `ExtractYAMLLinks`/`ExtractMarkdownLinks`/`ExtractArtifactConventionLinks` (Tasks 19-21), `BuildGraph` (Task 22)
- Produces: `func BuildIndex(workspaces []WorkspaceConfig, indexCacheDir string) (*Graph, error)`; `GET /api/wiki/index`, `GET /api/wiki/component/:id`, `GET /api/wiki/search?q=`, `POST /api/wiki/rebuild`

- [ ] **Step 1: Write the failing test for `BuildIndex`**

```go
// wiki/index_test.go
package wiki

import (
	"os"
	"path/filepath"
	"testing"
)

func TestBuildIndex_EndToEnd(t *testing.T) {
	root := t.TempDir()
	changeDir := filepath.Join(root, "openspec", "changes", "my-change")
	os.MkdirAll(changeDir, 0755)
	os.WriteFile(filepath.Join(changeDir, "proposal.md"), []byte("# Proposal\n"), 0644)
	os.WriteFile(filepath.Join(changeDir, ".comet.yaml"), []byte("design_doc: design.md\n"), 0644)
	os.WriteFile(filepath.Join(changeDir, "design.md"), []byte("# Design\n"), 0644)

	ws := []WorkspaceConfig{{Alias: "miao", Path: root, Color: "#0063f8"}}
	g, err := BuildIndex(ws, "")
	if err != nil {
		t.Fatal(err)
	}

	designPath := filepath.Join(changeDir, "design.md")
	if _, ok := g.Component(designPath); !ok {
		t.Fatalf("expected design.md to be indexed as a component")
	}
	back := g.Backlinks(designPath)
	if len(back) != 1 {
		t.Fatalf("expected 1 backlink to design.md (from .comet.yaml), got %+v", back)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./wiki/... -run TestBuildIndex_EndToEnd -v`
Expected: FAIL — `BuildIndex` undefined

- [ ] **Step 3: Write `wiki/index.go`**

```go
package wiki

import (
	"encoding/json"
	"log"
	"os"
	"path/filepath"
	"strings"
)

// BuildIndex scans every registered workspace, extracts all three link
// layers, and returns a queryable Graph. Individual file errors are
// skipped (logged by the caller via the returned error slice contract —
// kept minimal here per YAGNI; a malformed file should not abort the
// whole index per the design doc's error-handling table).
//
// After building, the graph is also persisted to indexCacheDir as
// index.json + graph.json (design doc: "索引存储：.wiki/index.json +
// .wiki/graph.json"). These files are a debugging/inspection artifact —
// BuildIndex always rebuilds from source on every call; nothing reads
// these files back in this plan. indexCacheDir="" skips persistence
// (used by tests that don't care about the on-disk artifact).
func BuildIndex(workspaces []WorkspaceConfig, indexCacheDir string) (*Graph, error) {
	var allComponents []Component
	var allEdges []Edge

	for _, ws := range workspaces {
		components, err := ScanComponents(ws.Path, ws.Alias)
		if err != nil {
			continue // skip unreadable workspace, matches scanner.go's scanAllWorkspaces behavior
		}
		allComponents = append(allComponents, components...)

		changesDir := filepath.Join(ws.Path, "openspec", "changes")
		entries, err := os.ReadDir(changesDir)
		if err != nil {
			continue
		}
		for _, e := range entries {
			if !e.IsDir() {
				continue
			}
			changeDir := filepath.Join(changesDir, e.Name())
			yamlEdges, _ := ExtractYAMLLinks(changeDir, ws.Path)
			allEdges = append(allEdges, yamlEdges...)

			tasksPath := filepath.Join(changeDir, "tasks.md")
			if _, err := os.Stat(tasksPath); err == nil {
				tasksComp := Component{ID: tasksPath, Path: tasksPath, Type: TypeTasks, Workspace: ws.Alias}
				// artifacts dir convention: docs/superpowers/artifacts/<plan-slug>/
				// plan slug is derived the same way scanner.go does (trim .md from basename).
				// Reuses yamlEdges computed above — no need to call ExtractYAMLLinks twice.
				for _, e := range yamlEdges {
					if strings.Contains(e.To, "plans") {
						slug := strings.TrimSuffix(filepath.Base(e.To), ".md")
						artifactsDir := filepath.Join(ws.Path, "docs", "superpowers", "artifacts", slug)
						artEdges, _ := ExtractArtifactConventionLinks(tasksComp, artifactsDir)
						allEdges = append(allEdges, artEdges...)
					}
				}
			}
		}

		for _, c := range components {
			mdEdges, err := ExtractMarkdownLinks(c)
			if err != nil {
				continue
			}
			allEdges = append(allEdges, mdEdges...)
		}
	}

	g := BuildGraph(allComponents, allEdges)
	if indexCacheDir != "" {
		persistIndexCache(indexCacheDir, allComponents, allEdges) // best-effort, errors logged not returned
	}
	return g, nil
}

func persistIndexCache(dir string, components []Component, edges []Edge) {
	if err := os.MkdirAll(dir, 0755); err != nil {
		log.Printf("wiki: could not create index cache dir %s: %v", dir, err)
		return
	}
	if data, err := json.MarshalIndent(components, "", "  "); err == nil {
		os.WriteFile(filepath.Join(dir, "index.json"), data, 0644)
	}
	if data, err := json.MarshalIndent(edges, "", "  "); err == nil {
		os.WriteFile(filepath.Join(dir, "graph.json"), data, 0644)
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `go test ./wiki/... -run TestBuildIndex_EndToEnd -v`
Expected: PASS

- [ ] **Step 5: Write the failing test for the HTTP handlers**

```go
// wiki/api_test.go
package wiki

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestHandleWikiComponent_ReturnsBacklinks(t *testing.T) {
	root := t.TempDir()
	changeDir := filepath.Join(root, "openspec", "changes", "my-change")
	os.MkdirAll(changeDir, 0755)
	os.WriteFile(filepath.Join(changeDir, ".comet.yaml"), []byte("design_doc: design.md\n"), 0644)
	os.WriteFile(filepath.Join(changeDir, "design.md"), []byte("# Design\n"), 0644)

	g, _ := BuildIndex([]WorkspaceConfig{{Alias: "miao", Path: root}}, "")
	api := NewAPI(g)

	designPath := filepath.Join(changeDir, "design.md")
	req := httptest.NewRequest("GET", "/api/wiki/component/x?id="+designPath, nil)
	w := httptest.NewRecorder()
	api.HandleComponent(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
}

func TestHandleWikiComponent_NotFoundReturns404(t *testing.T) {
	g := BuildGraph(nil, nil)
	api := NewAPI(g)
	req := httptest.NewRequest("GET", "/api/wiki/component/x?id=/nonexistent", nil)
	w := httptest.NewRecorder()
	api.HandleComponent(w, req)
	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", w.Code)
	}
}
```

- [ ] **Step 6: Run test to verify it fails**

Run: `go test ./wiki/... -run TestHandleWikiComponent -v`
Expected: FAIL — `NewAPI` undefined

- [ ] **Step 7: Write `wiki/api.go`**

```go
package wiki

import (
	"encoding/json"
	"net/http"
	"strings"
	"sync"
)

type API struct {
	mu            sync.RWMutex
	graph         *Graph
	ws            []WorkspaceConfig
	indexCacheDir string
}

func NewAPI(g *Graph) *API {
	return &API{graph: g}
}

func NewAPIWithWorkspaces(ws []WorkspaceConfig, indexCacheDir string) (*API, error) {
	g, err := BuildIndex(ws, indexCacheDir)
	if err != nil {
		return nil, err
	}
	return &API{graph: g, ws: ws, indexCacheDir: indexCacheDir}, nil
}

type componentResponse struct {
	Component Component `json:"component"`
	Forward   []Edge    `json:"forward"`
	Backlinks []Edge    `json:"backlinks"`
}

func (a *API) HandleComponent(w http.ResponseWriter, r *http.Request) {
	a.mu.RLock()
	defer a.mu.RUnlock()

	id := r.URL.Query().Get("id")
	c, ok := a.graph.Component(id)
	if !ok {
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{"error": "component not found"})
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(componentResponse{
		Component: c,
		Forward:   a.graph.Forward(id),
		Backlinks: a.graph.Backlinks(id),
	})
}

func (a *API) HandleIndex(w http.ResponseWriter, r *http.Request) {
	a.mu.RLock()
	defer a.mu.RUnlock()
	w.Header().Set("Content-Type", "application/json")
	all := make([]Component, 0)
	for id := range a.graph.components {
		c, _ := a.graph.Component(id)
		all = append(all, c)
	}
	json.NewEncoder(w).Encode(all)
}

func (a *API) HandleSearch(w http.ResponseWriter, r *http.Request) {
	a.mu.RLock()
	defer a.mu.RUnlock()
	q := strings.ToLower(r.URL.Query().Get("q"))
	w.Header().Set("Content-Type", "application/json")
	var matches []Component
	for id := range a.graph.components {
		c, _ := a.graph.Component(id)
		if strings.Contains(strings.ToLower(c.Title), q) {
			matches = append(matches, c)
		}
	}
	json.NewEncoder(w).Encode(matches)
}

func (a *API) HandleRebuild(w http.ResponseWriter, r *http.Request) {
	newGraph, err := BuildIndex(a.ws, a.indexCacheDir)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}
	a.mu.Lock()
	a.graph = newGraph
	a.mu.Unlock()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "rebuilt"})
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `go test ./wiki/... -run TestHandleWikiComponent -v`
Expected: PASS (2 tests)

- [ ] **Step 9: Mount the routes in `main.go`**

Add near the `/api/workspaces` registration in `main()`:

```go
	wikiCacheDir := filepath.Join(os.Getenv("HOME"), ".comet-panel", "wiki")
	wikiAPI, err := wiki.NewAPIWithWorkspaces(reg.List(), wikiCacheDir)
	if err != nil {
		log.Printf("wiki index build failed (non-fatal, dashboard still serves): %v", err)
		wikiAPI, _ = wiki.NewAPIWithWorkspaces(nil, wikiCacheDir)
	}
	mux.HandleFunc("/api/wiki/index", wikiAPI.HandleIndex)
	mux.HandleFunc("/api/wiki/component/", wikiAPI.HandleComponent)
	mux.HandleFunc("/api/wiki/search", wikiAPI.HandleSearch)
	mux.HandleFunc("/api/wiki/rebuild", wikiAPI.HandleRebuild)
```

Add `"comet-ui/wiki"` to `main.go`'s import block.

- [ ] **Step 10: Full regression check**

Run: `go build ./... && go test ./...`
Expected: clean build, all tests across every task so far pass

- [ ] **Step 11: Commit**

```bash
git add wiki/index.go wiki/index_test.go wiki/api.go wiki/api_test.go main.go
git commit -m "feat: add wiki BuildIndex orchestration and /api/wiki/* HTTP handlers"
```

---

### Task 24: React — Backlinks sidebar panel

**Files:**
- Create: `web/src/components/BacklinksPanel.tsx`
- Create: `web/src/components/BacklinksPanel.test.tsx`
- Modify: `web/src/api/types.ts`, `web/src/api/client.ts`
- Modify: `web/src/components/ChangeDetail.tsx`

**Interfaces:**
- Consumes: `GET /api/wiki/component/:id` (Task 23)
- Produces: `<BacklinksPanel componentId={string} />`

- [ ] **Step 1: Write the failing test**

```tsx
// web/src/components/BacklinksPanel.test.tsx
import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { BacklinksPanel } from './BacklinksPanel'

afterEach(() => vi.restoreAllMocks())

describe('BacklinksPanel', () => {
  it('fetches and lists backlinks for the given component', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        component: { id: '/x/design.md', title: 'Design Doc' },
        forward: [],
        backlinks: [{ from: '/x/.comet.yaml', to: '/x/design.md', kind: 'implements', source: 'yaml' }],
      }),
    } as Response)

    render(<BacklinksPanel componentId="/x/design.md" />)
    await waitFor(() => expect(screen.getByText(/1 处引用/)).toBeTruthy())
  })

  it('shows an empty state with zero backlinks', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ component: { id: '/x', title: 'X' }, forward: [], backlinks: [] }),
    } as Response)
    render(<BacklinksPanel componentId="/x" />)
    await waitFor(() => expect(screen.getByText('暂无反向引用')).toBeTruthy())
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/components/BacklinksPanel.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Add types + client function**

Append to `web/src/api/types.ts`:

```typescript
export interface WikiEdge {
  from: string
  to: string
  kind: string
  source: string
}

export interface WikiComponentResponse {
  component: { id: string; title: string }
  forward: WikiEdge[]
  backlinks: WikiEdge[]
}
```

Append to `web/src/api/client.ts`:

```typescript
import type { WikiComponentResponse } from './types'

export async function fetchWikiComponent(id: string): Promise<WikiComponentResponse> {
  const res = await fetch('/api/wiki/component/x?id=' + encodeURIComponent(id))
  if (!res.ok) throw new Error(`fetchWikiComponent failed: ${res.status}`)
  return res.json()
}
```

- [ ] **Step 4: Write `web/src/components/BacklinksPanel.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { fetchWikiComponent } from '../api/client'
import type { WikiEdge } from '../api/types'

export function BacklinksPanel({ componentId }: { componentId: string }) {
  const [backlinks, setBacklinks] = useState<WikiEdge[] | null>(null)

  useEffect(() => {
    fetchWikiComponent(componentId)
      .then((r) => setBacklinks(r.backlinks))
      .catch(() => setBacklinks([]))
  }, [componentId])

  if (backlinks === null) return null

  return (
    <div className="text-xs">
      <div className="text-[#6e6e73] mb-2">
        {backlinks.length > 0 ? `${backlinks.length} 处引用` : '暂无反向引用'}
      </div>
      {backlinks.map((e, i) => (
        <div key={i} className="text-[#0063f8] truncate">
          {e.from}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd web && npx vitest run src/components/BacklinksPanel.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 6: Wire into `ChangeDetail.tsx`**

Add to `web/src/components/ChangeDetail.tsx`, below the existing stepper/donut row:

```tsx
import { BacklinksPanel } from './BacklinksPanel'

// inside the returned JSX, after the stepper/donut flex row:
<BacklinksPanel componentId={change.name} />
```

(Note: this passes `change.name` as a placeholder identifier for Phase① `ChangeSummary` objects, which don't yet carry a wiki `Component.ID` absolute path. Wiring the *real* absolute path requires the change's `.comet.yaml` path, available once Task 23's index exposes a name→ID lookup — deferred to Phase③b's Lint panel work in Task 29, which needs the same lookup. Tracked, not silently dropped.)

- [ ] **Step 7: Run full frontend suite**

Run: `cd web && npm run test`
Expected: all suites pass

- [ ] **Step 8: Commit**

```bash
git add web/src/components/BacklinksPanel.tsx web/src/components/BacklinksPanel.test.tsx web/src/components/ChangeDetail.tsx web/src/api/
git commit -m "feat: add BacklinksPanel, wire into ChangeDetail"
```

---

## Phase③b — Wiki Additive Layers (Lint / Graph View / LLM Summaries / Retrieval Stub)

### Task 25: wiki/lint.go — orphan, dead-link, duplicate, task-artifact-missing rules

**Scope decision — layer-4 "slug fuzzy-match" is explicitly descoped, not silently dropped:** the design doc's link-layer table lists a 4th layer ("正文裸提及 change 名（模糊匹配）| 低 | 不自动建边，仅作为 Lint 建议"). Implementing it requires each component to retain full file content for substring scanning — `Component` currently stores only `Title` (Task 18), not body text, by design (keeps 330+ components cheap to hold in memory). Given the design doc itself rates this layer's confidence as "低" (lowest of the four) and its output as advisory-only, this plan does not implement it. If corpus growth or real usage later shows this gap matters, add a `LintSuspectedMentions` function that re-reads file content at lint time (a deliberate, bounded disk-I/O cost, not a change to the in-memory `Graph` model) — flagged here for @oracle's Gate B review to confirm this tradeoff is acceptable, not to silently approve it.

**Files:**
- Create: `wiki/lint.go`
- Create: `wiki/lint_test.go`

**Interfaces:**
- Consumes: `Graph` (Task 22)
- Produces: `type LintIssue struct{...}`, `func (g *Graph) Lint() []LintIssue` covering all 4 rules from the design doc

- [ ] **Step 1: Write the failing tests**

```go
// wiki/lint_test.go
package wiki

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLint_OrphanDetection(t *testing.T) {
	orphan := Component{ID: "orphan", Title: "Orphan", Type: TypeSpec}
	linked := Component{ID: "linked", Title: "Linked", Type: TypeSpec}
	root := Component{ID: "root", Title: "Root Change", Type: TypeChange}

	g := BuildGraph(
		[]Component{orphan, linked, root},
		[]Edge{{From: "root", To: "linked", Kind: "references", Source: "yaml"}},
	)

	issues := g.Lint()
	found := false
	for _, i := range issues {
		if i.Rule == "orphan" && i.ComponentID == "orphan" {
			found = true
		}
		if i.ComponentID == "root" && i.Rule == "orphan" {
			t.Fatal("root-level change nodes must be excluded from orphan detection")
		}
	}
	if !found {
		t.Fatal("expected an orphan issue for the disconnected component")
	}
}

func TestLint_DeadLinkDetection(t *testing.T) {
	src := Component{ID: "src", Title: "Src", Type: TypeSpec}
	g := BuildGraph(
		[]Component{src},
		[]Edge{{From: "src", To: "/does/not/exist.md", Kind: "references", Source: "markdown-link"}},
	)
	issues := g.Lint()
	found := false
	for _, i := range issues {
		if i.Rule == "dead-link" && i.ComponentID == "src" {
			found = true
		}
	}
	if !found {
		t.Fatal("expected a dead-link issue for an edge pointing to an unindexed component")
	}
}

func TestLint_DuplicateTitleDetection(t *testing.T) {
	a := Component{ID: "a", Title: "Same Title", Type: TypeSpec}
	b := Component{ID: "b", Title: "Same Title", Type: TypeSpec}
	g := BuildGraph([]Component{a, b}, nil)
	issues := g.Lint()
	found := false
	for _, i := range issues {
		if i.Rule == "duplicate" {
			found = true
		}
	}
	if !found {
		t.Fatal("expected a duplicate-title issue")
	}
}

func TestLint_TaskArtifactMissing_CountsPerTaskNumberNotRawFileCount(t *testing.T) {
	root := t.TempDir()
	tasksPath := filepath.Join(root, "tasks.md")
	// 2 tasks declared
	os.WriteFile(tasksPath, []byte("- [ ] Task 1\n- [ ] Task 2\n"), 0644)

	artifactsDir := filepath.Join(root, "artifacts", "my-plan")
	os.MkdirAll(artifactsDir, 0755)
	// task 1 has TWO role files (implementer + oracle-review) — must not be
	// miscounted as "2 tasks done" when task 2 has ZERO files (the exact bug
	// fixed in the design doc's self-review: raw file count vs task count).
	os.WriteFile(filepath.Join(artifactsDir, "task-01-implementer.md"), []byte("x"), 0644)
	os.WriteFile(filepath.Join(artifactsDir, "task-01-oracle-review.md"), []byte("x"), 0644)

	tasksComp := Component{ID: tasksPath, Path: tasksPath, Type: TypeTasks}
	g := BuildGraph([]Component{tasksComp}, nil)

	issues := g.LintTaskArtifacts(tasksComp, artifactsDir, 2) // 2 tasks total
	if len(issues) != 1 {
		t.Fatalf("expected exactly 1 missing-task issue (task 2), got %d: %+v", len(issues), issues)
	}
	if issues[0].Detail != "task 2" {
		t.Fatalf("expected the missing task to be identified as 'task 2', got %+v", issues[0])
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./wiki/... -run TestLint -v`
Expected: FAIL — `LintIssue`/`Lint`/`LintTaskArtifacts` undefined

- [ ] **Step 3: Write `wiki/lint.go`**

```go
package wiki

import (
	"fmt"
	"os"
	"regexp"
)

type LintIssue struct {
	Rule        string `json:"rule"` // orphan | dead-link | duplicate | task-artifact-missing
	ComponentID string `json:"componentId"`
	Detail      string `json:"detail"`
}

// Lint runs the orphan, dead-link, and duplicate-title checks. Root-level
// "change" components are excluded from orphan detection — they're
// expected to be hubs with only outgoing edges in small workspaces.
func (g *Graph) Lint() []LintIssue {
	var issues []LintIssue

	for id, c := range g.components {
		if c.Type == TypeChange {
			continue
		}
		if len(g.forward[id]) == 0 && len(g.backward[id]) == 0 {
			issues = append(issues, LintIssue{Rule: "orphan", ComponentID: id, Detail: c.Title})
		}
	}

	for from, edges := range g.forward {
		for _, e := range edges {
			if _, ok := g.components[e.To]; !ok {
				issues = append(issues, LintIssue{
					Rule: "dead-link", ComponentID: from,
					Detail: fmt.Sprintf("link to %s has no matching component", e.To),
				})
			}
		}
	}

	byTitle := map[string][]string{}
	for id, c := range g.components {
		byTitle[c.Title] = append(byTitle[c.Title], id)
	}
	for title, ids := range byTitle {
		if len(ids) > 1 {
			for _, id := range ids {
				issues = append(issues, LintIssue{Rule: "duplicate", ComponentID: id, Detail: title})
			}
		}
	}

	return issues
}

var artifactTaskNumRe = regexp.MustCompile(`^task-(\d+)-`)

// LintTaskArtifacts checks, per task number (1..totalTasks), whether at
// least one task-NN-*.md file exists in artifactsDir. It counts distinct
// task numbers present, NOT raw file count — a task with multiple role
// files (implementer, oracle-review, ...) must not inflate the count.
func (g *Graph) LintTaskArtifacts(tasksComponent Component, artifactsDir string, totalTasks int) []LintIssue {
	present := map[int]bool{}
	entries, err := os.ReadDir(artifactsDir)
	if err == nil {
		for _, e := range entries {
			m := artifactTaskNumRe.FindStringSubmatch(e.Name())
			if m == nil {
				continue
			}
			var n int
			fmt.Sscanf(m[1], "%d", &n)
			present[n] = true
		}
	}

	var issues []LintIssue
	for n := 1; n <= totalTasks; n++ {
		if !present[n] {
			issues = append(issues, LintIssue{
				Rule:        "task-artifact-missing",
				ComponentID: tasksComponent.ID,
				Detail:      fmt.Sprintf("task %d", n),
			})
		}
	}
	return issues
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `go test ./wiki/... -run TestLint -v`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add wiki/lint.go wiki/lint_test.go
git commit -m "feat: add wiki lint engine (orphan, dead-link, duplicate, task-artifact-missing)"
```

---

### Task 26: /api/wiki/lint endpoint + React Lint panel

**Files:**
- Modify: `wiki/api.go`
- Modify: `wiki/api_test.go`
- Modify: `main.go`
- Create: `web/src/components/LintPanel.tsx`
- Create: `web/src/components/LintPanel.test.tsx`
- Modify: `web/src/api/types.ts`, `web/src/api/client.ts`

**Interfaces:**
- Consumes: `(*Graph).Lint()` (Task 25)
- Produces: `GET /api/wiki/lint`, `<LintPanel />`

- [ ] **Step 1: Write the failing Go test**

```go
// append to wiki/api_test.go

func TestHandleLint_ReturnsIssues(t *testing.T) {
	orphan := Component{ID: "orphan", Title: "Orphan", Type: TypeSpec}
	g := BuildGraph([]Component{orphan}, nil)
	api := NewAPI(g)

	req := httptest.NewRequest("GET", "/api/wiki/lint", nil)
	w := httptest.NewRecorder()
	api.HandleLint(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var issues []LintIssue
	json.NewDecoder(w.Body).Decode(&issues)
	if len(issues) == 0 {
		t.Fatal("expected at least the orphan issue")
	}
}
```

Add `"encoding/json"` to the test file's imports if not already present.

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./wiki/... -run TestHandleLint -v`
Expected: FAIL — `HandleLint` undefined

- [ ] **Step 3: Add `HandleLint` to `wiki/api.go`**

```go
func (a *API) HandleLint(w http.ResponseWriter, r *http.Request) {
	a.mu.RLock()
	defer a.mu.RUnlock()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(a.graph.Lint())
}
```

- [ ] **Step 4: Mount the route in `main.go`**

Add alongside the other `/api/wiki/*` registrations:

```go
	mux.HandleFunc("/api/wiki/lint", wikiAPI.HandleLint)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `go test ./wiki/... -run TestHandleLint -v`
Expected: PASS

- [ ] **Step 6: Write the failing React test**

```tsx
// web/src/components/LintPanel.test.tsx
import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { LintPanel } from './LintPanel'

afterEach(() => vi.restoreAllMocks())

describe('LintPanel', () => {
  it('lists lint issues grouped by rule', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => [
        { rule: 'orphan', componentId: '/x/orphan.md', detail: 'Orphan' },
        { rule: 'dead-link', componentId: '/x/src.md', detail: 'broken' },
      ],
    } as Response)
    render(<LintPanel />)
    await waitFor(() => expect(screen.getByText(/orphan/)).toBeTruthy())
    await waitFor(() => expect(screen.getByText(/dead-link/)).toBeTruthy())
  })

  it('shows a clean state with zero issues', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => [] } as Response)
    render(<LintPanel />)
    await waitFor(() => expect(screen.getByText('未发现问题')).toBeTruthy())
  })
})
```

- [ ] **Step 7: Run test to verify it fails**

Run: `cd web && npx vitest run src/components/LintPanel.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 8: Add types + client function, write the component**

Append to `web/src/api/types.ts`:

```typescript
export interface LintIssue {
  rule: string
  componentId: string
  detail: string
}
```

Append to `web/src/api/client.ts`:

```typescript
import type { LintIssue } from './types'

export async function fetchLintIssues(): Promise<LintIssue[]> {
  const res = await fetch('/api/wiki/lint')
  if (!res.ok) throw new Error(`fetchLintIssues failed: ${res.status}`)
  return res.json()
}
```

Write `web/src/components/LintPanel.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { fetchLintIssues } from '../api/client'
import type { LintIssue } from '../api/types'

export function LintPanel() {
  const [issues, setIssues] = useState<LintIssue[] | null>(null)

  useEffect(() => {
    fetchLintIssues().then(setIssues).catch(() => setIssues([]))
  }, [])

  if (issues === null) return null
  if (issues.length === 0) {
    return <div className="text-xs text-[#6e6e73]">未发现问题</div>
  }

  return (
    <div className="space-y-1 text-xs">
      {issues.map((i, idx) => (
        <div key={idx} className="flex gap-2">
          <span className="text-[#c47a06] font-mono">{i.rule}</span>
          <span className="text-[#6e6e73] truncate">{i.detail}</span>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `cd web && npx vitest run src/components/LintPanel.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 10: Commit**

```bash
git add wiki/api.go wiki/api_test.go main.go web/src/components/LintPanel.tsx web/src/components/LintPanel.test.tsx web/src/api/
git commit -m "feat: add /api/wiki/lint endpoint and LintPanel component"
```

---

### Task 27: React — WikiGraph component (Cytoscape.js)

**Files:**
- Create: `web/src/components/WikiGraph.tsx`
- Create: `web/src/components/WikiGraph.test.tsx`
- Modify: `web/package.json` (add `cytoscape`, `@types/cytoscape`)
- Modify: `web/src/api/types.ts`, `web/src/api/client.ts`

**Interfaces:**
- Consumes: `GET /api/wiki/index` (Task 23)
- Produces: `<WikiGraph />` — force-directed graph, nodes colored by `ComponentType`, click navigates via `onNodeClick`

- [ ] **Step 1: Add the dependency**

```json
// Add to web/package.json dependencies:
"cytoscape": "^3.30.2"
// Add to devDependencies:
"@types/cytoscape": "^3.21.1"
```

Run: `cd web && npm install`

- [ ] **Step 2: Write the failing test**

```tsx
// web/src/components/WikiGraph.test.tsx
import { render, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { WikiGraph } from './WikiGraph'

afterEach(() => vi.restoreAllMocks())

describe('WikiGraph', () => {
  it('fetches components and renders a container for cytoscape to mount into', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => [
        { id: '/x/a.md', type: 'spec', title: 'A', path: '/x/a.md', workspace: 'miao' },
        { id: '/x/b.md', type: 'plan', title: 'B', path: '/x/b.md', workspace: 'miao' },
      ],
    } as Response)
    const onNodeClick = vi.fn()
    const { container } = render(<WikiGraph onNodeClick={onNodeClick} />)
    await waitFor(() => expect(container.querySelector('[data-testid="wiki-graph-canvas"]')).toBeTruthy())
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd web && npx vitest run src/components/WikiGraph.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 4: Add `WikiComponent` type + `fetchWikiIndex`, write `WikiGraph.tsx`**

Append to `web/src/api/types.ts`:

```typescript
export interface WikiComponent {
  id: string
  type: string
  title: string
  path: string
  workspace: string
}
```

Append to `web/src/api/client.ts`:

```typescript
import type { WikiComponent } from './types'

export async function fetchWikiIndex(): Promise<WikiComponent[]> {
  const res = await fetch('/api/wiki/index')
  if (!res.ok) throw new Error(`fetchWikiIndex failed: ${res.status}`)
  return res.json()
}
```

Write `web/src/components/WikiGraph.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import cytoscape from 'cytoscape'
import { fetchWikiIndex } from '../api/client'
import type { WikiComponent } from '../api/types'

const TYPE_COLORS: Record<string, string> = {
  change: '#0063f8',
  proposal: '#4A6FA5',
  design: '#509863',
  tasks: '#c47a06',
  spec: '#718BAE',
  plan: '#16a34a',
  artifact: '#6e6e73',
  diagram: '#dc2626',
}

export function WikiGraph({ onNodeClick }: { onNodeClick: (id: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [components, setComponents] = useState<WikiComponent[]>([])

  useEffect(() => {
    fetchWikiIndex().then(setComponents).catch(() => setComponents([]))
  }, [])

  useEffect(() => {
    if (!containerRef.current || components.length === 0) return
    const cy = cytoscape({
      container: containerRef.current,
      elements: components.map((c) => ({
        data: { id: c.id, label: c.title },
        style: { 'background-color': TYPE_COLORS[c.type] ?? '#6e6e73' },
      })),
      layout: { name: 'cose' },
    })
    cy.on('tap', 'node', (evt) => onNodeClick(evt.target.id()))
    return () => cy.destroy()
  }, [components, onNodeClick])

  return <div ref={containerRef} data-testid="wiki-graph-canvas" className="w-full h-[500px]" />
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd web && npx vitest run src/components/WikiGraph.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add web/src/components/WikiGraph.tsx web/src/components/WikiGraph.test.tsx web/src/api/ web/package.json
git commit -m "feat: add WikiGraph Cytoscape.js force-directed view"
```

---

### Task 28: wiki/summarize.go — opt-in LLM summaries with mtime-based cache

**Files:**
- Create: `wiki/summarize.go`
- Create: `wiki/summarize_test.go`
- Modify: `wiki/api.go` (add `HandleSummarize`)
- Modify: `main.go` (mount `POST /api/wiki/summarize`)

**Interfaces:**
- Consumes: `chat.LoadConfig()` (`chat/config.go:31`), `provider.Get(name)` + `provider.Provider.ChatStream` (`chat/provider/provider.go:40-46`) — **reuses the exact existing Chat provider plumbing, no new LLM integration layer**
- Produces: `func Summarize(ctx context.Context, c Component, cacheDir string) (string, error)` (checks cache first, calls the active chat provider on miss, persists result)

- [ ] **Step 1: Write the failing test**

```go
// wiki/summarize_test.go
package wiki

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestSummarize_ReturnsCachedResultWhenFresh(t *testing.T) {
	root := t.TempDir()
	srcPath := filepath.Join(root, "doc.md")
	os.WriteFile(srcPath, []byte("# Doc\ncontent"), 0644)

	cacheDir := filepath.Join(root, ".wiki", "summaries")
	os.MkdirAll(cacheDir, 0755)

	comp := Component{ID: srcPath, Path: srcPath, Title: "Doc", UpdatedAt: time.Now()}
	cachePath := summaryCachePath(cacheDir, comp.ID)
	os.WriteFile(cachePath, []byte("cached summary text"), 0644)
	// ensure cache mtime is newer than source
	future := time.Now().Add(time.Hour)
	os.Chtimes(cachePath, future, future)

	got, err := Summarize(context.Background(), comp, cacheDir)
	if err != nil {
		t.Fatal(err)
	}
	if got != "cached summary text" {
		t.Fatalf("expected cached summary, got %q", got)
	}
}

func TestSummaryCachePath_IsStableAndFilenameSafe(t *testing.T) {
	p1 := summaryCachePath("/cache", "/some/path/design.md")
	p2 := summaryCachePath("/cache", "/some/path/design.md")
	if p1 != p2 {
		t.Fatal("expected the same component ID to always produce the same cache path")
	}
	if filepath.Dir(p1) != "/cache" {
		t.Fatalf("expected cache path under /cache, got %q", p1)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./wiki/... -run 'TestSummarize|TestSummaryCachePath' -v`
Expected: FAIL — `Summarize`/`summaryCachePath` undefined

- [ ] **Step 3: Write `wiki/summarize.go`**

```go
package wiki

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"

	"comet-ui/chat"
	"comet-ui/chat/provider"
)

func summaryCachePath(cacheDir, componentID string) string {
	h := sha256.Sum256([]byte(componentID))
	return filepath.Join(cacheDir, hex.EncodeToString(h[:])[:16]+".md")
}

// Summarize returns a cached LLM summary if it exists and is newer than the
// source file's mtime; otherwise it calls the currently-active chat
// provider (same config the Chat feature uses — no separate LLM plumbing)
// and persists the result.
func Summarize(ctx context.Context, c Component, cacheDir string) (string, error) {
	cachePath := summaryCachePath(cacheDir, c.ID)

	if cacheInfo, err := os.Stat(cachePath); err == nil {
		if srcInfo, err := os.Stat(c.Path); err == nil {
			if cacheInfo.ModTime().After(srcInfo.ModTime()) {
				data, err := os.ReadFile(cachePath)
				if err == nil {
					return string(data), nil
				}
			}
		}
	}

	summary, err := generateSummary(ctx, c)
	if err != nil {
		return "", err
	}

	if err := os.MkdirAll(cacheDir, 0755); err != nil {
		return "", err
	}
	if err := os.WriteFile(cachePath, []byte(summary), 0644); err != nil {
		return "", err
	}
	return summary, nil
}

func generateSummary(ctx context.Context, c Component) (string, error) {
	cfg, err := chat.LoadConfig()
	if err != nil {
		return "", err
	}
	pc, ok := cfg.Providers[cfg.ActiveProvider]
	if !ok {
		return "", fmt.Errorf("no active provider configured (active_provider=%q)", cfg.ActiveProvider)
	}
	p := provider.Get(cfg.ActiveProvider)
	if p == nil {
		return "", fmt.Errorf("provider %q not registered", cfg.ActiveProvider)
	}

	content, err := os.ReadFile(c.Path)
	if err != nil {
		return "", err
	}

	events, err := p.ChatStream(ctx, pc.APIKey, pc.APIBase, pc.Model,
		"用一段简洁的中文摘要概括这份工程文档的核心内容，不超过150字。",
		[]provider.Message{{
			Role:    "user",
			Content: []provider.ContentBlock{{Type: "text", Text: string(content)}},
		}},
		provider.ChatOptions{Temperature: pc.Temperature, MaxTokens: 300},
	)
	if err != nil {
		return "", err
	}

	var out string
	for ev := range events {
		if ev.Error != "" {
			return "", fmt.Errorf("provider error: %s", ev.Error)
		}
		out += ev.Content
	}
	return out, nil
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `go test ./wiki/... -run 'TestSummarize|TestSummaryCachePath' -v`
Expected: PASS (2 tests — the cache-hit path is what's tested without a real network call; `generateSummary`'s network path is exercised manually in Step 6, not in the automated suite, to avoid flaky/costly tests)

- [ ] **Step 5: Add the HTTP handler**

Append to `wiki/api.go`:

```go
func (a *API) HandleSummarize(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	a.mu.RLock()
	c, ok := a.graph.Component(id)
	a.mu.RUnlock()
	if !ok {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	summary, err := Summarize(r.Context(), c, filepath.Join(filepath.Dir(id), "..", ".wiki", "summaries"))
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"summary": summary})
}
```

Add `"path/filepath"` to `wiki/api.go`'s import block.

Mount in `main.go` alongside the other `/api/wiki/*` routes:

```go
	mux.HandleFunc("/api/wiki/summarize", wikiAPI.HandleSummarize)
```

- [ ] **Step 6: Manual verification (not part of the automated suite — this exercises a real LLM call)**

Run: `./comet-panel --port 8989 --dir ../miao/openspec &`
Run: `curl -s 'localhost:8989/api/wiki/summarize?id=<absolute-path-to-a-real-design.md>'`
Expected: JSON `{"summary": "..."}` with a real Chinese summary; second call within the same run returns instantly (cache hit)
Run: `kill %1`

- [ ] **Step 7: Commit**

```bash
git add wiki/summarize.go wiki/summarize_test.go wiki/api.go main.go
git commit -m "feat: add opt-in LLM summaries with mtime-based cache, reusing existing chat provider"
```

---

### Task 29: wiki/retrieve.go — Retriever interface + chromem-go stub (disabled)

**Files:**
- Create: `wiki/retrieve.go`
- Create: `wiki/retrieve_test.go`

**Interfaces:**
- Produces: `type Retriever interface { Search(query string, k int) ([]Component, error) }`, `keywordRetriever` (default, active), `vectorRetriever` (chromem-go-backed stub, **feature-flagged off, never wired into any handler or UI in this plan**)

- [ ] **Step 1: Write the failing test**

```go
// wiki/retrieve_test.go
package wiki

import "testing"

func TestKeywordRetriever_MatchesTitleSubstring(t *testing.T) {
	g := BuildGraph([]Component{
		{ID: "a", Title: "Secure Boot Design"},
		{ID: "b", Title: "Unrelated Topic"},
	}, nil)
	r := NewKeywordRetriever(g)

	results, err := r.Search("secure", 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 1 || results[0].ID != "a" {
		t.Fatalf("expected 1 match for 'a', got %+v", results)
	}
}

func TestKeywordRetriever_RespectsK(t *testing.T) {
	g := BuildGraph([]Component{
		{ID: "a", Title: "Match One"},
		{ID: "b", Title: "Match Two"},
		{ID: "c", Title: "Match Three"},
	}, nil)
	r := NewKeywordRetriever(g)
	results, _ := r.Search("match", 2)
	if len(results) != 2 {
		t.Fatalf("expected exactly 2 results (k=2), got %d", len(results))
	}
}

func TestVectorRetrieverStub_IsDisabledByDefault(t *testing.T) {
	if VectorRetrievalEnabled {
		t.Fatal("vector retrieval must default to disabled — this plan does not wire it into any UI")
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./wiki/... -run 'TestKeywordRetriever|TestVectorRetrieverStub' -v`
Expected: FAIL — types undefined

- [ ] **Step 3: Write `wiki/retrieve.go`**

```go
package wiki

import "strings"

type Retriever interface {
	Search(query string, k int) ([]Component, error)
}

// VectorRetrievalEnabled is a compile-time-visible feature flag. It stays
// false for the entire scope of this plan — chromem-go integration is
// reserved for a future iteration once corpus size actually justifies it
// (see design doc's zvec-vs-chromem-go evaluation). No handler or UI
// component in this plan reads this flag or calls a vector retriever.
const VectorRetrievalEnabled = false

type keywordRetriever struct {
	graph *Graph
}

func NewKeywordRetriever(g *Graph) Retriever {
	return &keywordRetriever{graph: g}
}

func (r *keywordRetriever) Search(query string, k int) ([]Component, error) {
	q := strings.ToLower(query)
	var matches []Component
	for id := range r.graph.components {
		c, _ := r.graph.Component(id)
		if strings.Contains(strings.ToLower(c.Title), q) {
			matches = append(matches, c)
			if len(matches) >= k {
				break
			}
		}
	}
	return matches, nil
}

// vectorRetriever is an intentionally unimplemented placeholder. Wiring a
// real chromem-go-backed implementation is out of scope for this plan —
// see design doc "为什么不用 alibaba/zvec" section for the reasoning on
// why chromem-go (not zvec) would be the correct choice if this is ever
// built out.
type vectorRetriever struct{}

func (vectorRetriever) Search(query string, k int) ([]Component, error) {
	return nil, nil
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `go test ./wiki/... -run 'TestKeywordRetriever|TestVectorRetrieverStub' -v`
Expected: PASS (3 tests)

- [ ] **Step 5: Full Phase③ regression check**

Run: `go build ./... && go test ./... && cd web && npm run test`
Expected: everything from Tasks 1-29 builds and passes

- [ ] **Step 6: Commit**

```bash
git add wiki/retrieve.go wiki/retrieve_test.go
git commit -m "feat: add Retriever interface with keyword default and disabled vector stub"
```

---

## >>> REVIEW GATE B <<<

**Stop here.** Dispatch @oracle to review all Phase③ commits (Tasks 18-29) before proceeding to Phase④. Oracle should specifically check:
- `internal/pathresolve` extraction genuinely didn't change `makeArtifactExt`'s external behavior (Task 19's regression coverage)
- The multi-level `../` regression test (Task 20) actually exercises the same failure mode fixed earlier this session, not a weaker approximation
- `LintTaskArtifacts`' per-task-number counting (Task 25) doesn't have an off-by-one or role-file-double-counting bug under real `miao` data (133 plans, 101 artifacts)
- `VectorRetrievalEnabled` (Task 29) is genuinely never read by any handler/UI — grep for it, confirm zero call sites outside the flag's own file and test
- **Confirm the Task 25 layer-4 descoping decision (slug fuzzy-match Lint suggestions, not implemented) is an acceptable tradeoff** given real `miao`/`wan2_2_deploy` data, not just a theoretical one — sample a few components manually and check whether skipping this layer actually loses meaningful signal
- `ScanComponents` (Task 18) genuinely skips-and-continues on a malformed file rather than aborting — verify with a real malformed file, not just the unit test's synthetic case

---

## Phase④ — Guarded Write Operations

**Architecture note caught during planning:** `$COMET_GUARD` is a shell environment variable set by the comet skill's `comet-env.mjs`/`comet-env.sh` inside an **agent session's shell**. `comet-panel` runs as a **systemd service** with a minimal environment — it does not inherit a user's shell rc files, so `os.Getenv("COMET_GUARD")` alone would silently return empty in production and Phase④ would appear to work in a dev shell but fail as a deployed service. `resolveCometGuard()` (Task 30) therefore checks the env var first (respects an explicit override) and falls back to probing the known, stable script locations on disk.

### Task 30: guard.go — resolveCometGuard() + TriggerTransition (exec.Command, streamed output)

**Files:**
- Create: `guard.go`
- Create: `guard_test.go`

**Interfaces:**
- Produces: `func resolveCometGuard() (interpreter, scriptPath string, err error)`; `func TriggerTransition(changeName, targetPhase, workspaceDir string) (io.ReadCloser, error)`

- [ ] **Step 1: Write the failing test**

```go
// guard_test.go
package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestResolveCometGuard_PrefersEnvVarOverride(t *testing.T) {
	fakePath := filepath.Join(t.TempDir(), "fake-guard.mjs")
	os.WriteFile(fakePath, []byte("// fake"), 0644)
	t.Setenv("COMET_GUARD", fakePath)

	interp, path, err := resolveCometGuard()
	if err != nil {
		t.Fatal(err)
	}
	if path != fakePath || interp != "node" {
		t.Fatalf("expected node+%s, got %s+%s", fakePath, interp, path)
	}
}

func TestResolveCometGuard_FallsBackToKnownDiskLocation(t *testing.T) {
	t.Setenv("COMET_GUARD", "")
	home := t.TempDir()
	t.Setenv("HOME", home)
	scriptDir := filepath.Join(home, ".config", "opencode", "skills", "comet", "scripts")
	os.MkdirAll(scriptDir, 0755)
	mjsPath := filepath.Join(scriptDir, "comet-guard.mjs")
	os.WriteFile(mjsPath, []byte("// real"), 0644)

	interp, path, err := resolveCometGuard()
	if err != nil {
		t.Fatal(err)
	}
	if path != mjsPath || interp != "node" {
		t.Fatalf("expected node+%s, got %s+%s", mjsPath, interp, path)
	}
}

func TestResolveCometGuard_FallsBackToLegacyShellScript(t *testing.T) {
	t.Setenv("COMET_GUARD", "")
	home := t.TempDir()
	t.Setenv("HOME", home)
	scriptDir := filepath.Join(home, ".config", "opencode", "skills", "comet", "scripts")
	os.MkdirAll(scriptDir, 0755)
	shPath := filepath.Join(scriptDir, "comet-guard.sh")
	os.WriteFile(shPath, []byte("# real"), 0644)
	// no .mjs present — must fall back to .sh

	interp, path, err := resolveCometGuard()
	if err != nil {
		t.Fatal(err)
	}
	if path != shPath || interp != "bash" {
		t.Fatalf("expected bash+%s, got %s+%s", shPath, interp, path)
	}
}

func TestResolveCometGuard_ErrorsWhenNothingFound(t *testing.T) {
	t.Setenv("COMET_GUARD", "")
	t.Setenv("HOME", t.TempDir()) // empty — no scripts dir at all
	_, _, err := resolveCometGuard()
	if err == nil {
		t.Fatal("expected an error when no guard script can be located")
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./... -run TestResolveCometGuard -v`
Expected: FAIL — `resolveCometGuard` undefined

- [ ] **Step 3: Write `guard.go`**

```go
package main

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
)

// resolveCometGuard locates the comet-guard entrypoint. It never
// reimplements guard logic — it only finds the script a human/agent would
// invoke manually, so behavior stays identical to the CLI forever.
//
// Resolution order:
//  1. $COMET_GUARD env var (explicit override, e.g. set in the systemd
//     unit file for non-standard installs)
//  2. ~/.config/opencode/skills/comet/scripts/comet-guard.mjs (0.4.0+ canonical)
//  3. ~/.config/opencode/skills/comet/scripts/comet-guard.sh (legacy)
func resolveCometGuard() (interpreter, scriptPath string, err error) {
	if envPath := os.Getenv("COMET_GUARD"); envPath != "" {
		if _, statErr := os.Stat(envPath); statErr == nil {
			return interpreterFor(envPath), envPath, nil
		}
	}

	home, err := os.UserHomeDir()
	if err != nil {
		return "", "", err
	}
	scriptDir := filepath.Join(home, ".config", "opencode", "skills", "comet", "scripts")

	mjsPath := filepath.Join(scriptDir, "comet-guard.mjs")
	if _, statErr := os.Stat(mjsPath); statErr == nil {
		return "node", mjsPath, nil
	}

	shPath := filepath.Join(scriptDir, "comet-guard.sh")
	if _, statErr := os.Stat(shPath); statErr == nil {
		return "bash", shPath, nil
	}

	return "", "", fmt.Errorf("comet-guard not found: checked $COMET_GUARD, %s, %s", mjsPath, shPath)
}

func interpreterFor(path string) string {
	if filepath.Ext(path) == ".mjs" {
		return "node"
	}
	return "bash"
}

// TriggerTransition shells out to the resolved comet-guard script with
// --apply. It never inspects or judges the output — the caller streams it
// verbatim to the client (see HandleTransition in Task 32).
func TriggerTransition(changeName, targetPhase, workspaceDir string) (io.ReadCloser, error) {
	interp, script, err := resolveCometGuard()
	if err != nil {
		return nil, err
	}

	cmd := exec.Command(interp, script, changeName, targetPhase, "--apply")
	cmd.Dir = workspaceDir
	pr, pw := io.Pipe()
	cmd.Stdout = pw
	cmd.Stderr = pw

	go func() {
		err := cmd.Run()
		if err != nil {
			pw.CloseWithError(err)
			return
		}
		pw.Close()
	}()

	return pr, nil
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `go test ./... -run TestResolveCometGuard -v`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add guard.go guard_test.go
git commit -m "feat: add resolveCometGuard with env-var-then-disk-probe fallback, TriggerTransition"
```

---

### Task 31: guard.go — per-change concurrency lock

**Files:**
- Modify: `guard.go`
- Modify: `guard_test.go`

**Interfaces:**
- Produces: `type TransitionLock struct{...}`, `func (l *TransitionLock) TryAcquire(changeName string) bool`, `func (l *TransitionLock) Release(changeName string)`

- [ ] **Step 1: Write the failing test**

```go
// append to guard_test.go

func TestTransitionLock_SecondAcquireForSameChangeFails(t *testing.T) {
	l := NewTransitionLock()
	if !l.TryAcquire("change-a") {
		t.Fatal("expected first acquire to succeed")
	}
	if l.TryAcquire("change-a") {
		t.Fatal("expected second concurrent acquire for the same change to fail")
	}
	l.Release("change-a")
	if !l.TryAcquire("change-a") {
		t.Fatal("expected acquire to succeed again after release")
	}
}

func TestTransitionLock_DifferentChangesDoNotBlockEachOther(t *testing.T) {
	l := NewTransitionLock()
	if !l.TryAcquire("change-a") {
		t.Fatal("expected acquire for change-a to succeed")
	}
	if !l.TryAcquire("change-b") {
		t.Fatal("expected acquire for change-b to succeed independently")
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./... -run TestTransitionLock -v`
Expected: FAIL — `TransitionLock` undefined

- [ ] **Step 3: Append to `guard.go`**

```go
import "sync"

type TransitionLock struct {
	mu      sync.Mutex
	inFlight map[string]bool
}

func NewTransitionLock() *TransitionLock {
	return &TransitionLock{inFlight: make(map[string]bool)}
}

func (l *TransitionLock) TryAcquire(changeName string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.inFlight[changeName] {
		return false
	}
	l.inFlight[changeName] = true
	return true
}

func (l *TransitionLock) Release(changeName string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.inFlight, changeName)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `go test ./... -run TestTransitionLock -v`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add guard.go guard_test.go
git commit -m "feat: add per-change TransitionLock to reject concurrent guard invocations"
```

---

### Task 32: main.go — POST /api/changes/:name/transition (SSE)

**Files:**
- Modify: `main.go`
- Create: `main_transition_test.go`

**Interfaces:**
- Consumes: `TriggerTransition`, `resolveCometGuard`, `TransitionLock` (Tasks 30-31); reuses the exact SSE header/flush pattern from `chat/handler.go:93-106`
- Produces: `POST /api/changes/:name/transition` body `{"targetPhase": string}` → `text/event-stream` of raw guard output lines, `409` on concurrent conflict, pre-flight `400` if the guard script can't be resolved at all

- [ ] **Step 1: Write the failing test**

```go
// main_transition_test.go
package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHandleTransition_ReturnsPreflightErrorWhenGuardMissing(t *testing.T) {
	t.Setenv("COMET_GUARD", "")
	t.Setenv("HOME", t.TempDir()) // no guard script anywhere

	lock := NewTransitionLock()
	body, _ := json.Marshal(map[string]string{"targetPhase": "build"})
	req := httptest.NewRequest("POST", "/api/changes/my-change/transition", bytes.NewReader(body))
	w := httptest.NewRecorder()
	handleTransition(w, req, "my-change", ".", lock)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 when guard can't be resolved, got %d: %s", w.Code, w.Body.String())
	}
}

func TestHandleTransition_ReturnsConflictWhenLockHeld(t *testing.T) {
	lock := NewTransitionLock()
	lock.TryAcquire("my-change") // simulate an in-flight transition

	body, _ := json.Marshal(map[string]string{"targetPhase": "build"})
	req := httptest.NewRequest("POST", "/api/changes/my-change/transition", bytes.NewReader(body))
	w := httptest.NewRecorder()
	handleTransition(w, req, "my-change", ".", lock)

	if w.Code != http.StatusConflict {
		t.Fatalf("expected 409 when a transition is already in flight, got %d", w.Code)
	}
}

func TestHandleTransition_StreamsSuccessExitMarker(t *testing.T) {
	fakeGuard := filepath.Join(t.TempDir(), "fake-guard.sh")
	os.WriteFile(fakeGuard, []byte("#!/bin/bash\necho ok\nexit 0\n"), 0755)
	t.Setenv("COMET_GUARD", fakeGuard)

	lock := NewTransitionLock()
	body, _ := json.Marshal(map[string]string{"targetPhase": "build"})
	req := httptest.NewRequest("POST", "/api/changes/my-change/transition", bytes.NewReader(body))
	w := httptest.NewRecorder()
	handleTransition(w, req, "my-change", ".", lock)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), "__GUARD_EXIT__:0") {
		t.Fatalf("expected a success exit marker in the stream, got: %s", w.Body.String())
	}
}

func TestHandleTransition_StreamsFailureExitMarker(t *testing.T) {
	fakeGuard := filepath.Join(t.TempDir(), "fake-guard.sh")
	os.WriteFile(fakeGuard, []byte("#!/bin/bash\necho failing\nexit 1\n"), 0755)
	t.Setenv("COMET_GUARD", fakeGuard)

	lock := NewTransitionLock()
	body, _ := json.Marshal(map[string]string{"targetPhase": "build"})
	req := httptest.NewRequest("POST", "/api/changes/my-change/transition", bytes.NewReader(body))
	w := httptest.NewRecorder()
	handleTransition(w, req, "my-change", ".", lock)

	if !strings.Contains(w.Body.String(), "__GUARD_EXIT__:1") {
		t.Fatalf("expected a failure exit marker in the stream, got: %s", w.Body.String())
	}
}
```

Add `"os"`, `"path/filepath"`, and `"strings"` to `main_transition_test.go`'s imports if not already present (needed for the fake-guard-script tests above).

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./... -run TestHandleTransition -v`
Expected: FAIL — `handleTransition` undefined

- [ ] **Step 3: Write `handleTransition` in `main.go`**

```go
func handleTransition(w http.ResponseWriter, r *http.Request, changeName, workspaceDir string, lock *TransitionLock) {
	var body struct {
		TargetPhase string `json:"targetPhase"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.TargetPhase == "" {
		writeJSONError(w, "invalid body: targetPhase required", 400)
		return
	}

	// Pre-flight: fail fast if the guard script can't even be located,
	// before opening an SSE stream or taking the lock.
	if _, _, err := resolveCometGuard(); err != nil {
		writeJSONError(w, err.Error(), 400)
		return
	}

	if !lock.TryAcquire(changeName) {
		writeJSONError(w, fmt.Sprintf("a transition for %q is already in progress", changeName), 409)
		return
	}
	defer lock.Release(changeName)

	output, err := TriggerTransition(changeName, body.TargetPhase, workspaceDir)
	if err != nil {
		writeJSONError(w, err.Error(), 500)
		return
	}
	defer output.Close()

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeJSONError(w, "streaming not supported", 500)
		return
	}

	buf := make([]byte, 4096)
	for {
		n, readErr := output.Read(buf)
		if n > 0 {
			fmt.Fprintf(w, "data: %s\n\n", string(buf[:n]))
			flusher.Flush()
		}
		if readErr != nil {
			// A clean io.EOF means the guard process exited 0 (success).
			// Any other error (from cmd.Run() via pw.CloseWithError in
			// TriggerTransition) means it exited non-zero or failed to
			// start. Emit an explicit final marker — the raw output
			// stream alone gives the client no way to tell these apart.
			if readErr == io.EOF {
				fmt.Fprintf(w, "data: __GUARD_EXIT__:0\n\n")
			} else {
				fmt.Fprintf(w, "data: __GUARD_EXIT__:1:%s\n\n", readErr.Error())
			}
			flusher.Flush()
			break
		}
	}
}
```

Ensure `"io"` is present in `main.go`'s import block (used for `io.EOF`).

- [ ] **Step 4: Wire the route in `main()`**

```go
	transitionLock := NewTransitionLock()
	mux.HandleFunc("/api/changes/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/transition") {
			name := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/api/changes/"), "/transition")
			handleTransition(w, r, name, dir, transitionLock)
			return
		}
		handleGetChange(w, r, dir) // existing GET behavior, unchanged
	})
```

Note: this replaces the previous bare `mux.HandleFunc("/api/changes/", handleGetChange)` registration (main.go:33) — the new version dispatches by method+suffix before falling through to the existing GET handler, so `GET /api/changes/:name` behavior from Task 2 onward is untouched.

- [ ] **Step 5: Run test to verify it passes**

Run: `go test ./... -run TestHandleTransition -v`
Expected: PASS (4 tests)

- [ ] **Step 6: Full regression check**

Run: `go build ./... && go test ./...`
Expected: clean build, every test from Tasks 1-32 passes

- [ ] **Step 7: Commit**

```bash
git add main.go main_transition_test.go
git commit -m "feat: add POST /api/changes/:name/transition SSE endpoint with preflight+lock guards"
```

---

### Task 33: React — GuardButton with confirm dialog + SSE display

**Files:**
- Create: `web/src/components/GuardButton.tsx`
- Create: `web/src/components/GuardButton.test.tsx`
- Modify: `web/src/components/ChangeDetail.tsx`

**Interfaces:**
- Consumes: `POST /api/changes/:name/transition` (Task 32), including its `__GUARD_EXIT__:0` (success) / `__GUARD_EXIT__:1:<error>` (failure) terminal marker
- Produces: `<GuardButton changeName={string} targetPhase={string} onComplete={() => void} />` — `onComplete` fires only on success, letting the parent refresh the change list

- [ ] **Step 1: Write the failing test**

```tsx
// web/src/components/GuardButton.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { GuardButton } from './GuardButton'

afterEach(() => vi.restoreAllMocks())

function mockStreamResponse(chunks: string[]): Response {
  let i = 0
  return {
    ok: true,
    body: {
      getReader: () => ({
        read: async () => {
          if (i < chunks.length) {
            const value = new TextEncoder().encode(chunks[i])
            i++
            return { done: false, value }
          }
          return { done: true, value: undefined }
        },
      }),
    },
  } as unknown as Response
}

describe('GuardButton', () => {
  it('shows a confirm dialog with the exact command before executing', () => {
    render(<GuardButton changeName="rx101-x" targetPhase="build" onComplete={vi.fn()} />)
    fireEvent.click(screen.getByTestId('guard-trigger'))
    expect(screen.getByTestId('guard-confirm-dialog').textContent).toContain('rx101-x')
    expect(screen.getByTestId('guard-confirm-dialog').textContent).toContain('build')
  })

  it('does not call fetch until the user confirms', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    render(<GuardButton changeName="rx101-x" targetPhase="build" onComplete={vi.fn()} />)
    fireEvent.click(screen.getByTestId('guard-trigger'))
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('calls the transition endpoint on confirm', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockStreamResponse(['data: ok\n\n', 'data: __GUARD_EXIT__:0\n\n']))
    render(<GuardButton changeName="rx101-x" targetPhase="build" onComplete={vi.fn()} />)
    fireEvent.click(screen.getByTestId('guard-trigger'))
    fireEvent.click(screen.getByTestId('guard-confirm-yes'))
    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/changes/rx101-x/transition',
        expect.objectContaining({ method: 'POST' }),
      ),
    )
  })

  it('on success: calls onComplete and auto-closes the output panel', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockStreamResponse(['data: done\n\n', 'data: __GUARD_EXIT__:0\n\n']))
    const onComplete = vi.fn()
    render(<GuardButton changeName="rx101-x" targetPhase="build" onComplete={onComplete} />)
    fireEvent.click(screen.getByTestId('guard-trigger'))
    fireEvent.click(screen.getByTestId('guard-confirm-yes'))
    await waitFor(() => expect(onComplete).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByTestId('guard-output')).toBeNull())
  })

  it('on failure: keeps the output panel open with the danger tone, does not call onComplete', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockStreamResponse(['data: failing\n\n', 'data: __GUARD_EXIT__:1:exit status 1\n\n']),
    )
    const onComplete = vi.fn()
    render(<GuardButton changeName="rx101-x" targetPhase="build" onComplete={onComplete} />)
    fireEvent.click(screen.getByTestId('guard-trigger'))
    fireEvent.click(screen.getByTestId('guard-confirm-yes'))
    await waitFor(() => expect(screen.getByTestId('guard-output')).toBeTruthy())
    expect(onComplete).not.toHaveBeenCalled()
    expect(screen.getByTestId('guard-output').dataset.tone).toBe('danger')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/components/GuardButton.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write `web/src/components/GuardButton.tsx`**

```tsx
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/components/GuardButton.test.tsx`
Expected: PASS (6 tests)

- [ ] **Step 5: Wire into `ChangeDetail.tsx`**

Add to `web/src/components/ChangeDetail.tsx`, below the `PhaseStepper`/`TaskDonut` row:

```tsx
import { GuardButton } from './GuardButton'

// PHASES order matches PhaseStepper's own list — the "next phase" is
// simply the one after change.phase in that fixed sequence.
const PHASE_ORDER = ['open', 'design', 'build', 'verify', 'archive']

// inside ChangeDetail's JSX, after the stepper/donut row:
{(() => {
  const idx = PHASE_ORDER.indexOf(change.phase)
  const next = idx >= 0 && idx < PHASE_ORDER.length - 1 ? PHASE_ORDER[idx + 1] : null
  return next && <GuardButton changeName={change.name} targetPhase={next} onComplete={onChangeUpdated} />
})()}
```

Update `ChangeDetail`'s prop type (defined in Task 9) to accept the new callback:

```tsx
export function ChangeDetail({ change, onChangeUpdated }: { change: ChangeSummary; onChangeUpdated: () => void }) {
```

This makes `onChangeUpdated` a required prop, so Task 9's existing `ChangeDetail.test.tsx` render call must be updated too (`onChangeUpdated` is now required — the test would otherwise fail to typecheck). Update its `render()` call:

```tsx
render(<ChangeDetail change={change} onChangeUpdated={() => {}} />)
```

Update `App.tsx` (Task 11) to pass a real refresh callback — replace the existing `{selectedChange && <ChangeDetail change={selectedChange} />}` line with:

```tsx
{selectedChange && (
  <ChangeDetail
    change={selectedChange}
    onChangeUpdated={() => fetchChanges().then(setChanges).catch(() => {})}
  />
)}
```

- [ ] **Step 6: Run full frontend suite + Go regression**

Run: `cd web && npm run test`
Run: `go build ./... && go test ./...`
Expected: all pass

- [ ] **Step 7: Commit**

```bash
git add web/src/components/GuardButton.tsx web/src/components/GuardButton.test.tsx web/src/components/ChangeDetail.tsx web/src/App.tsx
git commit -m "feat: add GuardButton with confirm dialog, exit-marker success/failure handling, streamed output"
```

---


## >>> REVIEW GATE C <<<

**Stop here.** Dispatch @oracle for the final review of Phase④ (Tasks 30-33) — the highest-risk phase in this plan. Oracle should specifically check:
- `resolveCometGuard`'s disk-probe fallback (Task 30) doesn't silently pick a stale or wrong script if multiple candidates exist somehow
- `TriggerTransition` genuinely never inspects/parses guard output for pass/fail decisions anywhere in the Go code — grep for any string-matching on the piped output
- `TransitionLock` (Task 31) has no deadlock/leak path (verify `defer lock.Release` fires on every return branch of `handleTransition`, including early preflight failures — re-check: **the preflight and lock-conflict returns in Task 32 happen BEFORE `TryAcquire`, only the success path acquires and defers release — confirm this ordering is correct and no lock is acquired-but-never-released on the resolveCometGuard error path**)
- `GuardButton`'s confirm dialog text (Task 33) matches the exact command that will run, not an approximation
- No batch-transition capability was accidentally introduced anywhere (grep `main.go`/`GuardButton.tsx` for any loop over multiple change names)

---

## Final Notes

This plan produces working, independently-testable software after each Review Gate:
- After Gate A: a fully responsive React dashboard with richer KPIs, still read-only, covering exactly what Phase①+② committed to
- After Gate B: the above, plus a queryable document graph with backlinks, lint, graph view, and opt-in summaries — still read-only
- After Gate C: the complete V2.0 scope from the design doc, including guarded write operations

Do not skip a Review Gate to save time — each one is a designed checkpoint for a genuinely different risk profile (UI scope creep → parsing correctness at real-data scale → introducing write capability to a previously read-only tool).
