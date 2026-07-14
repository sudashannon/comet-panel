package main

import (
	"context"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"comet-ui/chat"
	"comet-ui/chat/provider"
)

// ReportCounts summarizes the changes gathered for a report window.
type ReportCounts struct {
	Total, Active, Archived, WithVerifyFail int
}

// ReportChange is the per-change slice of data fed into report synthesis.
type ReportChange struct {
	Name, Workspace, Phase, CreatedAt, VerifyResult string
	Archived                                        bool
	TasksDone, TasksTotal                           int
	Why, What                                       string
}

// ReportData is the assembled corpus handed to the LLM (weekly Markdown) or
// the M1 template filler (monthly HTML, Task 2).
type ReportData struct {
	Range     struct{ Start, End string }
	Workspace string
	Changes   []ReportChange
	Counts    ReportCounts
}

// gatherReportData filters and aggregates scanner output into ReportData.
// Pure function: no LLM/IO calls, so it is directly unit-testable against
// hand-built ChangeSummary fixtures.
func gatherReportData(changes []ChangeSummary, start, end, workspaceFilter string) (*ReportData, error) {
	s, err := time.Parse("2006-01-02", start)
	if err != nil {
		return nil, errors.New("invalid start: " + err.Error())
	}
	e, err := time.Parse("2006-01-02", end)
	if err != nil {
		return nil, errors.New("invalid end: " + err.Error())
	}
	if e.Before(s) {
		return nil, errors.New("end before start")
	}
	data := &ReportData{Range: struct{ Start, End string }{start, end}, Workspace: workspaceFilter}
	for _, c := range changes {
		if c.CreatedAt == "" || len(c.CreatedAt) < 10 {
			continue
		}
		ts, err := time.Parse("2006-01-02", c.CreatedAt[:10])
		if err != nil {
			continue
		}
		if ts.Before(s) || ts.After(e) {
			continue
		}
		if workspaceFilter != "" && c.Workspace != workspaceFilter {
			continue
		}
		dir := changeDirFor(c)
		why, what := readProposalHead(dir)
		data.Changes = append(data.Changes, ReportChange{
			Name:         c.Name,
			Workspace:    c.Workspace,
			Phase:        c.Phase,
			CreatedAt:    c.CreatedAt,
			VerifyResult: c.VerifyResult,
			Archived:     c.Archived,
			TasksDone:    c.TasksCompleted,
			TasksTotal:   c.TasksTotal,
			Why:          why,
			What:         what,
		})
		data.Counts.Total++
		if c.Archived {
			data.Counts.Archived++
		} else {
			data.Counts.Active++
		}
		if c.VerifyResult == "fail" {
			data.Counts.WithVerifyFail++
		}
	}
	sort.Slice(data.Changes, func(i, j int) bool { return data.Changes[i].CreatedAt < data.Changes[j].CreatedAt })
	return data, nil
}

// changeDirFor resolves the on-disk directory for a change so its
// proposal.md can be read for the "Why"/"What Changes" summary.
func changeDirFor(c ChangeSummary) string {
	base := baseDirForWorkspace(c.Workspace)
	if base == "" {
		return ""
	}
	sub := "changes"
	if c.Archived {
		sub = filepath.Join("changes", "archive")
	}
	return filepath.Join(base, "openspec", sub, c.Name)
}

// baseDirForWorkspace looks up the workspace root path by alias via the
// registry snapshot wired up from main().
func baseDirForWorkspace(alias string) string {
	if workspaceRegistryAliasSnapshot == nil {
		return ""
	}
	for _, ws := range workspaceRegistryAliasSnapshot() {
		if ws.Alias == alias {
			return ws.Path
		}
	}
	return ""
}

// workspaceRegistryAliasSnapshot is wired up in main() to reg.List, exposing
// the live WorkspaceRegistry contents to this file without report.go having
// to hold its own *WorkspaceRegistry reference at package-var scope.
var workspaceRegistryAliasSnapshot func() []WorkspaceConfig

