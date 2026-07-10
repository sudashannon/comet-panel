package wiki

import (
	"os"
	"path/filepath"
	"testing"
)

// writeTempComponent creates a temp markdown file with the given body and
// returns a Component pointing at it.
func writeTempComponent(t *testing.T, dir, id, title, body string) Component {
	t.Helper()
	path := filepath.Join(dir, id+".md")
	if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
		t.Fatalf("write temp file: %v", err)
	}
	return Component{ID: id, Type: TypeDesign, Title: title, Path: path}
}

func testComponents(t *testing.T) []Component {
	t.Helper()
	dir := t.TempDir()
	return []Component{
		writeTempComponent(t, dir, "c1-security-design", "安全编译设计",
			"安全编译设计文档 描述编译器安全加固方案 防止代码注入 安全编译 静态分析 沙箱隔离"),
		writeTempComponent(t, dir, "c2-security-plan", "安全编译实施计划",
			"安全编译实施计划 分阶段推进编译器安全加固方案 静态分析 沙箱隔离 里程碑安排"),
		writeTempComponent(t, dir, "c3-security-verify", "安全编译验证报告",
			"安全编译验证报告 验证编译器安全加固方案效果 静态分析结果 沙箱隔离测试"),
		writeTempComponent(t, dir, "c4-ota-plan", "OTA 升级方案",
			"OTA 升级方案 描述固件远程升级流程 差分包 签名校验 断点续传"),
		writeTempComponent(t, dir, "c5-ota-test", "OTA 升级测试计划",
			"OTA 升级测试计划 覆盖固件远程升级场景 差分包校验 断点续传测试"),
	}
}

func edgeExists(edges []Edge, from, to string) bool {
	for _, e := range edges {
		if e.From == from && e.To == to {
			return true
		}
	}
	return false
}

func TestComputeSimilarityEdges_ClustersRelatedComponents(t *testing.T) {
	components := testComponents(t)
	edges := ComputeSimilarityEdges(components, 2, 4.0)

	if len(edges) == 0 {
		t.Fatalf("expected at least one similarity edge, got none")
	}

	for _, e := range edges {
		if e.Kind != "similar" {
			t.Errorf("edge %+v: expected Kind=similar", e)
		}
		if e.Source != "bm25" {
			t.Errorf("edge %+v: expected Source=bm25", e)
		}
	}

	// The security-cluster components should be linked to each other.
	if !edgeExists(edges, "c1-security-design", "c2-security-plan") &&
		!edgeExists(edges, "c2-security-plan", "c1-security-design") {
		t.Errorf("expected an edge between c1-security-design and c2-security-plan, edges=%+v", edges)
	}

	// The OTA components should be linked to each other.
	if !edgeExists(edges, "c4-ota-plan", "c5-ota-test") &&
		!edgeExists(edges, "c5-ota-test", "c4-ota-plan") {
		t.Errorf("expected an edge between c4-ota-plan and c5-ota-test, edges=%+v", edges)
	}

	// Unrelated topics (security vs OTA) should not be linked.
	if edgeExists(edges, "c1-security-design", "c4-ota-plan") ||
		edgeExists(edges, "c4-ota-plan", "c1-security-design") {
		t.Errorf("did not expect an edge between c1-security-design and c4-ota-plan, edges=%+v", edges)
	}
	if edgeExists(edges, "c2-security-plan", "c5-ota-test") ||
		edgeExists(edges, "c5-ota-test", "c2-security-plan") {
		t.Errorf("did not expect an edge between c2-security-plan and c5-ota-test, edges=%+v", edges)
	}
}

func TestComputeSimilarityEdges_NoSelfEdges(t *testing.T) {
	components := testComponents(t)
	edges := ComputeSimilarityEdges(components, 3, 0.0)

	for _, e := range edges {
		if e.From == e.To {
			t.Errorf("unexpected self-edge: %+v", e)
		}
	}
}

func TestComputeSimilarityEdges_ThresholdFiltersLowScores(t *testing.T) {
	components := testComponents(t)

	loose := ComputeSimilarityEdges(components, 3, 0.0)
	strict := ComputeSimilarityEdges(components, 3, 1e9)

	if len(strict) != 0 {
		t.Errorf("expected no edges with an unreachable threshold, got %+v", strict)
	}
	if len(loose) == 0 {
		t.Fatalf("expected edges with threshold 0.0")
	}
}

func TestComputeSimilarityEdges_TopKLimitsPerComponent(t *testing.T) {
	components := testComponents(t)
	edges := ComputeSimilarityEdges(components, 1, 0.0)

	counts := make(map[string]int)
	for _, e := range edges {
		counts[e.From]++
	}
	for id, c := range counts {
		if c > 1 {
			t.Errorf("component %s has %d outgoing similarity edges, want at most 1 (topK=1)", id, c)
		}
	}
}

func TestComputeSimilarityEdges_MissingFileFallsBackToTitleOnly(t *testing.T) {
	components := []Component{
		{ID: "missing-1", Type: TypeDesign, Title: "安全编译设计文档", Path: "/nonexistent/path/one.md"},
		{ID: "missing-2", Type: TypeDesign, Title: "安全编译设计文档", Path: "/nonexistent/path/two.md"},
		{ID: "missing-3", Type: TypeDesign, Title: "完全不同的主题", Path: "/nonexistent/path/three.md"},
	}

	// Should not panic despite unreadable files.
	edges := ComputeSimilarityEdges(components, 3, 0.0)
	if len(edges) == 0 {
		t.Fatalf("expected title-only fallback to still produce similarity edges")
	}
}
