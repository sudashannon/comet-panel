# comet-panel 报告生成 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 comet-panel 内原生生成周报（Markdown）/ 月报（结构化 JSON → 瑞士风 HTML），数据源 = 面板已扫 changes + docs，LLM 复用 chat provider，落盘 `~/.comet-panel/reports/`，附 SideRail 📊 视图、⚙️ 入口（从 ChatBubble 抽出）、切视图关 MarkdownViewer 修复。

**Architecture:** 包内结构（package main，与 scanner.go 同级）放新 `report.go`（handler + 数据组装 + LLM 调用 + 落盘 + 历史）+ `report.tmpl.html`（`//go:embed` 月报模板）。前端新 `ReportView` 组件 + `SettingsPanel` 组件（从 ChatBubble 抽出）+ SideRail 加第 4 视图 + ⚙️ 入口；App.tsx 包 `handleViewChange` 切视图先关 markdown。

**Tech Stack:** Go 1.x 标准库（net/http, html/template, embed, encoding/json）+ React 19 + Vite + TS + Tailwind + Vitest；LLM 驱动复用 `chat.Config` + `chat/provider`。

## Global Constraints

- 必须先把生效的 provider 配置作为 gate：未配 apiKey → POST /api/report 返回 400 + 前端引导到 ⚙️ 设置。
- 周报产物 = **LLM 直接吐 Markdown**，月报产物 = **LLM 吐结构化 JSON → Go 填内嵌瑞士模板（M1，M2 不用）**。
- 阻塞式：`provider.ChatStream` 服务端内部 drain 成完整串，对前端一次性 JSON 响应，不吐 SSE。
- 数据源只覆盖 comet + docs（不含飞书 MR/会议），如实记录在 UI。
- 落盘目录 `~/.comet-panel/reports/`（不存在 MkdirAll），文件名 `<type>-<start>_<end>-<unix>.<md|html>`，GET /api/reports/<name> 路径穿越校验。
- 月报 LLM 返回非法 JSON → 500 「月报数据解析失败，请重试」，不崩服务；Provider 未配置 → 400。
- 切 SideRail 视图必关 MarkdownViewer（图谱内点节点仍可开文档，视图内动作不受影响）。
- 测试：LLM mock 掉（注入函数变量），不测真实 provider；后端测数据组装/gate/模板填充/落盘/路径穿越；前端测 ReportView 交互 + SettingsPanel 迁移 + **markdown 切视图回归**。
- 保留所有现有 data-testid，新增 `report-*` / `settings-panel-*` testid（settings 面板从 chat 迁出保留 `chat-settings-*` 命名以免破坏既有引用、或统一改为 `settings-panel-*`——本 plan 选保留 `chat-settings-*` 既有命名）。
- 全量 `cd web && npx vitest run` + `npx tsc --noEmit` + `go test ./...` + `go vet ./...` 绿。

---

## File Structure

- `report.go` **(新)** — package main；handler + gatherReportData + LLM 调用 + 月报模板填充 + 落盘。
- `report.tmpl.html` **(新)** — `//go:embed` 月报瑞士风单页模板，精简自 `~/.agents/skills/guizang-ppt-skill/assets/template-swiss.html`。
- `report_test.go` **(新)** — 测 gather / gate / 模板填充 / 落盘 / 路径穿越。
- `main.go` — 注册三个 `/api/report*` 路由。
- `web/src/components/ReportView.tsx` **(新)** — 报告视图（参数区/进度/结果/历史）。
- `web/src/components/ReportView.test.tsx` **(新)**
- `web/src/components/SettingsPanel.tsx` **(新)** — 从 ChatBubble 抽出的 provider 设置面板。
- `web/src/components/SettingsPanel.test.tsx` **(新)**（或扩展现有 ChatBubble test 测试迁移后行为）
- `web/src/components/ChatBubble.tsx` — 移除内部 settings 状态/面板/入口（保留 `chat-settings-toggle` testid 不存在；本组件不再提供设置入口）。
- `web/src/components/ChatBubble.test.tsx` — 移除/调整对 settings 的测试（如有）。
- `web/src/components/SideRail.tsx` — Items 加 `report`（📊），底部 ⚙️ 改可点击，props 增加 `onOpenSettings`。
- `web/src/api/client.ts` — 加 `generateReport` / `listReports` / `getReport` / `fetchChatConfig` / `updateChatConfig` / `fetchChatProviders`（后两者已存在，确认导出）。
- `web/src/api/types.ts` — 加 `ReportRequest` / `ReportResponse` / `ReportMeta` 类型。
- `web/src/App.tsx` — view 联合加 `'report'`；包 `handleViewChange` 切视图清 `viewerPath`；挂载 SettingsPanel modal； SideRail onOpenSettings + onSelect(handleViewChange) 接线。
- `web/src/App.test.tsx` — 加 markdown 切换回归测试；保留其他。

---

## Task 1: 后端 report.go — 数据组装 + gate + 周报合成 + 落盘 + 端点

**Files:**
- Create: `report.go`
- Create: `report_test.go`
- Modify: `main.go`（注册 3 路由）

**Interfaces:**
- 内嵌 `report.tmpl.html`（任务 2 同步准备占位可用；本任务先用最小占位编译通过）。
- `gatherReportData(changes []ChangeSummary, start, end, workspaceFilter string) (*ReportData, error)`：纯函数（接收扫描结果，便于测试；不内嵌 LLM/IO 调用）。
- `saveReport(dir, type_, start, end string, body []byte) (name string, err error)`。
- `http.HandleFunc`：`POST /api/report`、`GET /api/reports`（列表）、`GET /api/reports/get`（单份）。
- LLM 注入点：`var chatStream func(ctx context.Context, provider, apiKey, apiBase, model string, messages []provider.Message, opts provider.ChatOptions) (<-chan provider.StreamEvent, error)` ——默认包内用 `provider.Get(active).ChatStream(...)`，测试中替换为返回 mock events 的函数。

