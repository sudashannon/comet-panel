# Tasks — complete-v2-dashboard-features

任务按能力分组，尽量映射到独立文件集以便 subagent 并行。每组含实现 + 测试。
（状态不一致检测经设计审查确认已实现+已测，从本次实现范围移除，仅在验证阶段确认。）

## 1. 后端：workspace-wiki 一致性 + 多 workspace 路由

- [ ] 1.1 `wiki/api.go` 增加 `WorkspaceLister interface { List() []WorkspaceConfig }`（wiki 包内类型）；`HandleRebuild` 优先从 lister 实时读取，lister 为 nil 时回退 `a.ws`
- [ ] 1.2 `main.go` 装配处加适配器（复用 `toWikiWorkspaces`）将 `*WorkspaceRegistry` 包装为 lister 传入 wiki API
- [ ] 1.3 `main.go` `handleGetChange`/`handleGetArtifact`/`handleTransition` 支持 `?workspace=<alias>`，registry 解析 path；`?workspace=` 优先于 `?dir=`；未注册 alias → 400；空注册表回退 `baseDir`
- [ ] 1.4 `handleGetArtifact` path-traversal 守卫基于解析后的 workspace root 重新计算
- [ ] 1.5 Go 测试：`wiki/api_test.go`（rebuild 反映运行时新增 workspace）；`main_workspace_test.go`/`main_transition_test.go`（?workspace 路由 + baseDir 回退 + 未注册 alias 400）

## 2. 前端：变更浏览器搜索与筛选

- [ ] 2.1 `ChangeExplorer.tsx` 增加搜索框 + status/workflow/phase 筛选（受控 state），交集过滤，清空恢复；明确作用于 KPI 过滤后的可见集
- [ ] 2.2 更新 `ChangeExplorer.test.tsx` 覆盖搜索、单筛选、组合筛选、清空、空结果

## 3. 前端：wiki 图谱与 Lint 面板接线（app-level）

- [ ] 3.1 App 级视图切换（变更列表 / 图谱 / Lint），挂载全局 `WikiGraph` 与 `LintPanel`（非嵌入 ChangeDetail）
- [ ] 3.2 `api/client.ts` 补 `fetchWikiIndex()`/`fetchWikiLint()`；组件空索引降级分支；`WikiGraph` onNodeClick 打开组件文档/聚焦
- [ ] 3.3 更新相关 `.test.tsx`（App 视图切换、WikiGraph/LintPanel 渲染与空态、onNodeClick）

## 4. 前端：聊天 SSE 接线

- [ ] 4.1 `api/client.ts` 新增 `streamChat()`：先校验 `res.ok`（非 ok 读 JSON 错误体并抛出）再 `res.body.getReader()` 消费 `/api/chat/message` SSE（事件 thinking/delta/done）
- [ ] 4.2 `ChatBubble.tsx` overlay body 实现消息列表 + 输入行 + 发送；上下文文件注入；缺 key/provider 错误显示错误消息（来自 HTTP 错误体，非 SSE 事件）
- [ ] 4.3 更新 `ChatBubble.test.tsx` 覆盖发送、流式渲染、会话隔离、缺 key（HTTP 4xx）错误提示

## 5. 前端：GuardButton 前置校验

- [ ] 5.1 `GuardButton.tsx` 增加 `isValidChangeName`（`^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$`），非法禁用 + tooltip
- [ ] 5.2 更新 `GuardButton.test.tsx` 覆盖合法可点击 / 非法禁用两种情形

## 6. 集成与构建验证

- [ ] 6.1 `make build`（npm build → go build）通过；`go test ./...` 与 `npm test` 全绿
- [ ] 6.2 确认状态不一致检测（既有 computeStateWarning + scanner_test.go）仍通过，不引入回归
- [ ] 6.3 手动冒烟：运行二进制指向 miao openspec，验证聊天/图谱/Lint/搜索/一致性徽章/guard 预校验可用