// readProposalHead extracts the first paragraph following the "## Why" and
// "## What Changes" headings in a change's proposal.md, if present.
func readProposalHead(dir string) (why, what string) {
	if dir == "" {
		return "", ""
	}
	data, err := os.ReadFile(filepath.Join(dir, "proposal.md"))
	if err != nil {
		return "", ""
	}
	lines := strings.Split(string(data), "\n")
	for i, line := range lines {
		h := strings.TrimSpace(line)
		if strings.HasPrefix(h, "## Why") {
			why = firstParagraphAfter(lines, i)
		}
		if strings.HasPrefix(h, "## What Changes") {
			what = firstParagraphAfter(lines, i)
		}
	}
	return why, what
}

func firstParagraphAfter(lines []string, startIdx int) string {
	var b strings.Builder
	for i := startIdx + 1; i < len(lines); i++ {
		l := strings.TrimSpace(lines[i])
		if l == "" {
			break
		}
		if strings.HasPrefix(l, "## ") {
			break
		}
		b.WriteString(l)
		b.WriteString(" ")
	}
	return strings.TrimSpace(b.String())
}

// reportsDirFn resolves ~/.comet-panel/reports/, overridable in tests.
var reportsDirFn = func() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".comet-panel", "reports"), nil
}

// chatStreamDrain is the LLM injection seam: tests replace it with a fake
// that returns canned text without touching a real provider. The default
// implementation calls p.ChatStream and blocks until the channel closes,
// concatenating every "delta" event into the final response.
var chatStreamDrain = func(ctx context.Context, p provider.Provider, pcfg chat.ProviderConfig, systemPrompt, userText string) (string, error) {
	msgs := []provider.Message{{Role: "user", Content: []provider.ContentBlock{{Type: "text", Text: userText}}}}
	ch, err := p.ChatStream(ctx, pcfg.APIKey, pcfg.APIBase, pcfg.Model, systemPrompt, msgs, provider.ChatOptions{
		Temperature: pcfg.Temperature,
		MaxTokens:   pcfg.MaxTokens,
		Thinking:    pcfg.Thinking,
	})
	if err != nil {
		return "", err
	}
	var buf strings.Builder
	for ev := range ch {
		if ev.Type == "delta" {
			buf.WriteString(ev.Content)
		}
		if ev.Type == "error" && ev.Error != "" {
			return buf.String(), errors.New(ev.Error)
		}
	}
	return buf.String(), nil
}

func ext(type_ string) string {
	if type_ == "monthly" {
		return "html"
	}
	return "md"
}

// saveReport persists a generated report body under dir, naming it
// <type>-<start>_<end>-<unix>.<md|html>, creating dir if needed.
func saveReport(dir, type_, start, end string, body []byte) (string, error) {
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", err
	}
	name := fmt.Sprintf("%s-%s_%s-%d.%s", type_, start, end, time.Now().Unix(), ext(type_))
	if err := os.WriteFile(filepath.Join(dir, name), body, 0644); err != nil {
		return "", err
	}
	return name, nil
}

type reportRequest struct {
	Type      string `json:"type"`
	Start     string `json:"start"`
	End       string `json:"end"`
	Workspace string `json:"workspace"`
}

// handleReport is POST /api/report: gates on a configured LLM provider,
// assembles ReportData from the live scan, synthesizes the report body
// (weekly Markdown via LLM; monthly is a Task 2 placeholder), persists it,
// and returns the body to the caller even if persistence fails.
func handleReport(w http.ResponseWriter, r *http.Request, reg *WorkspaceRegistry) {
	if r.Method != http.MethodPost {
		writeJSONError(w, "method not allowed", 405)
		return
	}
	var req reportRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "invalid body", 400)
		return
	}
	if req.Type != "weekly" && req.Type != "monthly" {
		writeJSONError(w, "invalid report type", 400)
		return
	}
	cfg, err := chat.LoadConfig()
	if err != nil || cfg == nil {
		writeJSONError(w, "请先配置 LLM provider", 400)
		return
	}
	pcfg, ok := cfg.Providers[cfg.ActiveProvider]
	if !ok || pcfg.APIKey == "" {
		writeJSONError(w, "请先配置 LLM provider", 400)
		return
	}
	p := provider.Get(cfg.ActiveProvider)
	if p == nil {
		writeJSONError(w, "provider not available", 500)
		return
	}
	all, _ := scanAllWorkspaces(reg.List())
	data, err := gatherReportData(all, req.Start, req.End, req.Workspace)
	if err != nil {
		writeJSONError(w, err.Error(), 400)
		return
	}

	var body []byte
	if req.Type == "weekly" {
		body = synthesizeWeekly(data, req.Start, req.End, pcfg, p)
	} else {
		var err error
		body, err = synthesizeMonthly(data, req.Start, req.End, pcfg, p)
		if err != nil {
			writeJSONError(w, err.Error(), 500)
			return
		}
	}

	dir, dirErr := reportsDirFn()
	var savedName string
	if dirErr == nil {
		name, saveErr := saveReport(dir, req.Type, req.Start, req.End, body)
		if saveErr != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(500)
			json.NewEncoder(w).Encode(map[string]any{
				"error":  "落盘失败: " + saveErr.Error(),
				"format": ext(req.Type),
				"body":   string(body),
			})
			return
		}
		savedName = name
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"format": ext(req.Type), "body": string(body), "savedName": savedName})
}