- [ ] **Step 1: 写 report_test.go 失败测试（gatherReportData）**

```go
package main

import (
	"testing"
	"time"
)
func makeChg(name, ws, phase, createdAt string, archived bool) ChangeSummary {
	return ChangeSummary{Name: name, Workspace: ws, Phase: phase, CreatedAt: createdAt, Archived: archived, TasksCompleted: 2, TasksTotal: 5, VerifyResult: ""}
}
func TestGatherReportData_FiltersByDateAndWorkspace(t *testing.T) {
	chs := []ChangeSummary{
		makeChg("2026-06-15-a", "miao", "build", "2026-06-15", false),
		makeChg("2026-06-20-b", "miao", "design", "2026-06-20", true),
		makeChg("2026-07-01-c", "rx101", "build", "2026-07-01", false),
	}
	data, err := gatherReportData(chs, "2026-06-01", "2026-06-30", "miao")
	if err != nil { t.Fatal(err) }
	if len(data.Changes) != 2 { t.Fatalf("want 2 in-range miao changes, got %d", len(data.Changes)) }
	names := map[string]bool{}
	for _, c := range data.Changes { names[c.Name] = true }
	if !names["2026-06-15-a"] || !names["2026-06-20-b"] { t.Fatal("missing expected names") }
	if data.Counts.Active < 1 || data.Counts.Archived < 1 { t.Fatalf("counts wrong: %+v", data.Counts) }
}
func TestGatherReportData_NoWorkspaceFilter(t *testing.T) {
	chs := []ChangeSummary{makeChg("2026-06-15-a", "miao", "build", "2026-06-15", false), makeChg("2026-06-16-c", "rx101", "build", "2026-06-16", false)}
	data, _ := gatherReportData(chs, "2026-06-01", "2026-06-30", "")
	if len(data.Changes) != 2 { t.Fatalf("want 2 across workspaces, got %d", len(data.Changes)) }
}
func TestGatherReportData_InclusiveBounds(t *testing.T) {
	chs := []ChangeSummary{makeChg("2026-06-01-edge", "miao", "open", "2026-06-01", false), makeChg("2026-06-30-edge", "miao", "open", "2026-06-30", false)}
	data, _ := gatherReportData(chs, "2026-06-01", "2026-06-30", "")
	if len(data.Changes) != 2 { t.Fatalf("want inclusive bounds, got %d", len(data.Changes)) }
}
func TestGatherReportData_OutOfRange(t *testing.T) {
	chs := []ChangeSummary{makeChg("2026-05-31-old", "miao", "build", "2026-05-31", true), makeChg("2026-07-01-future", "miao", "build", "2026-07-01", false)}
	data, _ := gatherReportData(chs, "2026-06-01", "2026-06-30", "")
	if len(data.Changes) != 0 { t.Fatalf("want 0, got %d", len(data.Changes)) }
}
func TestGatherReportData_BadDateReturnsError(t *testing.T) {
	if _, err := gatherReportData(nil, "garbage", "2026-06-30", ""); err == nil { t.Fatal("want error on bad start") }
}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /home/shanl/workspace/comet-panel && go test -run TestGatherReportData ./...`
Expected: FAIL (`undefined: gatherReportData`)。

- [ ] **Step 3: 实现 gatherReportData**

`report.go`：
```go
package main

import (
	"errors"
	"sort"
	"time"
)

type ReportCounts struct {
	Total, Active, Archived, WithVerifyFail int
}
type ReportChange struct {
	Name, Workspace, Phase, CreatedAt, VerifyResult string
	Archived                                       bool
	TasksDone, TasksTotal                          int
	Why, What                                      string
}
type ReportData struct {
	Range                             struct{ Start, End string }
	Workspace                         string
	Changes                           []ReportChange
	Counts                            ReportCounts
}

func gatherReportData(changes []ChangeSummary, start, end, workspaceFilter string) (*ReportData, error) {
	s, err := time.Parse("2006-01-02", start)
	if err != nil { return nil, errors.New("invalid start: " + err.Error()) }
	e, err := time.Parse("2006-01-02", end)
	if err != nil { return nil, errors.New("invalid end: " + err.Error()) }
	if e.Before(s) { return nil, errors.New("end before start") }
	data := &ReportData{Range: struct{ Start, End string }{start, end}, Workspace: workspaceFilter}
	for _, c := range changes {
		if c.CreatedAt == "" { continue }
		ts, err := time.Parse("2006-01-02", c.CreatedAt[:10])
		if err != nil { continue }
		if ts.Before(s) || ts.After(e) { continue }
		if workspaceFilter != "" && c.Workspace != workspaceFilter { continue }
		dir := filepath.Join(baseDirForWorkspace(c.Workspace), "changes", c.Name)
		if c.Archived { dir = filepath.Join(dir, "..", "archive", c.Name) }
		why, what := readProposalHead(dir)
		data.Changes = append(data.Changes, ReportChange{
			Name: c.Name, Workspace: c.Workspace, Phase: c.Phase,
			CreatedAt: c.CreatedAt, VerifyResult: c.VerifyResult,
			Archived: c.Archived, TasksDone: c.TasksCompleted, TasksTotal: c.TasksTotal,
			Why: why, What: what,
		})
		data.Counts.Total++
		if c.Archived { data.Counts.Archived++ } else { data.Counts.Active++ }
		if c.VerifyResult == "fail" { data.Counts.WithVerifyFail++ }
	}
	sort.Slice(data.Changes, func(i, j int) bool { return data.Changes[i].CreatedAt < data.Changes[j].CreatedAt })
	return data, nil
}
```
辅助函数（同一文件）：
```go
func baseDirForWorkspace(alias string) string {
	for _, ws := range workspaceRegistryAliasSnapshot() {
		if ws.Alias == alias { return ws.Path }
	}
	return ""
}
// workspaceRegistryAliasSnapshot 由 main.go 实现（暴露 package main 的 registry 字段快照）；
// 这里只声明。
var workspaceRegistryAliasSnapshot func() []WorkspaceConfig

func readProposalHead(dir string) (why, what string) {
	data, err := os.ReadFile(filepath.Join(dir, "proposal.md"))
	if err != nil { return "", "" }
	for i, line := range strings.Split(string(data), "\n") {
		h := strings.TrimSpace(line)
		if strings.HasPrefix(h, "## Why") { why = firstParagraphAfter(strings.Split(string(data), "\n"), i) }
		if strings.HasPrefix(h, "## What Changes") { what = firstParagraphAfter(strings.Split(string(data), "\n"), i) }
	}
	return why, what
}
func firstParagraphAfter(lines []string, startIdx int) string {
	var b strings.Builder
	for i := startIdx + 1; i < len(lines); i++ {
		l := strings.TrimSpace(lines[i])
		if l == "" { break }
		if strings.HasPrefix(l, "## ") { break }
		b.WriteString(l); b.WriteString(" ")
	}
	return strings.TrimSpace(b.String())
}
```

