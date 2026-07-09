# dashboard-chat Specification

## Purpose
TBD - created by archiving change complete-v2-dashboard-features. Update Purpose after archive.
## Requirements
### Requirement: 变更上下文内的流式聊天
仪表盘 MUST 在选中变更后提供可用的聊天 overlay，接通后端 `/api/chat/*`，支持流式响应、上下文文件注入与会话隔离。

#### Scenario: 打开聊天并发送消息
- **WHEN** 用户选中一个变更并点击聊天气泡，在输入框输入问题后发送
- **THEN** overlay MUST 显示输入框与发送按钮，请求 POST `/api/chat/message`（携带该变更名），并以 SSE（事件类型 `thinking`/`delta`/`done`）增量渲染助手回复

#### Scenario: 上下文文件注入
- **WHEN** 用户在聊天中引用该变更的某个 artifact（如 proposal.md）作为上下文
- **THEN** 该文件内容 MUST 作为 `context_files` 随消息发送，助手回复据此作答

#### Scenario: 会话按变更隔离
- **WHEN** 用户在变更 A 聊天后切换到变更 B 再切回 A
- **THEN** 变更 A 的历史消息 MUST 保留，变更 B 的会话 MUST 独立

#### Scenario: 缺少 API key
- **WHEN** 活跃 provider 未配置 API key 时发送消息
- **THEN** 后端在 SSE 流开启前返回 HTTP 4xx/5xx 的 JSON 错误体；overlay MUST 先校验 `res.ok` 再读取流，并显示该错误消息，而非静默失败或挂起