// synthesizeWeekly builds the weekly-report prompt from ReportData and
// blocks on chatStreamDrain to get the full LLM Markdown response.
func synthesizeWeekly(data *ReportData, start, end string, pcfg chat.ProviderConfig, p provider.Provider) []byte {
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	text, err := chatStreamDrain(ctx, p, pcfg, "", weeklyPrompt(data, start, end))
	if err != nil {
		return []byte("# 周报生成失败\n\n" + err.Error())
	}
	body := strings.TrimSpace(text)
	if body == "" {
		body = "# 周报\n\n（本区间无内容）"
	}
	return []byte(body)
}

// wireChange is the serialized-for-the-LLM shape of a ReportChange.
type wireChange struct {
	Date, Name, Phase, Verify string
	TasksDone, TasksTotal     int
	Why, What                 string
	Archived                  bool
	Workspace                 string
}

func dumpData(data *ReportData) []wireChange {
	out := make([]wireChange, 0, len(data.Changes))
	for _, c := range data.Changes {
		date := c.CreatedAt
		if len(date) >= 10 {
			date = date[:10]
		}
		out = append(out, wireChange{
			Date: date, Name: c.Name, Phase: c.Phase, Verify: c.VerifyResult,
			TasksDone: c.TasksDone, TasksTotal: c.TasksTotal,
			Why: c.Why, What: c.What, Archived: c.Archived, Workspace: c.Workspace,
		})
	}
	return out
}

// weeklyPrompt builds the user message for the weekly report LLM call: a
// structured brief (window, workspace scope, counts) followed by the
// change corpus as JSON, and instructions to produce a Markdown weekly
// report with 概述 / 主题表格 / 关键成果 / 下周计划 sections.
func weeklyPrompt(data *ReportData, start, end string) string {
	scope := data.Workspace
	if scope == "" {
		scope = "全部 workspace"
	}
	corpus, _ := json.Marshal(dumpData(data))
	var b strings.Builder
	fmt.Fprintf(&b, `你是一名技术团队的周报撰写助手。请基于以下 %s 至 %s 的 comet 变更数据（范围：%s），撰写一份结构化 Markdown 周报。

统计：总计 %d 项，进行中 %d 项，已归档 %d 项，验证失败 %d 项。

变更数据（JSON，每项含 date/name/phase/verify/tasksDone/tasksTotal/why/what/archived/workspace）：
`, start, end, scope, data.Counts.Total, data.Counts.Active, data.Counts.Archived, data.Counts.WithVerifyFail)
	b.Write(corpus)
	b.WriteString(`

请严格按以下模板输出 Markdown：

---

# 本周工作周报（{起始日期} ~ {结束日期}）

## 概述
一句话总结：完成 N 个 comet change，M 个 active，涵盖 [主题列表]。写完正文再回填这里的统计数字确保一致。

---

## {N}、{主题名}

将所有变更按 workspace 或子系统/模块归类成若干主题（≤6 个）。每个主题包含：

### 完成项（N changes）
| Change | 日期 | 状态 | 要点 |
|--------|------|------|------|
| change-slug | YYYY-MM-DD | ✅已归档/🔄进行中/❌验证失败 | 基于 Why/What 的一句话概括 |

### 关键成果
- **粗体前缀**：数据驱动的结论，突出里程碑和量化指标（如完成率、测试通过数）
- 3-5 条 bullet

---

（重复上述主题结构，直到所有主题覆盖完毕）

---

## 下周计划
基于仍在 build/verify 阶段的变更，列出下周关注重点：
1. **主题**：具体动作
2. **主题**：具体动作

---

## 写作要求：
1. 每个主题的完成项表格必须有日期列，格式 YYYY-MM-DD
2. 状态列使用 ✅（已归档通过）、🔄（进行中/build/verify）、❌（验证失败）图标
3. 关键成果要有具体数据——任务完成度 (done/total)、验证结果、关键决策
4. Negative/abandoned 结果也是有价值的工作产出，必须记录（标 ❌ + 说明原因）
5. 概述中的统计数字必须与正文一致
6. 数据源仅覆盖 comet 变更与文档，不包含飞书 MR/会议记录，请在概述末尾如实说明
7. 如果某个 change 跨多个主题，归到最相关的那个，不要重复出现
`)
	return b.String()
}