- [ ] **Step 4: 在 main.go 提供 registry 快照**

`main.go` 新增：
```go
func init() {
	workspaceRegistryAliasSnapshot = reg.List // capture registry ref
}
```
或在 main() 第一行：`workspaceRegistryAliasSnapshot = reg.List`（注意 reg 已构造）。

- [ ] **Step 5: 跑测试确认通过**

Run: `cd /home/shanl/workspace/comet-panel && go test -run TestGatherReportData ./...`
Expected: PASS（5 个测试）。

- [ ] **Step 6: 写 Gate/Handle 测试**

`report_test.go` 增加：
```go
func TestHandleReport_NoProviderReturns400(t *testing.T) {
	prevCfg, prevUser := chat.LoadConfig, os.Getenv("HOME")
	t.Cleanup(func() { chat.LoadConfig = prevCfg; os.Setenv("HOME", prevUser) })
	tmp := t.TempDir(); os.Setenv("HOME", tmp)
	chat.LoadConfig = func() (*chat.Config, error) { return &chat.Config{ActiveProvider: "minimax", Providers: map[string]chat.ProviderConfig{"minimax": {}}}, nil }
	req := httptest.NewRequest(http.MethodPost, "/api/report", strings.NewReader(`{"type":"weekly","start":"2026-06-01","end":"2026-06-30"}`))
	w := httptest.NewRecorder()
	handleReport(w, req, &WorkspaceRegistry{})
	if w.Code != 400 { t.Fatalf("want 400, got %d", w.Code) }
	if !strings.Contains(w.Body.String(), "请先配置 LLM provider") { t.Fatalf("body = %s", w.Body.String()) }
}
func TestListReports_Empty(t *testing.T) {
	tmp := t.TempDir()
	prevHome, prevDir := os.Getenv("HOME"), reportsDirFn
	t.Cleanup(func() { os.Setenv("HOME", prevHome); reportsDirFn = prevDir })
	os.Setenv("HOME", tmp); reportsDirFn = func() (string, error) { return tmp, nil }
	w := httptest.NewRecorder(); req := httptest.NewRequest(http.MethodGet, "/api/reports", nil)
	handleListReports(w, req)
	if w.Code != 200 { t.Fatalf("want 200, got %d", w.Code) }
	if !strings.Contains(w.Body.String(), "[]") { t.Fatalf("body=%s", w.Body.String()) }
}
func TestGetReport_PathTraversalRejected(t *testing.T) {
	prevDir := reportsDirFn; t.Cleanup(func() { reportsDirFn = prevDir })
	reportsDirFn = func() (string, error) { return t.TempDir(), nil }
	req := httptest.NewRequest(http.MethodGet, "/api/reports/get?name=../evil.md", nil)
	w := httptest.NewRecorder(); handleGetReport(w, req)
	if w.Code != 400 { t.Fatalf("want 400 on traversal, got %d", w.Code) }
}
```

- [ ] **Step 7: 实现 handlers（不含月报 JSON 模板填充，Task 2 单独做）**

