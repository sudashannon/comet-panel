# comet-panel Wiki V2: Ternlight 向量化 + 增量索引 设计文档

> 日期: 2026-07-11
> 状态: approved
> 前置: wiki-upgrade Phase 1-4 已完成
> 分期: 2 phases (A: 向量化, B: 增量索引)

## 1. 背景

Phase 1-4 完成后，wiki 子系统已具备：
- 875 components, 3471 edges, 191 communities
- BM25 相似边 2646 条(中文效果一般：bigram 切割产出垃圾标签)
- 全量 rebuild 3-5s，workspace 膨胀后会线性增长
- 无前端搜索能力

**本次升级解决**:
1. 相似边质量差(BM25 → 向量 cosine)
2. 无实时语义搜索(加 ternlight 前端 embed)
3. 每次改文件需手动 rebuild(加 fsnotify 增量)

## 2. 新增依赖

| 依赖 | 位置 | 体积 | 用途 |
|------|------|------|------|
| `@ternlight/base` | 后端(Bun) | ~7MB | 批量 embed |
| `@ternlight/mini` | 前端(WASM) | ~5MB | 实时搜索 embed |
| `github.com/fsnotify/fsnotify` | Go | ~0.1MB | 文件变更检测 |

## 3. Phase A: Ternlight 向量化

### 3.1 后端 Embed Pipeline

**新文件**: `scripts/embed.ts`

```typescript
import { embed } from '@ternlight/base'

const input = JSON.parse(await Bun.stdin.text())
const results = []
for (const item of input) {
  const vec = await embed(item.text)
  results.push({ id: item.id, vector: Array.from(vec) })
}
console.log(JSON.stringify(results))
```

**新文件**: `wiki/embed.go`

```go
// ComputeEmbeddings shells out to `bun scripts/embed.ts` with component
// texts on stdin, returns id → float32[384] map.
func ComputeEmbeddings(components []Component, scriptPath string) (map[string][]float32, error)

// LoadEmbeddings reads the binary cache file.
func LoadEmbeddings(path string) (map[string][]float32, error)

// SaveEmbeddings writes the binary cache file.
func SaveEmbeddings(path string, embeddings map[string][]float32) error

// IncrementalEmbed embeds only the given components and merges into existing map.
func IncrementalEmbed(existing map[string][]float32, changed []Component, scriptPath string) (map[string][]float32, error)
```

**缓存格式**: `~/.comet-panel/wiki/embeddings.bin`
```
[4 bytes: entry count (uint32 LE)]
per entry:
  [2 bytes: id_len (uint16 LE)]
  [id_len bytes: id string (UTF-8)]
  [384 * 4 bytes: float32 LE vector]
```

### 3.2 向量相似边

**新文件**: `wiki/similarity_vec.go` (替换 `wiki/similarity.go`)

```go
// ComputeVectorSimilarityEdges computes cosine-similarity top-K edges.
func ComputeVectorSimilarityEdges(embeddings map[string][]float32, topK int, threshold float64) []Edge
```

- Cosine similarity: `dot(a,b) / (|a| * |b|)`
- Per component: top-3 neighbors with cosine > 0.5 (阈值比 BM25 高，向量更精确)
- Edge: Kind="similar", Source="vector"

**删除**: `wiki/similarity.go` (BM25 实现)

### 3.3 社区标签向量化

**修改**: `wiki/community.go` 的 `CommunityLabels`

新策略:
1. 计算社区质心 = mean(member vectors)
2. 找离质心 cosine 最高的 member → 其 Title 作为标签
3. 比 TF-IDF 更准：语义上最"中心"的成员代表整个社区

### 3.4 前端语义搜索

**新 API**: `GET /api/wiki/embeddings`
- 返回 JSON: `{items: [{id, title, workspace, type, vector}]}`
- 前端缓存到内存(875 × 384 × 4 = 1.3MB)

**新依赖**: `@ternlight/mini` (web 前端)

**新组件**: `web/src/components/SemanticSearch.tsx`
- 搜索框输入 → `embed(query)` (5ms) → cosine 与所有向量 → top-10
- 结果列表：title + type + workspace + similarity score
- 点击结果 → WikiGraph 定位到该节点 / 打开详情