//go:embed assets/report.tmpl.html
var monthlyTemplate string

// monthlyJSON is the strict-JSON contract the monthly LLM call must return.
// Aligned with the writing-monthly-reports skill: themes include change count
// and key items; milestones include dates; focusProjects provide depth.
type monthlyJSON struct {
	Title    string `json:"title"`
	Overview string `json:"overview"`
	Total    int    `json:"total"`
	Active   int    `json:"active"`
	Themes   int    `json:"themes"`
	Reports  int    `json:"reports"`
	// Mainline is a 1-3 sentence executive summary (the "主线" tag line).
	Mainline     string   `json:"mainline"`
	Highlights   []string `json:"highlights"`
	Milestones   []struct {
		Date string `json:"date"`
		Text string `json:"text"`
	} `json:"milestones"`
	ThemesDetail []struct {
		Name  string   `json:"name"`
		Count int      `json:"count"`
		Items []string `json:"items"`
	} `json:"themesDetail"`
	FocusProjects []struct {
		Name   string   `json:"name"`
		Points []string `json:"points"`
	} `json:"focusProjects"`
}

// renderMonthlyFromJSON parses the LLM's structured monthly report JSON and
// fills the embedded Swiss-style HTML template (aligned with writing-monthly-reports
// skill: themes with count + items, milestones with dates, focus projects).
func renderMonthlyFromJSON(raw []byte) ([]byte, error) {
	var m monthlyJSON
	if err := json.Unmarshal(raw, &m); err != nil {
		return nil, fmt.Errorf("月报数据解析失败: %w", err)
	}

	var themesHTML strings.Builder
	for _, t := range m.ThemesDetail {
		themesHTML.WriteString(`<div class="theme"><div class="theme-head">`)
		fmt.Fprintf(&themesHTML, `<span class="t">%s</span>`, html.EscapeString(t.Name))
		fmt.Fprintf(&themesHTML, `<span class="count">%d</span>`, t.Count)
		themesHTML.WriteString(`</div><ul class="theme-items">`)
		for _, item := range t.Items {
			fmt.Fprintf(&themesHTML, `<li>%s</li>`, html.EscapeString(item))
		}
		themesHTML.WriteString(`</ul></div>`)
	}

	var highlightsHTML strings.Builder
	for _, h := range m.Highlights {
		fmt.Fprintf(&highlightsHTML, "<li>%s</li>", html.EscapeString(h))
	}

	var milestonesHTML strings.Builder
	for _, ms := range m.Milestones {
		fmt.Fprintf(&milestonesHTML, `<li><span class="ms-date">%s</span> %s</li>`,
			html.EscapeString(ms.Date), html.EscapeString(ms.Text))
	}

	var focusHTML strings.Builder
	for _, fp := range m.FocusProjects {
		fmt.Fprintf(&focusHTML, `<div class="focus-project"><h3>%s</h3><ul>`, html.EscapeString(fp.Name))
		for _, pt := range fp.Points {
			fmt.Fprintf(&focusHTML, `<li>%s</li>`, html.EscapeString(pt))
		}
		focusHTML.WriteString(`</ul></div>`)
	}

	mainline := m.Mainline
	if mainline == "" {
		mainline = m.Overview
	}

	out := monthlyTemplate
	replacements := map[string]string{
		"{{TITLE}}":           html.EscapeString(m.Title),
		"{{OVERVIEW}}":        html.EscapeString(m.Overview),
		"{{MAINLINE}}":        html.EscapeString(mainline),
		"{{TOTAL}}":           fmt.Sprintf("%d", m.Total),
		"{{ACTIVE}}":          fmt.Sprintf("%d", m.Active),
		"{{THEMES}}":          fmt.Sprintf("%d", m.Themes),
		"{{REPORTS}}":         fmt.Sprintf("%d", m.Reports),
		"{{THEMES_HTML}}":     themesHTML.String(),
		"{{HIGHLIGHTS_HTML}}": highlightsHTML.String(),
		"{{MILESTONES_HTML}}": milestonesHTML.String(),
		"{{FOCUS_HTML}}":      focusHTML.String(),
	}
	for k, v := range replacements {
		out = strings.ReplaceAll(out, k, v)
	}
	return []byte(out), nil
}

