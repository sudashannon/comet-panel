# Comet Panel

> 工程变更知识图谱 + AI 面板 — 可视化 OpenSpec 变更、语义搜索、知识图谱、自动报告生成。

**单 Go 二进制 + 嵌入式前端。下载即用。**

---

## 核心能力

| 模块 | 功能 |
|------|------|
| 🚀 **变更仪表盘** | KPI 卡片、变更列表、进度条、多 workspace 聚合 |
| ⌨️ **命令面板** | `Ctrl+K` 模糊搜索所有命令、`?` 快捷键速查、类别分组 |
| 🗺️ **知识图谱** | Cytoscape 力导向图、社区检测、分组染色、节点关系可视化 |
| 📅 **时间线** | Gantt 风格、阶段着色、今日标记线、周末高亮、workspace 分行 |
| 📆 **产品日历** | 季度视图、日期产物热力图、按类型排序、点击跳转 viewer |
| 🔍 **语义搜索** | Ternlight 向量 embedding + cosine 相似度 + 关键词增强 |
| ✓ **文档健康** | 死链检测、孤儿节点、lifecycle gap 规则 |
| 📊 **报告生成** | LLM 驱动的周报/月报 (Markdown + Swiss HTML), 历史管理 |
| 💬 **AI 对话** | 流式 Chat, 图谱模式 (注入 2-hop 邻域 + 社区综述) |
| 🖱️ **右键菜单** | 变更卡片 / 最近更新 / 日历产物右键复制路径、打开 |
| 🔗 **分享** | 生成分享链接，可设置过期时间 |
| ⚙️ **设置面板** | Provider / Model / API Base 配置 |
| 🤖 **MCP Server** | Streamable HTTP 端点, 6 个 tools 供 AI agent 查询知识图谱 |

---

## 键盘快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+K` | 打开命令面板 |
| `Ctrl+1~7` | 切换视图：变更/图谱/时间线/搜索/最近/文档健康/日历 |
| `Ctrl+B` | 收藏夹开关 |
| `Ctrl+=/-` | 放大/缩小 (50%-200%) |
| `Ctrl+0` | 重置缩放 |
| `Escape` | 关闭面板 / viewer / 收藏夹 |

---

## 架构

```
┌───────────────────────────────────────────────────┐
│  Frontend (React + Vite + Tailwind)               │
│  Carbon Design System tokens (IBM Plex Sans)      │
│  WikiGraph · WikiTimeline · SemanticSearch         │
│  ChangeExplorer · ReportView · LintPanel · Chat   │
└───────────────┬───────────────────────────────────┘
                │ HTTP API
┌───────────────┴───────────────────────────────────┐
│  Go Backend (single binary, embedded frontend)    │
│                                                   │
│  ┌─────────────────────────────────────────────┐  │
│  │  Wiki Engine                                │  │
│  │  scan → links (4 layers) → graph → embed   │  │
│  │  → similarity → Louvain → community labels │  │
│  └─────────────────────────────────────────────┘  │
│                                                   │
│  ┌──────────────┐ ┌──────────┐ ┌──────────────┐  │
│  │ Chat/LLM     │ │ Report   │ │ MCP Server   │  │
│  │ (streaming)  │ │ (weekly/ │ │ (JSON-RPC    │  │
│  │              │ │  monthly)│ │  over HTTP)  │  │
│  └──────────────┘ └──────────┘ └──────────────┘  │
│                                                   │
│  fsnotify watcher → incremental rebuild → SSE     │
└───────────────────────────────────────────────────┘
                │
     ┌──────────┴──────────┐
     │  Ternlight (Bun)    │
     │  @ternlight/base    │
     │  384-dim embedding  │
     └─────────────────────┘
```

---

## 知识图谱

### 数据模型

**10 种组件类型:**

| 类型 | 来源 |
|------|------|
| `change` | `.comet.yaml` 文件 |
| `proposal` | `proposal.md` |
| `design` | `design.md` |
| `tasks` | `tasks.md` |
| `spec` | `specs/` 目录下 |
| `plan` | `plans/` 目录下 |
| `artifact` | `artifacts/` 目录下 |
| `diagram` | `diagrams/` 目录下 |
| `report` | `reports/` 目录下 |
| `knowledge` | `knowledge/` 目录 或 frontmatter `wiki: true` |

### 4 层边提取

| 层 | 来源 | 置信度 |
|---|------|--------|
| **YAML** | `.comet.yaml` 的 design_doc/plan/verification_report | 最高 |
| **Markdown** | 文件内 `[text](path)` 链接 | 高 |
| **Convention-internal** | 同 change 内 proposal→design→tasks→specs 自动连线 | 中 |
| **Vector** | Ternlight embedding cosine top-3 (阈值 0.5) | 语义 |

### 社区检测

- Louvain 算法自动聚类
- 向量质心标签 (最中心成员的标题)
- 社区综述页 (LLM 生成, 带缓存)

### 增量更新

- fsnotify 监控所有 workspace 目录
- 2s debounce → 自动 rebuild
- embedding 缓存 (只 embed 新增/变更文件)
- SSE push → 前端自动刷新

---

## 语义搜索