**WikiGraph 增强**:
- 顶部加搜索框
- 输入时 embed + cosine → 匹配节点高亮/放大

**SideRail**: 新增 🔍 搜索视图(独立页)

### 3.5 BuildIndex 集成

```go
// In BuildIndex, replace:
//   simEdges := ComputeSimilarityEdges(allComponents, 3, 0.3)
// With:
embeddings, err := ComputeEmbeddings(allComponents, scriptPath)
if err == nil {
    SaveEmbeddings(cacheFile, embeddings)
    simEdges := ComputeVectorSimilarityEdges(embeddings, 3, 0.5)
}
```

## 4. Phase B: fsnotify 增量索引

### 4.1 Watcher

**新文件**: `wiki/watcher.go`

```go
type Watcher struct {
    api       *API
    debounce  time.Duration
    batchDebounce time.Duration // for community re-detection
    scriptPath string
}

func NewWatcher(api *API, scriptPath string) *Watcher
func (w *Watcher) Start(paths []string) error
func (w *Watcher) Stop()
```

**Watch 目标**:
- `<workspace>/openspec/changes/` (递归)
- `<workspace>/docs/superpowers/` (递归)
- 过滤: 只关心 `.md` 和 `.comet.yaml` 文件

**Debounce**:
- 文件事件 → 2s debounce → batch 处理
- 社区重检测 → 10s debounce (避免频繁 Louvain)

### 4.2 增量更新逻辑

```go
func (w *Watcher) processChanges(events []FileEvent) {
    // 1. Classify: added / modified / deleted
    // 2. For deleted: remove from graph + remove edges + remove embedding
    // 3. For added/modified:
    //    a. re-ScanComponent(file) → upsert
    //    b. invalidate old edges from/to this component
    //    c. re-extract edges (YAML/markdown/internal)
    //    d. IncrementalEmbed([changed component])
    //    e. recompute top-K neighbors for this component only
    // 4. Rebuild graph with patched data
    // 5. Schedule community re-detection (debounced 10s)
}
```

### 4.3 Graph Patch 机制

**修改**: `wiki/graph.go`

```go
// PatchGraph applies incremental changes without full rebuild.
func (g *Graph) Patch(
    addComponents []Component,
    removeComponentIDs []string,
    addEdges []Edge,
    removeEdgesFrom []string, // remove all edges where From == id
) *Graph
```

返回新 Graph(immutable swap pattern)。API 的 `a.graph` 用 atomic pointer swap。

### 4.4 前端热更新

**新 API**: `GET /api/wiki/events` (SSE)

```
event: graph-updated
data: {"changed":3,"added":1,"removed":0}

event: embeddings-updated
data: {"ids":["path/to/file.md"]}
```

**前端**:
- WikiGraph/WikiTimeline 监听 SSE → auto refetch
- SemanticSearch 监听 embeddings-updated → 增量更新本地向量缓存

### 4.5 main.go 集成

```go
// After wiki index initial build:
watcher := wiki.NewWatcher(wikiAPI, embedScriptPath)
watcher.Start(workspacePaths)
defer watcher.Stop()
```

## 5. 验收标准

| Phase | 验收 |
|-------|------|
| A | 向量相似边替换 BM25；前端搜索 "安全" 能在 <50ms 返回安全类 components；社区标签更有意义 |
| B | 修改一个 .md 文件后 <5s 图谱自动更新(无需手动 rebuild)；前端收到 SSE 自动刷新 |

## 6. 文件变更预估

| Phase | 新增 | 修改 | 删除 |
|-------|------|------|------|
| A | scripts/embed.ts, wiki/embed.go, wiki/similarity_vec.go, web SemanticSearch.tsx | wiki/index.go, wiki/community.go, wiki/api.go, main.go, App.tsx, SideRail | wiki/similarity.go |
| B | wiki/watcher.go, wiki/graph_patch.go | wiki/api.go, wiki/graph.go, main.go, 前端 SSE 监听 | — |

## 7. 非目标

- 不做全文搜索(embedding 已覆盖语义需求)
- 不做多用户/协作
- 不做 embedding model 选择 UI(固定用 ternlight)
- 不做向量持久化到 SQLite(二进制文件足够)