`report.go`：
```go
var reportsDirFn = func() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil { return "", err }
	dir := filepath.Join(home, ".comet-panel", "reports")
	return dir, nil
}
var chatStream = provider.Get // placeholder; actual call used inside handler. (Test injects via swap.)
func saveReport(dir, type_, start, end string, body []byte) (string, error) {
	if err := os.MkdirAll(dir, 0755); err != nil { return "", err }
	name := fmt.Sprintf("%s-%s_%s-%d.%s", type_, start, end, time.Now().Unix(), ext(type_))
	p := filepath.Join(dir, name)
	if err := os.WriteFile(p, body, 0644); err != nil { return "", err }
	return name, nil
}
func ext(type_ string) string { if type_ == "monthly" { return "html" }; return "md" }

type reportRequest struct {
	Type, Start, End, Workspace string
}
func handleReport(w http.ResponseWriter, r *http.Request, reg *WorkspaceRegistry) {
	if r.Method != http.MethodPost { writeJSONError(w, "method not allowed", 405); return }
	var req reportRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil { writeJSONError(w, "invalid body", 400); return }
	cfg, _ := chat.LoadConfig()
	pcfg, ok := cfg.Providers[cfg.ActiveProvider]
	if !ok || pcfg.APIKey == "" { writeJSONError(w, "请先配置 LLM provider", 400); return }
	// 同步注入允许测试模拟 LLM
	p := provider.Get(cfg.ActiveProvider)
	if p == nil { writeJSONError(w, "provider not available", 500); return }
	all, _ := scanAllWorkspaces(reg.List())
	data, err := gatherReportData(all, req.Start, req.End, req.Workspace)
	if err != nil { writeJSONError(w, err.Error(), 400); return }
	body := renderReport(req.Type, data, req.Start, req.End, pcfg, p) // defined in Task 2 cross-call
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"format": ext(req.Type), "body": string(body)})
}
func renderReport(type_ string, data *ReportData, start, end string, pcfg chat.ProviderConfig, p provider.Provider) []byte {
	// Task 2 implements monthly path; this task provides a stub that passes the
	// weekly path only and returns a stub for monthly (replaced below).
	if type_ == "weekly" {
		return synthesizeWeekly(data, start, end, pcfg, p) // see Task 1 Step 8
	}
	return synthesizeMonthly(data, start, end, pcfg, p) // implemented in Task 2
}
func handleListReports(w http.ResponseWriter, r *http.Request) {
	dir, _ := reportsDirFn()
	entries, _ := os.ReadDir(dir)
	type meta struct{ Name, Type, Start, End, CreatedAt string }
	out := []meta{}
	for _, e := range entries {
		if e.IsDir() { continue }
		m, ok := parseReportName(e.Name())
		if !ok { continue }
		out = append(out, meta{e.Name(), m.Type, m.Start, m.End, e.ModTime().UTC().Format(time.RFC3339)})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt > out[j].CreatedAt })
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(out)
}
func handleGetReport(w http.ResponseWriter, r *http.Request) {
	name := r.URL.Query().Get("name")
	if name == "" || strings.ContainsAny(name, "/\\") || strings.Contains(name, "..") { writeJSONError(w, "invalid name", 400); return }
	dir, _ := reportsDirFn()
	body, err := os.ReadFile(filepath.Join(dir, filepath.Base(name)))
	if err != nil { writeJSONError(w, "not found", 404); return }
	format := "md"; if strings.HasSuffix(name, ".html") { format = "html" }
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"format": format, "body": string(body)})
}
func parseReportName(name string) (struct{ Type, Start, End string }, bool) {
	// <type>-<start>_<end>-<ts>.<ext>
	parts := strings.SplitN(name, "-", 2)
	if len(parts) != 2 { return struct{ Type, Start, End string }{}, false }
	type_ := parts[0]
	rest := parts[1]
	dash := strings.Index(rest, "-")
	if dash < 0 { return struct{ Type, Start, End string }{}, false }
	// 简化：start 段是 rest 头直到下一个 _, end 是 _ 后直到 -ts
	under := strings.Index(rest, "_")
	if under < 0 { return struct{ Type, Start, End string }{}, false }
	start := rest[:under]
	mid := rest[under+1 : dash]
	end := strings.SplitN(mid, "-", 2)[0]
	return struct{ Type, Start, End string }{type_, start, end}, true
}
```
注：本节中 `renderReport` 中 `synthesizeWeekly` 是 Task 1 Step 8 实现的真实函数；`synthesizeMonthly` 在 Task 2 实现。若 Task 1 阶段编译需要，可临时把 monthly 分支改为返回空。

- [ ] **Step 8: 实现 synthesizeWeekly（阻塞 drain + Prompt）**

```go
func synthesizeWeekly(data *ReportData, start, end string, pcfg chat.ProviderConfig, p provider.Provider) []byte {
	msgs := []provider.Message{{Role: "user", Content: []provider.ContentBlock{{Type: "text", Text: weeklyPrompt(data, start, end)}}}}
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second); defer cancel()
	ch, err := p.ChatStream(ctx, pcfg.APIKey, pcfg.APIBase, pcfg.Model, "", msgs, provider.ChatOptions{Temperature: pcfg.Temperature, MaxTokens: pcfg.MaxTokens, Thinking: pcfg.Thinking})
	if err != nil { return []byte("# 周报生成失败\n\n" + err.Error()) }
	var buf strings.Builder
	for ev := range ch {
		if ev.Type == "delta" { buf.WriteString(ev.Content) }
	}
	body := strings.TrimSpace(buf.String())
	if body == "" { body = "# 周报\n\n（本区间无内容）" }
	return []byte(body)
}
func weeklyPrompt(data *ReportData, start, end string) string {
	// ... 套 weekly-skill 模板：概述 / 主题表 / 关键成果 / 下周计划；JSON 化 data 输入
	...
}
```
prompt 在 prompt 段落里补全具体结构（用 `data.Changes` 序列化为简表，序列化方法同下）。

- [ ] **Step 9: prompt 与序列化 helper**

```go
type wireChange struct{ Date, Name, Phase, Verify string; TasksDone, TasksTotal int; Why, What string; Archived bool; Workspace string }
func dumpData(data *ReportData) []wireChange {
	out := make([]wireChange, 0, len(data.Changes))
	for _, c := range data.Changes {
		out = append(out, wireChange{c.CreatedAt[:10], c.Name, c.Phase, c.VerifyResult, c.TasksDone, c.TasksTotal, c.Why, c.What, c.Archived, c.Workspace})
	}
	return out
}
```
`weeklyPrompt` 文中：先用 `json.Marshal(dumpData(data))` 作为语料附加到 Markdown 骨架后；要求 LLM 输出 Markdown 涵盖：1) 概述 2) 主题表格（按 workspace/子系统分组）3) 关键成果 4) 下周计划。

- [ ] **Step 10: 写注入式 LLM mock 测试**

