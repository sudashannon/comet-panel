package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"comet-ui/chat"
	"comet-ui/chat/provider"
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
	if err != nil {
		t.Fatal(err)
	}
	if len(data.Changes) != 2 {
		t.Fatalf("want 2 in-range miao changes, got %d", len(data.Changes))
	}
	names := map[string]bool{}
	for _, c := range data.Changes {
		names[c.Name] = true
	}
	if !names["2026-06-15-a"] || !names["2026-06-20-b"] {
		t.Fatal("missing expected names")
	}
	if data.Counts.Active < 1 || data.Counts.Archived < 1 {
		t.Fatalf("counts wrong: %+v", data.Counts)
	}
}

func TestGatherReportData_NoWorkspaceFilter(t *testing.T) {
	chs := []ChangeSummary{makeChg("2026-06-15-a", "miao", "build", "2026-06-15", false), makeChg("2026-06-16-c", "rx101", "build", "2026-06-16", false)}
	data, _ := gatherReportData(chs, "2026-06-01", "2026-06-30", "")
	if len(data.Changes) != 2 {
		t.Fatalf("want 2 across workspaces, got %d", len(data.Changes))
	}
}

func TestGatherReportData_InclusiveBounds(t *testing.T) {
	chs := []ChangeSummary{makeChg("2026-06-01-edge", "miao", "open", "2026-06-01", false), makeChg("2026-06-30-edge", "miao", "open", "2026-06-30", false)}
	data, _ := gatherReportData(chs, "2026-06-01", "2026-06-30", "")
	if len(data.Changes) != 2 {
		t.Fatalf("want inclusive bounds, got %d", len(data.Changes))
	}
}

func TestGatherReportData_OutOfRange(t *testing.T) {
	chs := []ChangeSummary{makeChg("2026-05-31-old", "miao", "build", "2026-05-31", true), makeChg("2026-07-01-future", "miao", "build", "2026-07-01", false)}
	data, _ := gatherReportData(chs, "2026-06-01", "2026-06-30", "")
	if len(data.Changes) != 0 {
		t.Fatalf("want 0, got %d", len(data.Changes))
	}
}

func TestGatherReportData_BadDateReturnsError(t *testing.T) {
	if _, err := gatherReportData(nil, "garbage", "2026-06-30", ""); err == nil {
		t.Fatal("want error on bad start")
	}
}

func TestHandleReport_NoProviderReturns400(t *testing.T) {
	prevCfg := chat.LoadConfig
	t.Cleanup(func() { chat.LoadConfig = prevCfg })
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)
	chat.LoadConfig = func() (*chat.Config, error) {
		return &chat.Config{ActiveProvider: "minimax", Providers: map[string]chat.ProviderConfig{"minimax": {}}}, nil
	}
	req := httptest.NewRequest(http.MethodPost, "/api/report", strings.NewReader(`{"type":"weekly","start":"2026-06-01","end":"2026-06-30"}`))
	w := httptest.NewRecorder()
	handleReport(w, req, &WorkspaceRegistry{})
	if w.Code != 400 {
		t.Fatalf("want 400, got %d", w.Code)
	}
	if !strings.Contains(w.Body.String(), "请先配置 LLM provider") {
		t.Fatalf("body = %s", w.Body.String())
	}
}

func TestListReports_Empty(t *testing.T) {
	tmp := t.TempDir()
	prevDir := reportsDirFn
	t.Cleanup(func() { reportsDirFn = prevDir })
	t.Setenv("HOME", tmp)
	reportsDirFn = func() (string, error) { return tmp, nil }
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/reports", nil)
	handleListReports(w, req)
	if w.Code != 200 {
		t.Fatalf("want 200, got %d", w.Code)
	}
	if !strings.Contains(w.Body.String(), "[]") {
		t.Fatalf("body=%s", w.Body.String())
	}
}

func TestGetReport_PathTraversalRejected(t *testing.T) {
	prevDir := reportsDirFn
	t.Cleanup(func() { reportsDirFn = prevDir })
	reportsDirFn = func() (string, error) { return t.TempDir(), nil }
	req := httptest.NewRequest(http.MethodGet, "/api/reports/get?name=../evil.md", nil)
	w := httptest.NewRecorder()
	handleGetReport(w, req)
	if w.Code != 400 {
		t.Fatalf("want 400 on traversal, got %d", w.Code)
	}
}

