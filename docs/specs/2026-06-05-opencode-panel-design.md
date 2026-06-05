# OpenCode Panel 设计文档

> **日期**: 2026-06-05
> **类型**: 独立工具
> **技术栈**: Go 1.26 + vanilla JS + marked.js
> **路径**: `/home/shanl/workspace/opencode-panel`

## 1. 目标

构建 OpenCode Session 监控看板，可视化所有 opencode session 的状态、父子关系、对话历史和 bus task pool。

## 2. 数据源

### A. OpenCode API（动态端口）

| 端点 | 说明 | 返回 |
|------|------|------|
| `GET /session` | 列出所有 session | `Session[]` |
| `GET /session/{id}` | 获取单个 session | `Session` |
| `GET /session/{id}/children` | 获取子 session | `Session[]` |
| `GET /session/{id}/todo` | 获取 todo 列表 | `Todo[]` |
| `GET /session/{id}/message` | 列出消息列表 | `Message[]` |
| `GET /session/{id}/message/{msgID}` | 获取单条消息 | `Message` |

### B. Bus SQLite（固定路径）

`~/.opencode/bus/db/queues.db` — tasks 表：

| 字段 | 说明 |
|------|------|
| id, queue | 任务标识和队列名 |
| status | pending / claimed / done / failed |
| priority | 优先级 |
| enqueued_by, enqueued_at | 入队信息 |
| claimed_by, claimed_at, lease_until | 认领信息 |
| attempts, max_attempts | 重试 |
| result, error | 结果/错误 |
| completed_at | 完成时间 |

## 3. 架构

```
opencode-panel/
├── main.go                 # HTTP server, embed, SPA routing
├── scanner.go              # OpenCode API 代理 + SQLite 读取
├── static/
│   ├── index.html
│   ├── app.js
│   └── style.css
└── go.mod
```

```
浏览器                     Go 后端                   外部数据源
──────                    ────────                  ──────────
GET /api/sessions ──────→│ scanner  │──→ OpenCode API (--port 参数)
GET /api/session/:id ──→│          │──→ ~/.opencode/bus/db/queues.db
GET /api/session/:id/   │          │
    messages ────────────→│          │
GET /api/bus/tasks ─────→│          │
```

**连接方式**：
- 启动参数 `--opencode-port 35765` 指定 OpenCode API 端口
- 后端作为 HTTP 代理，转发所有 `/api/session/*` 到 OpenCode API
- Bus DB 直接读 SQLite

**与 comet-panel 一致**：Go embed + vanilla JS + marked.js CDN。复用渲染模式和双栏布局经验。

## 4. 页面布局

### 主页面（双栏）

```
┌──────────────────────────────────────────────────────────┐
│  OpenCode Panel          [端口: 35765] [连接]            │
├────────────────────┬─────────────────────────────────────┤
│ 左: Session 列表    │ 右: 详情                           │
│ (~35%)              │ (~65%)                             │
│                     │                                    │
│ [搜索...]           │  📋 sess_01jxyza...               │
│ [全部 ▼]           │  📁 /home/shanl/workspace/miao     │
│                     │  ⏱ 2026-06-05 17:29 → 18:22       │
│ ● sess_01jx..       │  📊 +1500 -200 (12 files)          │
│   装备监控控制台      │  🤖 deepseek-v4-pro              │
│   /home/shanl/...   │                                    │
│   ⏱ 2h ago          │  ┌─ 子 Session (3) ───────────┐  │
│                     │  │ ● sess_01jy... 安全启动方案   │  │
│ ● sess_01jy..       │  │ ● sess_01jz... OTA方案      │  │
│   安全启动方案       │  └─────────────────────────────┘  │
│                     │                                    │
│                     │  ┌─ Todo (2/5) ───────────────┐  │
│                     │  │ ☑ 完成项 1                   │  │
│                     │  │ ☑ 完成项 2                   │  │
│                     │  │ ☐ 待办项 3                   │  │
│                     │  └─────────────────────────────┘  │
│                     │                                    │
│                     │  ┌─ 对话预览 (最近 5 条) ───────┐ │
│                     │  │ 👤 帮我设计KMC密钥管理方案     │ │
│                     │  │ 🤖 好的，根据需求分析...      │ │
│                     │  │     📊 12500 in / 3400 out   │ │
│                     │  │ 👤 加上权限控制                │ │
│                     │  │ ...                           │ │
│                     │  │          [加载更多 (共 23 条)]│ │
│                     │  └─────────────────────────────┘  │
│                     │                                    │
│                     │  ┌─ Bus Task Pool ─────────────┐  │
│                     │  │ pending:12 claimed:3 done:8  │  │
│                     │  │ failed:1                     │  │
│                     │  └─────────────────────────────┘  │
└──────────────────────┴─────────────────────────────────┘
```