`report_test.go`：
```go
type fakeStream struct{ events []provider.StreamEvent }
func (f fakeStream) ToChan() <-chan provider.StreamEvent {
	ch := make(chan provider.StreamEvent); go func() { for _, e := range f.events { ch <- e }; close(ch) }(); return ch
}
func TestWeekly_BlockedDrainReceivesFullText(t *testing.T) {
	orig := chatStreamDrain
	chatStreamDrain = func(ctx context.Context, p provider.Provider, pcfg chat.ProviderConfig, userMsg string) (string, error) {
		return "# 测试周报\n\n本周变更 3 项，含 build 阶段推进。", nil
	}
	t.Cleanup(func() { chatStreamDrain = orig })
	data := &ReportData{} // 空集也合法
	pcfg := chat.ProviderConfig{APIKey: "fake", APIBase: "x", Model: "m", Temperature: 0.5, MaxTokens: 1024, Thinking: "auto"}
	out := synthesizeWeekly(data, "2026-06-01", "2026-06-30", pcfg, nil)
	if !strings.Contains(string(out), "测试周报") { t.Fatalf("want markdown to include fake text; got %s", out) }
}
```
将 `synthesizeWeekly` 内的 ChatStream 调用抽到 `chatStreamDrain(ctx, p, pcfg, systemPrompt) (string, error)` 包级函数变量，handlers 默认实现调用 `p.ChatStream` 然后 drain。Task 1 实现 + 测试同步调整。

- [ ] **Step 11: 注册路由 + 编译**

Run: `cd /home/shanl/workspace/comet-panel && go build -o comet-panel . && go vet ./...`
Expected: 无输出 / exit 0。
`main.go` 加：
```go
mux.HandleFunc("/api/report", func(w http.ResponseWriter, r *http.Request) { handleReport(w, r, reg) })
mux.HandleFunc("/api/reports", handleListReports)
mux.HandleFunc("/api/reports/get", handleGetReport)
```

- [ ] **Step 12: 跑后端测试 + go test**

Run: `cd /home/shanl/workspace/comet-panel && go test ./...`
Expected: PASS（含 Task 2 monthly 后再全跑一次）。

- [ ] **Step 13: Commit**

```bash
git add main.go report.go report_test.go
git commit -m "feat(report): 数据组装 + provider gate + 周报 Markdown + 落盘 + 端点"
```

---

## Task 2: 月报 JSON→瑞士模板填充（LLM M1 路径）

**Files:**
- Create: `report.tmpl.html`（精简瑞士风单页，`//go:embed`）
- Modify: `report.go`（加 `synthesizeMonthly` + `monthlyPrompt` + JSON 解析 + 模板执行）
- Modify: `report_test.go`（JSON→HTML 测试 + 非法 JSON 错误测试）

**Interfaces:**
- 嵌入文件：`//go:embed report.tmpl.html` `var reportTmplHTML string`
- 月报 JSON schema（与 prompt 一致）：
```json
{
  "title": "...", "period": "2026.06",
  "kpis": {"total": 12, "active": 8, "themes": 4, "reports": 3, "platforms": 2},
  "overview": "三句主线...",
  "themes": [{"name": "...", "count": 5, "items": ["..."]}],
  "highlights": {"left": {"title": "...", "points": ["..."]}, "right": {"title": "...", "points": ["..."]}},
  "milestones": [{"date": "2026-06-12", "text": "..."}]
}
```
- `synthesizeMonthly(data, start, end, pcfg, p) []byte`：阻塞调 LLM（system prompt 严令 JSON only）→ 解析 → 渲染模板（占位替换）→ 返回 HTML bytes。

- [ ] **Step 1: 写失败测试**

```go
func TestRenderMonthlyJSON_ProducesHTML(t *testing.T) {
	data := []byte(`{"title":"6 月","period":"2026.06","kpis":{"total":10,"active":5,"themes":3,"reports":2,"platforms":1},"overview":"主线。","themes":[{"name":"X","count":5,"items":["a"]}],"highlights":{"left":{"title":"L","points":["p"]},"right":{"title":"R","points":["q"]}},"milestones":[{"date":"2026-06-12","text":"m"}]}`)
	out, err := renderMonthlyFromJSON(data)
	if err != nil { t.Fatal(err) }
	musts := []string{"6 月", "2026.06", "10", "主线。", "X", "L", "2026-06-12"}
	for _, m := range musts { if !strings.Contains(string(out), m) { t.Fatalf("want output to contain %q; got %s", m, out) } }
	if !strings.HasPrefix(string(out), "<!DOCTYPE html>") { t.Fatal("want HTML doctype") }
}
func TestRenderMonthlyJSON_InvalidReturnsError(t *testing.T) {
	if _, err := renderMonthlyFromJSON([]byte("not json")); err == nil { t.Fatal("want error on bad JSON") }
}
```

- [ ] **Step 2: 准备精简模板 report.tmpl.html**

`report.tmpl.html`（精简版，IKB 蓝、Lucide 图标、KPI 顶栏、2×3 主题卡、双栏重点、里程碑时间线；保留 Google Fonts 链接与 `<script>lucide.createIcons();</script>`）：
```html
<!DOCTYPE html><html lang="zh-CN"><head>
<meta charset="UTF-8"><title>{{TITLE}}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Noto+Sans+SC:wght@400;700&display=swap" rel="stylesheet">
<style>:root{--paper:#fafaf8;--ink:#0a0a0a;--accent:#002FA7;--grey-1:#f0f0ee;--grey-2:#d4d4d2;--grey-3:#737373}body{margin:0;background:var(--paper);color:var(--ink);font-family:"Inter","Noto Sans SC",sans-serif;padding:36px 56px}.kpi{display:flex;gap:32px;border-top:1px solid var(--grey-2);padding:24px 0}.kpi>div{flex:1}.kpi b{font-size:48px;font-weight:200;display:block}.kpi small{color:var(--grey-3);font-size:12px;text-transform:uppercase}.themes{display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px;margin:24px 0}.theme{border-top:2.5px solid var(--accent);padding-top:12px}.theme b{font-size:32px}.highlights{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin:24px 0}.timeline{display:flex;margin:24px 0}.timeline .m{flex:1;border-left:1px solid var(--grey-2);padding-left:8px}h1{font-size:36px;margin:0 0 8px}.overview{color:var(--grey-3);font-size:14px}</style>
</head><body>
<h1>{{TITLE}}</h1><div class="overview">{{OVERVIEW}}</div>
<div class="kpi">
  <div><b>{{TOTAL}}</b><small>总数</small></div>
  <div><b>{{ACTIVE}}</b><small>活跃</small></div>
  <div><b>{{THEMES}}</b><small>主题</small></div>
  <div><b>{{REPORTS}}</b><small>报告</small></div>
  <div><b>{{PLATFORMS}}</b><small>新平台</small></div>
</div>
<section class="themes">{{THEMES_HTML}}</section>
<section class="highlights">{{HIGHLIGHTS_HTML}}</section>
<section class="timeline">{{MILESTONES_HTML}}</section>
<script src="https://unpkg.com/lucide@latest"></script><script>lucide.createIcons();</script>
</body></html>
```