func TestWeekly_BlockedDrainReceivesFullText(t *testing.T) {
	orig := chatStreamDrain
	chatStreamDrain = func(ctx context.Context, p provider.Provider, pcfg chat.ProviderConfig, systemPrompt, userText string) (string, error) {
		return "# 测试周报\n\n本周变更 3 项，含 build 阶段推进。", nil
	}
	t.Cleanup(func() { chatStreamDrain = orig })
	data := &ReportData{} // empty set is also valid
	pcfg := chat.ProviderConfig{APIKey: "fake", APIBase: "x", Model: "m", Temperature: 0.5, MaxTokens: 1024, Thinking: "auto"}
	out := synthesizeWeekly(data, "2026-06-01", "2026-06-30", pcfg, nil)
	if !strings.Contains(string(out), "测试周报") {
		t.Fatalf("want markdown to include fake text; got %s", out)
	}
}

func TestReport_RoundTrip_ListAndGet(t *testing.T) {
	tmp := t.TempDir()
	prevDir := reportsDirFn
	t.Cleanup(func() { reportsDirFn = prevDir })
	t.Setenv("HOME", tmp)
	reportsDirFn = func() (string, error) { return tmp, nil }

	body := []byte("# 周报\n\n本周内容。")
	name, err := saveReport(tmp, "weekly", "2026-06-01", "2026-06-30", body)
	if err != nil {
		t.Fatalf("saveReport: %v", err)
	}

	listW := httptest.NewRecorder()
	handleListReports(listW, httptest.NewRequest(http.MethodGet, "/api/reports", nil))
	if listW.Code != 200 {
		t.Fatalf("list want 200, got %d", listW.Code)
	}
	var metas []reportMeta
	if err := json.Unmarshal(listW.Body.Bytes(), &metas); err != nil {
		t.Fatalf("decode list body: %v", err)
	}
	if len(metas) != 1 {
		t.Fatalf("want 1 report, got %d: %+v", len(metas), metas)
	}
	m := metas[0]
	if m.Name != name || m.Type != "weekly" || m.Start != "2026-06-01" || m.End != "2026-06-30" {
		t.Fatalf("unexpected meta: %+v", m)
	}

	getW := httptest.NewRecorder()
	handleGetReport(getW, httptest.NewRequest(http.MethodGet, "/api/reports/get?name="+name, nil))
	if getW.Code != 200 {
		t.Fatalf("get want 200, got %d", getW.Code)
	}
	var got struct{ Format, Body string }
	if err := json.Unmarshal(getW.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode get body: %v", err)
	}
	if got.Body != string(body) {
		t.Fatalf("body mismatch: got %q want %q", got.Body, string(body))
	}
}

func TestRenderMonthlyJSON_ProducesHTML(t *testing.T) {
	raw := []byte(`{
		"title": "2026年6月工作月报",
		"overview": "本月推进 3 个 workspace 的变更，聚焦 <script>报告</script> 生成与 UI 打磨。",
		"total": 12, "active": 4, "themes": 3, "reports": 5, "platforms": 2,
		"themesDetail": [{"name": "报告生成", "desc": "周报/月报 M1 落地"}],
		"highlights": ["完成 chatStreamDrain 注入点", "月报模板渲染通路打通"],
		"milestones": ["2026-06-10: 周报端到端跑通", "2026-06-25: 月报 JSON 契约冻结"]
	}`)
	out, err := renderMonthlyFromJSON(raw)
	if err != nil {
		t.Fatalf("renderMonthlyFromJSON: %v", err)
	}
	html := string(out)
	if !strings.Contains(html, "2026年6月工作月报") {
		t.Fatalf("missing title in output: %s", html)
	}
	if !strings.Contains(html, "报告生成") || !strings.Contains(html, "完成 chatStreamDrain 注入点") {
		t.Fatalf("missing theme/highlight in output: %s", html)
	}
	if !strings.Contains(html, "&lt;script&gt;") {
		t.Fatalf("expected overview to be HTML-escaped, got: %s", html)
	}
	if !strings.Contains(html, "<html") {
		t.Fatalf("output does not look like HTML: %s", html)
	}
}

func TestRenderMonthlyJSON_InvalidReturnsError(t *testing.T) {
	if _, err := renderMonthlyFromJSON([]byte("not json at all")); err == nil {
		t.Fatal("want error for invalid JSON, got nil")
	}
}

