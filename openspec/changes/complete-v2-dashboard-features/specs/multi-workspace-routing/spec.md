## ADDED Requirements

### Requirement: 详情链路按 workspace 解析路径
当变更来自已注册的 workspace 时，详情、artifact 读取与状态迁移 MUST 使用该变更所属 workspace 的根路径，而非单一 `--dir` flag。

#### Scenario: 多 workspace 下读取详情
- **WHEN** 注册了多个 workspace，用户查看非默认 workspace 的变更详情
- **THEN** `handleGetChange` MUST 从该变更所属 workspace 的路径读取，返回正确的阶段与产物

#### Scenario: 多 workspace 下读取 artifact
- **WHEN** 用户打开非默认 workspace 变更的某个 artifact
- **THEN** `handleGetArtifact` MUST 从正确 workspace 路径读取文件内容

#### Scenario: 多 workspace 下状态迁移
- **WHEN** 用户对非默认 workspace 的变更触发 guard 迁移
- **THEN** `handleTransition` MUST 在该变更所属 workspace 的路径下执行 guard