- [ ] **Step 3: 实现 renderMonthlyFromJSON + 渲染 helper**

```go
import _ "embed"
//go:embed report.tmpl.html
var reportTmplHTML string

func renderMonthlyFromJSON(raw []byte) ([]byte, error) {
	var payload struct {
		Title, Period string
		Kpis struct{ Total, Active, Themes, Reports, Platforms int }
		Overview string
		Themes []struct{ Name string; Count int; Items []string }
		Highlights struct{ Left, Right struct{ Title string; Points []string } }
		Milestones []struct{ Date, Text string }
	}
	if err := json.Unmarshal(raw, &payload); err != nil { return nil, err }
	themesHTML := renderThemes(payload.Themes); highlightsHTML := renderHighlights(payload.Highlights.Left, payload.Highlights.Right); milestonesHTML := renderMilestones(payload.Milestones)
	out := reportTmplHTML
	out = strings.ReplaceAll(out, "{{TITLE}}", html.EscapeString(payload.Title))
	out = strings.ReplaceAll(out, "{{OVERVIEW}}", html.EscapeString(payload.Overview))
	out = strings.ReplaceAll(out, "{{TOTAL}}", strconv.Itoa(payload.Kpis.Total))
	out = strings.ReplaceAll(out, "{{ACTIVE}}", strconv.Itoa(payload.Kpis.Active))
	out = strings.ReplaceAll(out, "{{THEMES}}", strconv.Itoa(payload.Kpis.Themes))
	out = strings.ReplaceAll(out, "{{REPORTS}}", strconv.Itoa(payload.Kpis.Reports))
	out = strings.ReplaceAll(out, "{{PLATFORMS}}", strconv.Itoa(payload.Kpis.Platforms))
	out = strings.ReplaceAll(out, "{{THEMES_HTML}}", themesHTML)
	out = strings.ReplaceAll(out, "{{HIGHLIGHTS_HTML}}", highlightsHTML)
	out = strings.ReplaceAll(out, "{{MILESTONES_HTML}}", milestonesHTML)
	return []byte(out), nil
}
```
`renderThemes/Highlights/Milestones` 三个 helper 写为字符串拼接（小函数，不引用 html/template 因为模板本身是字符串）。

- [ ] **Step 4: 实现 synthesizeMonthly**

```go
func synthesizeMonthly(data *ReportData, start, end string, pcfg chat.ProviderConfig, p provider.Provider) []byte {
	msgs := []provider.Message{{Role: "user", Content: []provider.ContentBlock{{Type: "text", Text: monthlyPrompt(data, start, end)}}}}
	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second); defer cancel()
	ch, err := p.ChatStream(ctx, pcfg.APIKey, pcfg.APIBase, pcfg.Model, monthlySystemPrompt(), msgs, provider.ChatOptions{Temperature: pcfg.Temperature, MaxTokens: pcfg.MaxTokens, Thinking: pcfg.Thinking})
	if err != nil { return []byte("<html><body>月报生成失败</body></html>") }
	var buf strings.Builder
	for ev := range ch { if ev.Type == "delta" { buf.WriteString(ev.Content) } }
	rendered, err := renderMonthlyFromJSON([]byte(strings.TrimSpace(buf.String())))
	if err != nil {
		// fallback：展示原始 LLM 输出并附错误
		return []byte("<html><body>月报数据解析失败，请重试<pre>" + html.EscapeString(buf.String()) + "</pre></body></html>")
	}
	return rendered
}
func monthlySystemPrompt() string { return "你是工作汇报助手，输出严格 JSON，不含任何前后说明、代码块或额外文本。schema: {...}" }
```

- [ ] **Step 5: monthlyPrompt 套 weekly-skill 的归类原则**

主题卡 ≤6（按 workspace/子系统）；highlights 双栏 6 条；milestones ~9 条。

- [ ] **Step 6: 跑测试确认通过**

Run: `cd /home/shanl/workspace/comet-panel && go test -run TestRenderMonthly ./...`
Expected: PASS（2 tests）。

- [ ] **Step 7: 全量后端测试**

Run: `cd /home/shanl/workspace/comet-panel && go test ./... && go vet ./...`
Expected: 全绿，无 vet warning。

- [ ] **Step 8: visual 早期验收 gate ★**

