# change-explorer-search Specification

## Purpose
TBD - created by archiving change complete-v2-dashboard-features. Update Purpose after archive.
## Requirements
### Requirement: 变更列表搜索与多维筛选
变更浏览器 MUST 提供关键词搜索与 status/workflow/phase 多维筛选，缩小大规模变更列表。

#### Scenario: 关键词搜索
- **WHEN** 用户在搜索框输入变更名子串
- **THEN** 列表 MUST 实时过滤到名称匹配的变更（大小写不敏感）

#### Scenario: 按 workflow 筛选
- **WHEN** 用户选择 workflow 筛选值（full/hotfix/tweak）
- **THEN** 列表 MUST 仅显示该 workflow 的变更

#### Scenario: 按 phase 筛选
- **WHEN** 用户选择 phase 筛选值（open/design/build/verify/archive）
- **THEN** 列表 MUST 仅显示处于该 phase 的变更

#### Scenario: 组合筛选与清空
- **WHEN** 用户同时应用搜索词与多个筛选，然后清空
- **THEN** 结果 MUST 为各条件交集；清空后 MUST 恢复完整列表