- **后端**: Ternlight (`@ternlight/base`, 7MB, 384 维) 通过 Bun 调用
- **排序**: cosine similarity + 标题关键词 boost (+30%)
- **Fallback**: 向量无结果时自动转标题子串匹配
- **性能**: embedding 缓存命中后 rebuild 4s; 搜索 <300ms

---

## 报告生成

- **周报**: Markdown 格式, 按 workspace × 主题分组, 列关键成果
- **月报**: Swiss-style 单页 HTML, KPI 卡片 + 主题摘要
- **LLM 驱动**: 使用已配置的 provider (MiniMax / Claude / OpenAI)
- **历史管理**: 持久化到 `~/.comet-panel/reports/`, 支持查看/下载/删除

---

## MCP Server

Comet Panel 内嵌 MCP (Model Context Protocol) Streamable HTTP 端点, 让 AI agent 直接查询知识图谱。

**端点**: `POST http://localhost:8989/mcp`

| Tool | 说明 |
|------|------|
| `wiki_search` | 语义搜索工程文档 |
| `wiki_component` | 查看组件详情 + 引用关系 |
| `wiki_neighbors` | 2-hop 图谱邻居 |
| `wiki_overview` | 主题社区综述 |
| `wiki_read` | 读取文档内容 |
| `wiki_lint` | 文档健康检查 |

**Agent 配置示例** (OpenCode `mcp.json`):
```json
{
  "comet-wiki": {
    "url": "http://localhost:8989/mcp"
  }
}
```

---

## 快速开始

### 安装

```bash
# 克隆
git clone https://github.com/sudashannon/comet-panel.git
cd comet-panel

# 安装 embedding 依赖
bun install

# 构建
cd web && npm install && npx vite build && cd ..
go build -o comet-panel .
```

### 运行

```bash
./comet-panel --port 8989 --dir /path/to/openspec
```

浏览器打开 `http://localhost:8989`

### Systemd 服务

```bash
cp comet-panel.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now comet-panel
```

### 配置 Workspace

通过 UI 添加, 或直接编辑 `~/.comet-panel/workspaces.yaml`:

```yaml
workspaces:
  - alias: miao
    path: /home/user/workspace/miao/openspec
  - alias: lz100
    path: /home/user/workspace/miao/lz100
    color: '#10b981'
```

### 配置 LLM Provider

UI 设置面板, 或编辑 `~/.comet-ui/config.json`:

```json
{
  "active_provider": "minimax",
  "providers": {
    "minimax": {
      "api_key": "sk-...",
      "api_base": "https://api.minimaxi.com",
      "model": "MiniMax-M2.5",
      "temperature": 1,
      "max_tokens": 4096
    }
  }
}
```

---

## 知识产出归档

Agent 产出的文档放到 workspace 的 `knowledge/` 目录即可被自动索引:

```markdown
---
title: Orin INT8 量化调研
tags: [orin, quantization]
---

# 正文...
```

不在 `knowledge/` 目录的文件, 加 `wiki: true` frontmatter 也可以被追踪:

```markdown
---
title: 架构决策记录
wiki: true
tags: [architecture, decision]
---
```

---

## API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/workspaces` | GET/POST | 管理 workspace |
| `/api/changes` | GET | 变更列表 |
| `/api/changes/:name` | GET | 变更详情 |
| `/api/artifact` | GET | 读取文档内容 |
| `/api/chat/message` | POST | AI 对话 (流式) |
| `/api/chat/config` | GET/PUT | Chat 配置 |
| `/api/report` | POST | 生成报告 |
| `/api/reports` | GET | 报告历史 |
| `/api/reports/get` | GET/DELETE | 查看/删除报告 |
| `/api/wiki/graph` | GET | 完整图谱数据 |
| `/api/wiki/index` | GET | 组件索引 |
| `/api/wiki/component/:id` | GET | 组件详情 + 引用 |
| `/api/wiki/search-semantic` | POST | 语义搜索 |
| `/api/wiki/rebuild` | POST | 重建索引 |
| `/api/wiki/lint` | GET | Lint 问题 |
| `/api/wiki/overview` | GET | 社区综述 |
| `/api/wiki/recent` | GET | 最近更新 (支持 ?offset=&limit=) |
| `/api/wiki/calendar/month` | GET | 日历月视图 (?year=&month=) |
| `/api/wiki/calendar/day` | GET | 日历日视图 (?date=) |
| `/api/wiki/events` | GET (SSE) | 实时更新推送 |
| `/mcp` | POST | MCP JSON-RPC 端点 |

---

## 技术栈

| 层 | 技术 |
|---|------|
| 后端 | Go 1.22+, 单二进制 |
| 前端 | React 18, Vite, Tailwind CSS, Cytoscape.js |
| 设计 | IBM Carbon Design System tokens, IBM Plex Sans 字体 |
| Embedding | Ternlight (@ternlight/base, Bun runtime) |
| 图算法 | Louvain 社区检测, BM25 (标签), Cosine similarity |
| 文件监控 | fsnotify |
| LLM | MiniMax / Anthropic / OpenAI (可配置) |
| 协议 | MCP Streamable HTTP (JSON-RPC 2.0) |
| 实时推送 | Server-Sent Events (SSE) |

---

## License

MIT