写一个 `_demo/main.go`（临时）或单元测试内调用 `renderMonthlyFromJSON` 给一组合成 JSON，写到 `/tmp/monthly-demo.html`；用 browser 打开（`file:///tmp/monthly-demo.html`）截图给用户看月报版式；用户认可后继续；不认可则改模板迭代。**这是 plan 的早期 gate**。
```go
func TestRenderDemo_WriteFileForScreenshot(t *testing.T) {
	if os.Getenv("REPORT_DEMO") == "" { t.Skip("set REPORT_DEMO=1 to write demo html") }
	raw := []byte(`{"title":"demo","period":"2026.06","kpis":{"total":66,"active":17,"themes":6,"reports":12,"platforms":2},"overview":"三句主线。","themes":[{"name":"总线","count":15,"items":["a"]}],"highlights":{"left":{"title":"X","points":["p"]},"right":{"title":"Y","points":["q"]}},"milestones":[{"date":"2026-06-12","text":"m"}]}`)
	out, _ := renderMonthlyFromJSON(raw)
	os.WriteFile("/tmp/monthly-demo.html", out, 0644)
}
```

- [ ] **Step 9: Commit**

```bash
git add report.go report.tmpl.html report_test.go
git commit -m "feat(report): 月报 M1（结构化 JSON → 内嵌瑞士模板）"
```

---

## Task 3: SettingsPanel 抽出 + SideRail ⚙️ 入口

**Files:**
- Create: `web/src/components/SettingsPanel.tsx` + `.test.tsx`
- Modify: `web/src/components/ChatBubble.tsx`（移除内部 settings 状态/面板）
- Modify: `web/src/components/ChatBubble.test.tsx`（移除对应测试或断言）
- Modify: `web/src/components/SideRail.tsx`（items 不变；底部 ⚙️ 改可点击，新 props `onOpenSettings`）
- Modify: `web/src/api/client.ts` / `types.ts`（确认导出 fetchChatConfig / updateChatConfig / fetchChatProviders ——已有）

**Interfaces:**
- `SettingsPanel` 作为独立组件，接收 `onClose: () => void`，内部 state 管理 provider/model/apiKey/temperature/maxTokens/thinking/saved/error；调 `fetchChatProviders` + `fetchChatConfig`；保存调 `updateChatConfig`。
- 保留所有现有 `chat-settings-*` testid（不迁移改名以避免破坏既有断言）。

- [ ] **Step 1: 写 SettingsPanel 失败测试**

`web/src/components/SettingsPanel.test.tsx`：
```tsx
import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { SettingsPanel } from './SettingsPanel'
vi.mock('../api/client', () => ({
	fetchChatProviders: vi.fn().mockResolvedValue({ providers: [{name:'minimax', models:['MiniMax-M3'], supports_images:false}], active:'minimax' }),
	fetchChatConfig: vi.fn().mockResolvedValue({ active_provider:'minimax', providers:{ minimax:{model:'MiniMax-M3', api_key:'*', temperature:0.7, max_tokens:4096, thinking:'auto'} } }),
	updateChatConfig: vi.fn().mockResolvedValue({}),
}))
describe('SettingsPanel', () => {
	it('loads and shows provider/model/apiKey fields', async () => {
		render(<SettingsPanel onClose={()=>{}} />)
		await waitFor(() => expect(screen.getByTestId('chat-settings-provider')).toBeTruthy())
		expect(screen.getByTestId('chat-settings-model')).toBeTruthy()
		expect(screen.getByTestId('chat-settings-api-key')).toBeTruthy()
	})
	it('save calls updateChatConfig and closes on success', async () => { ... })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd web && npx vitest run src/components/SettingsPanel.test.tsx`
Expected: FAIL（未实现）。

- [ ] **Step 3: 抽 SettingsPanel 实现**

把 ChatBubble 现有 openSettings/handleProviderChange/handleSaveSettings/state 等价搬入新组件；UI 形态保持原 chat-settings-panel 结构；不依赖 ChatBubble。

- [ ] **Step 4: 跑 SettingsPanel 测试确认通过**

Run: `cd web && npx vitest run src/components/SettingsPanel.test.tsx`
Expected: PASS。

- [ ] **Step 5: 改 ChatBubble 移除 settings**

`ChatBubble.tsx`：删除 settings 相关 state、openSettings、handleProviderChange、handleSaveSettings；删除 `⚙ 设置` 按钮及其渲染分支；保留聊天功能完整。settings 相关 testid 在本组件中应消失。

- [ ] **Step 6: 改 SideRail 可点击 + 暴露 onOpenSettings**

`SideRail.tsx`：
```tsx
interface SideRailProps {
  view: View
  onSelect: (v: View) => void
  onOpenSettings?: () => void
}
```
底部 ⚙️ 按钮：`onClick={onOpenSettings ?? undefined}`，`disabled={!onOpenSettings}` 但若有则为 false。

- [ ] **Step 7: App 接 SettingsPanel modal + SideRail.onOpenSettings**

`App.tsx`：
```tsx
const [settingsOpen, setSettingsOpen] = useState(false)
// 包 modal：<SettingsPanel ... > 渲染在顶层（fixed/portal 或 inline）
<SideRail view={view} onSelect={handleViewChange} onOpenSettings={() => setSettingsOpen(true)} />
{settingsOpen && <div className="fixed inset-0 ..."><SettingsPanel onClose={() => setSettingsOpen(false)} /></div>}
```

- [ ] **Step 8: 更新 ChatBubble.test.tsx**

移除对 `chat-settings-toggle` 等 testid 的断言（如果有）；保留聊天功能测试不变。

- [ ] **Step 9: 跑全量 + tsc**

Run: `cd web && npx vitest run && npx tsc --noEmit`
Expected: 全绿。

- [ ] **Step 10: Commit**

```bash
git add web/src/components/SettingsPanel.tsx web/src/components/SettingsPanel.test.tsx web/src/components/ChatBubble.tsx web/src/components/ChatBubble.test.tsx web/src/components/SideRail.tsx web/src/App.tsx
git commit -m "refactor(ui): provider 设置面板从 ChatBubble 抽出到 SettingsPanel，SideRail ⚙️ 接入"
```

---

## Task 4: ReportView + SideRail 📊 + markdown 切视图修复

