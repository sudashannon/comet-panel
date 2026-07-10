package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
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
