# guard-action-preflight Specification

## Purpose
TBD - created by archiving change complete-v2-dashboard-features. Update Purpose after archive.
## Requirements
### Requirement: Guard 操作前置校验
GuardButton MUST 在触发状态迁移前校验变更名是否满足 guard 的合法性要求，非法时禁用触发并提示原因。

#### Scenario: 非法变更名禁用按钮
- **WHEN** 变更名不满足 guard 的 kebab-case 规则（如 `YYYY-MM-DD-` 数字前缀，guard 0.4.0 要求字母开头）
- **THEN** GuardButton MUST 处于禁用态并显示不可迁移的原因，而非让用户点击确认后才报错

#### Scenario: 合法变更名正常触发
- **WHEN** 变更名满足 guard 规则
- **THEN** GuardButton MUST 可点击，确认弹窗显示即将执行的 guard 命令