**Files:**
- Create: `web/src/components/ReportView.tsx` + `.test.tsx`
- Modify: `web/src/components/SideRail.tsx`（Items 加 `report`）
- Modify: `web/src/api/client.ts` / `types.ts`（加 Report 端点）
- Modify: `web/src/App.tsx`（view 联合加 `'report'`；`handleViewChange`；挂载 ReportView）
- Modify: `web/src/App.test.tsx`（切视图关 markdown 回归）

**Interfaces:**
- `ReportView`：`{ workspace: string; workspaces: WorkspaceConfig[] }`，内部 state：参数 + 生成结果 + 历史列表；调 `generateReport` / `listReports` / `getReport`。
- `MarkdownViewer` 接受 `body`（markdown 字符串）+ 可选 `path`（由原 sign 里也用过 path）；本视图新增传 body 渲染。
- `handleViewChange(v)`：先 `setViewerPath(null)`，再 `setView(v)`。

- [ ] **Step 1: 加 client + types**

`web/src/api/types.ts`：
```ts
export type ReportType = 'weekly' | 'monthly'
export interface ReportRequest { type: ReportType; start: string; end: string; workspace?: string }
export interface ReportResponse { format: 'markdown' | 'html'; body: string }
export interface ReportMeta { name: string; type: ReportType; start: string; end: string; createdAt: string }
```
`web/src/api/client.ts`：
```ts
export async function generateReport(req: ReportRequest): Promise<ReportResponse> { ... POST /api/report ... }
export async function listReports(): Promise<ReportMeta[]> { ... GET /api/reports ... }
export async function getReport(name: string): Promise<ReportResponse> { ... GET /api/reports/get?name=... ... }
```

- [ ] **Step 2: 写 ReportView 失败测试**

覆盖：(1) 渲染参数控件 (2) gate 引导态显示（mock provider 不可用；或 fetchChatConfig 返回 empty APIKey） (3) 生成按钮 → 调 generateReport (4) 生成中显示进度态 (5) 结果渲染：周报传 body 到 MarkdownViewer / 月报挂 iframe (6) 历史列表点击加载。

- [ ] **Step 3: 跑测试确认失败 → 实现 ReportView**

实现要点：
```tsx
function isProviderReady(cfg: ChatConfig | null) {
	if (!cfg) return false
	const active = cfg.active_provider
	const pcfg = cfg.providers?.[active]
	return !!(pcfg?.api_key && pcfg.api_key !== '')
}
```
未 ready 时显示引导卡片「请先在 ⚙ 设置中配置 LLM provider」+「去设置」按钮。
ready 时显示参数区（区间预设 + 自定义起止 + workspace 多选 + 类型 radio）+「生成」+ 进度态（"正在汇总 N 个 change… 合成中…"）+ 结果区（`<MarkdownViewer body={md}/>` 或 `<iframe srcDoc={html} className="w-full h-full" />`）+ 下载按钮 `<a href={URL.createObjectURL(blob)} download>` + 历史列表。

- [ ] **Step 4: 跑 ReportView 测试确认通过**

Run: `cd web && npx vitest run src/components/ReportView.test.tsx`
Expected: PASS。

- [ ] **Step 5: SideRail Items 加 report + App 接线**

SideRail `ITEMS` 加 `{ key:'report', label:'报告', icon:'📊' }`；View 联合扩展；App `handleViewChange` 包；条件渲染 `<ReportView />`。

- [ ] **Step 6: 写 App.test.tsx markdown 切视图回归**

```tsx
it('switching view in SideRail closes the open MarkdownViewer', async () => {
	render(<App />)
	// 触发打开 viewer（mock fetchChangeDetail/fetchArtifactContent）
	// ...
	await userEvent.click(screen.getByRole('button', { name: '图谱' }))
	expect(viewerNotPresent()) // viewerPath 已被清空
})
```
具体定位靠现有 testid（`markdown-viewer` 或 RouteViewer 等，需在测试中先确认实际存在性）。

- [ ] **Step 7: 跑全量 + tsc**

Run: `cd web && npx vitest run && npx tsc --noEmit`
Expected: 全绿（≥上次 145 个）。

- [ ] **Step 8: Commit**

```bash
git add web/src/components/ReportView.tsx web/src/components/ReportView.test.tsx web/src/components/SideRail.tsx web/src/api/client.ts web/src/api/types.ts web/src/App.tsx web/src/App.test.tsx
git commit -m "feat(report): ReportView + SideRail 📊 + 切视图关 MarkdownViewer 修复"
```

---

## Task 5: 全量验证 + 构建 + 视觉验收（周报/月报/设置/切换）

**Files:** 无新增（收尾任务）。

- [ ] **Step 1: 全量前端 + tsc**

Run: `cd /home/shanl/workspace/comet-panel/web && npx vitest run && npx tsc --noEmit`
Expected: 全绿。

- [ ] **Step 2: 全量 Go 测试 + vet**

Run: `cd /home/shanl/workspace/comet-panel && go test ./... && go vet ./...`
Expected: 全绿。

- [ ] **Step 3: 构建 + 重启**

Run: `make build && systemctl --user restart comet-panel && sleep 3 && curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8989/`
Expected: :8989 200。

- [ ] **Step 4: 视觉验收**

打开 :8989：
- SideRail 出现 📊 报告（4 个视图）+ 底部 ⚙️ 可点击 → 打开 SettingsPanel。
- 没配 provider 时点 📊 报告显示引导，可点跳设置。
- 配 provider 后生成周报/月报 → 周报进 MarkdownViewer / 月报进 iframe + 下载。
- 切换 📊 ↔ changes 等视图 → MarkdownViewer 关闭（关键回归）。
- 历史列表正确加载、点击重看。

- [ ] **Step 5: 兜底 commit（如有尾调）**

```bash
git add -A && git commit -m "chore(report): 视觉/集成验收微调"
```
