# Design Context Pack — complete-v2-dashboard-features

> OpenSpec → Superpowers 交接包（traceable excerpt）。canonical spec 仍为 OpenSpec delta spec；本文件仅为设计阶段上下文引用。
> 注：本环境未安装 comet classic runtime package，`comet-handoff.mjs --write` 不可用，故手工生成等效可追溯交接包（引用源路径 + sha256 前缀）。

- Change: complete-v2-dashboard-features
- Phase: design
- Canonical spec: openspec
- Generated: 2026-07-10

## Source artifacts (path + sha256 prefix + line count)

| Role | Path | sha256[:16] | Lines |
|------|------|-------------|-------|
| proposal | `openspec/changes/complete-v2-dashboard-features/proposal.md` | 79120a5bf260b8bb | 34 |
| design (high-level) | `openspec/changes/complete-v2-dashboard-features/design.md` | 73f859fdad4c8f8e | 69 |
| tasks | `openspec/changes/complete-v2-dashboard-features/tasks.md` | e3a1c9276a8e9e98 | 42 |
| spec: dashboard-chat | `specs/dashboard-chat/spec.md` | 4280700f5b94f45c | 20 |
| spec: dashboard-wiki-views | `specs/dashboard-wiki-views/spec.md` | 1098e5958b0976d2 | 16 |
| spec: change-explorer-search | `specs/change-explorer-search/spec.md` | d53858f06dbf9a8a | 20 |
| spec: workspace-wiki-consistency | `specs/workspace-wiki-consistency/spec.md` | 34b08c2749b4b3f2 | 12 |
| spec: multi-workspace-routing | `specs/multi-workspace-routing/spec.md` | f68bb43a70ba5668 | 16 |
| spec: state-inconsistency-detection | `specs/state-inconsistency-detection/spec.md` | 8fd023846bbeb6b8 | 12 |
| spec: guard-action-preflight | `specs/guard-action-preflight/spec.md` | 9609568d4cac60ab | 12 |

## 核心目标摘录

补全 comet-panel V2 三块不可用卖点（聊天空壳、图谱/Lint 孤儿、搜索缺失）+ 修复 wiki/workspace 双源割裂、多 workspace 路由、状态不一致检测、GuardButton 命名陷阱。以接线为主，零 API 破坏。

## 非目标

暗色模式、Git Snapshot、风险面板、向量检索、重写 comet-guard、任意 `.comet.yaml` 字段编辑。
