## Why

comet-panel V2 的实操评测（针对 miao openspec，16 活跃 + 85 归档真实数据）确认：视觉层、信息架构、组件库、Guard 写入通道已达成品级，但**三块差异化卖点在运行 UI 中不可用**，且存在**多 workspace 与 wiki 索引的架构性割裂**。V2 当前是「好看的只读看板」，而非设计文档（`docs/specs/2026-07-09-comet-panel-v2-design.md`）描述的完整产品。缺口多为「接线」而非从零实现——组件与后端多已就绪，需集成收尾。

## What Changes

修复并补全以下 V2 缺陷（证据来自 hands-on 评测）：

1. **聊天空壳**：`ChatBubble.tsx` 仅渲染标题栏+关闭键，无输入框/发送/SSE 接线（源码注释自认"留待后续 task"）。后端 `/api/chat/*` 完好。→ 迁移 V1 聊天交互到 V2 overlay，接通 SSE 流式、上下文文件选择。
2. **图谱/Lint 孤儿组件**：`WikiGraph.tsx`、`LintPanel.tsx` 已构建且有测试，但 `App.tsx`/`ChangeDetail.tsx` 从未 import，UI 不可达。后端 `/api/wiki/*` 返回 788 组件、599 lint 问题。→ 接线进 UI，提供可达入口。
3. **搜索/筛选缺失**：`ChangeExplorer.tsx`（78 行）只有活跃列表 + 可折叠归档，无搜索框、无 status/workflow/phase 筛选（相对 V1 是倒退）。→ 恢复搜索 + 筛选。
4. **wiki/workspace 双源割裂**：`wikiAPI` 持有启动快照；运行时 `POST /api/workspaces` 更新 registry 但不传导给 wiki，`POST /api/wiki/rebuild` 仍读旧快照 → 索引永远空，除非启动前已有 `workspaces.yaml`。→ rebuild 从 registry 实时读取。
5. **多 workspace 未贯通详情链路**：`handleTransition`/`handleGetChange`/`handleGetArtifact` 使用 `--dir` flag 而非变更所属 workspace 的 path，多 workspace 下读错目录。→ 按 workspace 解析路径。
6. **GuardButton 命名陷阱**：对 `YYYY-MM-DD-` 前缀变更（guard 0.4.0 校验 `/^[a-z].../` 拒绝），点确认后才报错。→ 前端预校验，禁用+提示。

> 注：原评测列出的「一致性检测缺失」经设计审查确认**已实现+已测**（`scanner.go` computeStateWarning + `scanner_test.go` + `ChangeDetail.tsx` 渲染），故从本 change 范围移除，仅在验证阶段确认无回归。

## Capabilities

### New Capabilities
- `dashboard-chat`: 变更上下文内的 LLM 聊天，接通后端 SSE 流式、上下文文件注入与消息持久化
- `dashboard-wiki-views`: 文档关系图谱与 Lint 体检面板在 UI 中可达并渲染后端 `/api/wiki/*` 数据
- `change-explorer-search`: 变更列表的关键词搜索与 status/workflow/phase 多维筛选
- `workspace-wiki-consistency`: wiki 索引与 workspace 注册表保持一致，运行时增删 workspace 后 rebuild 生效
- `multi-workspace-routing`: 详情/artifact/状态迁移按变更所属 workspace 解析路径，而非单一 `--dir`
- `guard-action-preflight`: GuardButton 在触发前预校验变更名合法性，非法名禁用并提示原因

## Impact

- **前端** (`web/src/`): `ChatBubble.tsx`, `WikiGraph.tsx`, `LintPanel.tsx`, `ChangeExplorer.tsx`, `ChangeDetail.tsx`, `App.tsx`, `GuardButton.tsx`, `api/client.ts`, `api/types.ts`
- **后端** (Go): `wiki/api.go`(HandleRebuild + WorkspaceLister), `main.go`(handleTransition/handleGetChange/handleGetArtifact 的 workspace 路径解析 + 适配器)
- **测试**: 各 React 组件的 `.test.tsx`、Go `*_test.go`
- **无破坏性 API 变更**：`/api/*` 契约保持；新增查询参数向后兼容
- **构建/部署**: `make build`（npm build → go build），systemd 单元不变
