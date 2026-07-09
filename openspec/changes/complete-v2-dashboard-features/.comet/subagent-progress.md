# Subagent Progress — complete-v2-dashboard-features

review_mode: standard | tdd_mode: tdd | build_mode: subagent-driven-development
base-ref: b8934ed6ee57db6c7a9df298d65cd5bff1c13628
branch: feature/20260710/complete-v2-dashboard-features

## Wave plan (dependency-ordered, intra-wave parallel, no shared-file conflicts)

- Wave 1 (parallel): A1 (wiki/api.go), B1 (ChangeExplorer), B2 (GuardButton), C1 (api/client.ts)
- Wave 2 (parallel, dep on wave1): A2 (main.go, dep A1 interface), C2 (App.tsx, dep C1), C3 (ChatBubble.tsx, dep C1)
- Wave 3: integration (make build + go test + npm test) + final light review

## Task registry (unique text)

| Task | Files | Stage | Commit | RED/GREEN | Risk signals |
|------|-------|-------|--------|-----------|--------------|
| A1 wiki WorkspaceLister + HandleRebuild | wiki/api.go, wiki/api_test.go | pending | | | |
| A2 main.go adapter + workspace routing | main.go, main_workspace_test.go, main_transition_test.go | pending | | | cross-module + security (path-traversal, external input) → RISK |
| B1 ChangeExplorer search/filter | ChangeExplorer.tsx(.test) | pending | | | |
| B2 GuardButton preflight | GuardButton.tsx(.test) | pending | | | |
| C1 client streamChat + wiki fetch | api/client.ts, client.test.ts | pending | | | external input (SSE) |
| C2 App app-level wiki views | App.tsx(.test) | pending | | | |
| C3 ChatBubble SSE overlay | ChatBubble.tsx(.test) | pending | | | |

## Log

- init: baseline green (go test ok, vitest 56 passed). Dispatching Wave 1.