func TestSynthesizeMonthly_MockDrain(t *testing.T) {
	orig := chatStreamDrain
	chatStreamDrain = func(ctx context.Context, p provider.Provider, pcfg chat.ProviderConfig, systemPrompt, userText string) (string, error) {
		return `{
			"title": "月报 Mock",
			"overview": "mock overview",
			"total": 5, "active": 2, "themes": 1, "reports": 1, "platforms": 1,
			"themesDetail": [{"name": "Mock主题", "desc": "mock desc"}],
			"highlights": ["mock highlight"],
			"milestones": ["2026-06-01: mock milestone"]
		}`, nil
	}
	t.Cleanup(func() { chatStreamDrain = orig })
	data := &ReportData{}
	pcfg := chat.ProviderConfig{APIKey: "fake", APIBase: "x", Model: "m", Temperature: 0.5, MaxTokens: 1024, Thinking: "auto"}
	out, err := synthesizeMonthly(data, "2026-06-01", "2026-06-30", pcfg, nil)
	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}
	html := string(out)
	if !strings.Contains(html, "月报 Mock") || !strings.Contains(html, "Mock主题") || !strings.Contains(html, "mock highlight") {
		t.Fatalf("want mocked content rendered into HTML, got: %s", html)
	}
}

func TestMonthlyDemo_VisualGate(t *testing.T) {
	if os.Getenv("REPORT_DEMO") == "" {
		t.Skip("set REPORT_DEMO=1 to write /tmp/monthly-demo.html for visual review")
	}
	raw := []byte(`{
		"title": "2026年6月工作月报 · comet-panel",
		"overview": "本月围绕 comet-panel 报告生成能力（周报/月报）与前端 UI 视觉升级展开，覆盖 12 项变更，聚焦数据组装、LLM 合成通路与瑞士风格模板渲染。",
		"total": 18, "active": 5, "themes": 4, "reports": 6, "platforms": 2,
		"themesDetail": [
			{"name": "报告生成", "desc": "周报 Markdown 直出 + 月报 JSON→模板渲染"},
			{"name": "UI 视觉升级", "desc": "KpiCards 图标卡、SideRail 设置入口"},
			{"name": "设置迁移", "desc": "SettingsPanel 从 ChatBubble 抽出"},
			{"name": "测试基建", "desc": "chatStreamDrain mock 注入 + 路径穿越校验"}
		],
		"highlights": [
			"完成 gatherReportData 数据组装与 provider gate",
			"周报 LLM 直出 Markdown，落盘与端点全部打通",
			"月报 M1：JSON 契约 + 内嵌 Swiss 模板渲染",
			"KpiCards 升级为图标 chip + 大数字布局"
		],
		"milestones": [
			"2026-06-05: report.go 数据组装 + 端点上线",
			"2026-06-18: 周报端到端验证通过",
			"2026-06-30: 月报 M1 视觉验收"
		]
	}`)
	out, err := renderMonthlyFromJSON(raw)
	if err != nil {
		t.Fatalf("renderMonthlyFromJSON: %v", err)
	}
	if err := os.WriteFile("/tmp/monthly-demo.html", out, 0644); err != nil {
		t.Fatalf("write demo file: %v", err)
	}
	t.Logf("wrote demo HTML to /tmp/monthly-demo.html (%d bytes)", len(out))
}

func TestHandleReport_MonthlyParseErrorReturns500(t *testing.T) {
	// Test that when monthly LLM returns invalid JSON, handleReport returns 500 with error message
	orig := chatStreamDrain
	defer func() { chatStreamDrain = orig }()
	
	// Mock chatStreamDrain to return invalid JSON
	chatStreamDrain = func(ctx context.Context, p provider.Provider, pcfg chat.ProviderConfig, systemPrompt, userText string) (string, error) {
		return `not-valid-json-at-all`, nil
	}
	
	// Create a workspace registry with a temp file
	reg, err := NewWorkspaceRegistry(t.TempDir() + "/workspaces.yaml")
	if err != nil {
		t.Fatalf("create registry: %v", err)
	}
	
	// Create a POST request for monthly report
	req := httptest.NewRequest("POST", "/api/report", strings.NewReader(`{
		"type": "monthly",
		"start": "2026-06-01",
		"end": "2026-06-30",
		"workspace": ""
	}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	
	// Temporarily mock the config loading to return a valid provider config
	origLoadConfig := chat.LoadConfig
	defer func() { chat.LoadConfig = origLoadConfig }()
	chat.LoadConfig = func() (*chat.Config, error) {
		return &chat.Config{
			ActiveProvider: "minimax",
			Providers: map[string]chat.ProviderConfig{
				"minimax": {APIKey: "test-key", APIBase: "http://test", Model: "MiniMax-M3", Temperature: 0.5, MaxTokens: 1024, Thinking: "auto"},
			},
		}, nil
	}
	
	// Call handleReport
	handleReport(w, req, reg)
	
	// Verify response is 500
	if w.Code != 500 {
		t.Errorf("expected status 500, got %d", w.Code)
	}
	
	// Verify error message is present
	body := w.Body.String()
	if !strings.Contains(body, "月报数据解析失败，请重试") {
		t.Errorf("expected error message '月报数据解析失败，请重试' in response, got: %s", body)
	}
}
