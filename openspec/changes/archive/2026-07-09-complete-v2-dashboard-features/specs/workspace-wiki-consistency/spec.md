## ADDED Requirements

### Requirement: wiki 索引与 workspace 注册表一致
wiki 索引 MUST 反映当前 workspace 注册表；运行时增删 workspace 后触发 rebuild MUST 使索引与最新注册表一致。

#### Scenario: 运行时新增 workspace 后重建
- **WHEN** 通过 `POST /api/workspaces` 新增 workspace 后调用 `POST /api/wiki/rebuild`
- **THEN** `/api/wiki/index` MUST 返回包含该新 workspace 文档的索引，而非启动时的旧快照

#### Scenario: 无 workspace 时的索引
- **WHEN** 注册表为空但存在 `--dir` 默认目录
- **THEN** rebuild MUST 至少索引默认目录，或明确返回空索引，不得因快照过期而永久为空