// monthlySystemPrompt instructs the model to return strict JSON only — no
// prose, no Markdown code fences — matching the monthlyJSON contract.
// Aligned with writing-monthly-reports skill: themes with count+items,
// milestones with dates, focus projects with data-driven points.
func monthlySystemPrompt() string {
	return `你是一名技术团队的月报数据助手。只输出严格合法的 JSON，不要输出任何 Markdown 代码块标记，不要输出 JSON 之外的任何文字说明。

JSON schema（所有字段必填）：
{
  "title": "string - 月报标题，如 '2026年6月工作月报'",
  "overview": "string - 2-3句概述，涵盖关键成就和覆盖范围",
  "mainline": "string - 1-3句主线摘要，突出本月最重要的方向/决策",
  "total": "int - 总变更数（取自输入统计）",
  "active": "int - 进行中数量（取自输入统计）",
  "themes": "int - 归纳出的主题数量（≤6）",
  "reports": "int - 本区间产出的报告/文档数量估计",
  "themesDetail": [{
    "name": "string - 主题名（按模块/子系统分，如'通讯总线'、'云密钥服务'）",
    "count": "int - 该主题下的变更数量",
    "items": ["string - 5-6条明细，每条格式：change名 + 一句话成果/状态"]
  }],
  "focusProjects": [{
    "name": "string - 重点项目名（占比最大的1-2个子系统）",
    "points": ["string - 6条架构决策/成果要点，含具体数据（完成率/测试数/性能指标）"]
  }],
  "highlights": ["string - 5-8条关键成果，粗体前缀+数据驱动结论"],
  "milestones": [{"date": "string - YYYY-MM-DD", "text": "string - 一句话里程碑"}]
}

归类原则：
- 按 workspace 或模块/子系统分成 ≤6 个主题
- 小主题合并（如 '产线+打包+构建'）
- Negative/abandoned 结果也是有价值的工作产出，标注到对应主题
- focusProjects 取工作量最大的 1-2 个子系统，深入写架构决策和量化成果
- milestones 按时间排序，选 6-9 个关键节点
- 数据源仅覆盖 comet 变更与文档，不包含飞书 MR/会议记录，请在 overview 中如实说明`
}

// monthlyPrompt builds the user message for the monthly report LLM call.
func monthlyPrompt(data *ReportData, start, end string) string {
	scope := data.Workspace
	if scope == "" {
		scope = "全部 workspace"
	}
	corpus, _ := json.Marshal(dumpData(data))
	var b strings.Builder
	fmt.Fprintf(&b, "请基于以下 %s 至 %s 的 comet 变更数据（范围：%s）生成月报结构化数据。\n\n", start, end, scope)
	fmt.Fprintf(&b, "统计：总计 %d 项，进行中 %d 项，已归档 %d 项，验证失败 %d 项。\n\n", data.Counts.Total, data.Counts.Active, data.Counts.Archived, data.Counts.WithVerifyFail)
	b.WriteString("变更数据（JSON，每项含 date/name/phase/verify/tasksDone/tasksTotal/why/what/archived/workspace）：\n")
	b.Write(corpus)
	b.WriteString("\n\n请按 system prompt 中的 JSON schema 输出。total 和 active 必须与上方统计一致。\n")
	return b.String()
}

