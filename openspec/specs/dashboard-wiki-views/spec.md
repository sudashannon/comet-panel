# dashboard-wiki-views Specification

## Purpose
TBD - created by archiving change complete-v2-dashboard-features. Update Purpose after archive.
## Requirements
### Requirement: 文档关系图谱与 Lint 面板可达
仪表盘 MUST 在 **应用级导航**（与变更列表同级，而非嵌套于单个变更详情）提供进入文档关系图谱（WikiGraph）与 Lint 体检面板（LintPanel）的入口，并渲染后端 `/api/wiki/*` 返回的全局数据。

#### Scenario: 打开文档关系图谱
- **WHEN** 用户从应用级入口触发图谱视图
- **THEN** WikiGraph MUST 拉取 `/api/wiki/index` 并渲染全局组件节点与关系边；索引非空时至少显示一个节点；点击节点 MUST 有明确行为（打开该组件文档或聚焦，不得为无响应死键）

#### Scenario: 查看 Lint 体检结果
- **WHEN** 用户打开 Lint 面板
- **THEN** LintPanel MUST 拉取 `/api/wiki/lint`，按规则（orphan/dead-link/duplicate）分组展示问题；零问题时显示"无问题"而非加载态

#### Scenario: 空索引的降级
- **WHEN** wiki 索引为空
- **THEN** 图谱与 Lint 面板 MUST 显示空状态说明，不得报错或白屏