### 对话全文页（点击"加载更多"跳转）

```
┌──────────────────────────────────────────────────────┐
│  ← 返回    对话: sess_01jxyza...                      │
│                                                       │
│  ┌─ 统计卡片 ──────────────────────────────────────┐ │
│  │ 📊 Total: 12,500 in / 3,400 out / 0 reasoning    │ │
│  │ 💰 Cost: $0.042                                  │ │
│  │ ⏱ 2026-06-05 17:29:30 → 17:36:45 (7m15s)        │ │
│  └──────────────────────────────────────────────────┘ │
│                                                       │
│  👤 **用户**  | 2026-06-05 17:29:30                   │
│  帮我设计KMC密钥管理方案                               │
│                                                       │
│  🤖 **Assistant** (deepseek-v4-pro) | 17:36:45       │
│  ## 密钥管理方案设计                                  │
│                                                       │
│  ### 1. 密钥层级                                      │
│  | 层级 | 用途 | 算法 |                               │
│  |------|------|------|                               │
│  | HUK  | 根密钥| AES-256 |                           │
│  ...                                                  │
│                                                       │
│  📊 tokens: 12500←in / 3400→out                       │
│  💰 cost: $0.015                                      │
│                                                       │
│  👤 **用户**  | 2026-06-05 17:40:12                   │
│  加上权限控制                                          │
│  ...                                                  │
└──────────────────────────────────────────────────────┘
```

## 5. 交互细节

### Session 列表
- 搜索：按标题/目录即时过滤
- 筛选：全部 / 有子 session / 最近 24h / 最近 7d
- 排序：按更新时间倒序（默认）/ 创建时间倒序 / 标题字母序
- 每行信息：标题、目录（截断）、时间（相对时间）、子 session 数量 badge

### 详情面板
- 元信息卡片：ID、目录、时间范围、代码变更统计、使用的模型
- 子 Session：缩进列表，可点击跳转
- Todo：checkbox 渲染，显示进度（完成/总数）
- 对话预览：最近 5 条消息的简化渲染（消息文本渲染为纯文本 + token 统计）
- Bus 统计：折叠卡片，显示各状态数量

### 对话全文页
- 顶部统计卡片：总 token（input/output/reasoning/cache）、总费用、对话时长
- 消息以时间线形式渲染，User/Assistant 交替
- **Markdown 渲染**：代码块、表格、列表等完整 GFM 支持
- Token 用量标注在每条 Assistant 消息底部
- 返回按钮回到主页面，保持当前选中的 session

## 6. API 设计

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/sessions` | 列出所有 session（代理到 OpenCode API） |
| `GET` | `/api/session/:id` | 获取单个 session 详情 |
| `GET` | `/api/session/:id/children` | 获取子 session |
| `GET` | `/api/session/:id/todo` | 获取 todo |
| `GET` | `/api/session/:id/messages` | 获取消息列表 |
| `GET` | `/api/bus/tasks` | Bus task pool 统计 |

所有 `/api/session/*` 请求由后端转发到 OpenCode API，注入必要认证头。

## 7. 非目标

- 不写入/修改 opencode 数据（只读）
- 不支持 session 创建/删除/重命名
- 不需要实时推送（手动刷新即可）
- 不集成 AI chat（纯监控面板）
- 不图表/趋势可视化（当前数据量不需要）

## 8. 消息类型

```go
type Message struct {
    ID        string `json:"id"`
    SessionID string `json:"sessionID"`
    Role      string `json:"role"` // "user" | "assistant"
    Time      struct {
        Created   int64 `json:"created"`
        Completed int64 `json:"completed,omitempty"`
    } `json:"time"`
    // User fields
    Agent string `json:"agent,omitempty"`
    Model struct {
        ProviderID string `json:"providerID"`
        ModelID    string `json:"modelID"`
    } `json:"model,omitempty"`
    // Assistant fields
    ParentID string `json:"parentID,omitempty"`
    Cost     int    `json:"cost,omitempty"`
    Tokens   struct {
        Input     int `json:"input"`
        Output    int `json:"output"`
        Reasoning int `json:"reasoning"`
        Cache     struct {
            Read  int `json:"read"`
            Write int `json:"write"`
        } `json:"cache"`
    } `json:"tokens,omitempty"`
    Finish string `json:"finish,omitempty"`
}
```

消息文本内容通过 `GET /session/{id}/message/{msgID}` 的 Part 获取。详情页最近 5 条只拉消息列表（不含 content），全文页逐条获取 content。