// synthesizeMonthly builds the monthly-report prompt, blocks on
// chatStreamDrain for the LLM's structured JSON, and renders it into the
// embedded Swiss template. If the LLM response is not valid JSON, returns
// an error (月报数据解析失败，请重试) so the caller can return 500.
func synthesizeMonthly(data *ReportData, start, end string, pcfg chat.ProviderConfig, p provider.Provider) ([]byte, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	text, err := chatStreamDrain(ctx, p, pcfg, monthlySystemPrompt(), monthlyPrompt(data, start, end))
	if err != nil {
		return []byte("<html><body><h1>月报生成失败</h1><pre>" + html.EscapeString(err.Error()) + "</pre></body></html>"), nil
	}
	rendered, parseErr := renderMonthlyFromJSON([]byte(strings.TrimSpace(text)))
	if parseErr != nil {
		return nil, errors.New("月报数据解析失败，请重试")
	}
	return rendered, nil
}

// reportMeta is the list-view metadata for a persisted report file.
type reportMeta struct {
	Name      string `json:"name"`
	Type      string `json:"type"`
	Start     string `json:"start"`
	End       string `json:"end"`
	CreatedAt string `json:"createdAt"`
}

// handleListReports is GET /api/reports: lists persisted reports newest
// first, parsed from their filenames.
func handleListReports(w http.ResponseWriter, r *http.Request) {
	dir, err := reportsDirFn()
	out := []reportMeta{}
	if err == nil {
		entries, _ := os.ReadDir(dir)
		for _, e := range entries {
			if e.IsDir() {
				continue
			}
			m, ok := parseReportName(e.Name())
			if !ok {
				continue
			}
			info, statErr := e.Info()
			createdAt := ""
			if statErr == nil {
				createdAt = info.ModTime().UTC().Format(time.RFC3339)
			}
			out = append(out, reportMeta{e.Name(), m.Type, m.Start, m.End, createdAt})
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt > out[j].CreatedAt })
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(out)
}

// handleGetReport is GET|DELETE /api/reports/get?name=<file>: returns a single
// persisted report's body (GET), or deletes it (DELETE), rejecting any
// path-traversal attempt in name.
func handleGetReport(w http.ResponseWriter, r *http.Request) {
	name := r.URL.Query().Get("name")
	if name == "" || strings.ContainsAny(name, "/\\") || strings.Contains(name, "..") {
		writeJSONError(w, "invalid name", 400)
		return
	}
	dir, err := reportsDirFn()
	if err != nil {
		writeJSONError(w, "not found", 404)
		return
	}
	path := filepath.Join(dir, filepath.Base(name))

	switch r.Method {
	case http.MethodDelete:
		if err := os.Remove(path); err != nil {
			writeJSONError(w, "not found", 404)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{"ok": true})
	case http.MethodGet:
		body, err := os.ReadFile(path)
		if err != nil {
			writeJSONError(w, "not found", 404)
			return
		}
		format := "md"
		if strings.HasSuffix(name, ".html") {
			format = "html"
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{"format": format, "body": string(body)})
	default:
		writeJSONError(w, "method not allowed", 405)
	}
}

// parseReportName parses "<type>-<start>_<end>-<ts>.<ext>" into its parts.
// Type is the segment before the first "-"; Start runs up to the "_"; End
// runs from the "_" to the final "-<ts>.<ext>" suffix.
func parseReportName(name string) (struct{ Type, Start, End string }, bool) {
	zero := struct{ Type, Start, End string }{}
	base := strings.TrimSuffix(name, filepath.Ext(name))
	parts := strings.SplitN(base, "-", 2)
	if len(parts) != 2 {
		return zero, false
	}
	type_ := parts[0]
	rest := parts[1]
	under := strings.Index(rest, "_")
	if under < 0 {
		return zero, false
	}
	start := rest[:under]
	afterUnder := rest[under+1:]
	lastDash := strings.LastIndex(afterUnder, "-")
	if lastDash < 0 {
		return zero, false
	}
	end := afterUnder[:lastDash]
	return struct{ Type, Start, End string }{type_, start, end}, true
}
