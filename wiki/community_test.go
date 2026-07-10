package wiki

import "testing"

// buildClusteredGraph builds two fully-connected triangles (A-B-C and D-E-F)
// joined by a single weak bridge edge A-D.
func buildClusteredGraph() *Graph {
	components := []Component{
		{ID: "a", Title: "A"},
		{ID: "b", Title: "B"},
		{ID: "c", Title: "C"},
		{ID: "d", Title: "D"},
		{ID: "e", Title: "E"},
		{ID: "f", Title: "F"},
	}
	edges := []Edge{
		{From: "a", To: "b", Kind: "references"},
		{From: "b", To: "c", Kind: "references"},
		{From: "c", To: "a", Kind: "references"},
		{From: "d", To: "e", Kind: "references"},
		{From: "e", To: "f", Kind: "references"},
		{From: "f", To: "d", Kind: "references"},
		{From: "a", To: "d", Kind: "references"},
	}
	return BuildGraph(components, edges)
}

func TestDetectCommunities_TwoClusters(t *testing.T) {
	g := buildClusteredGraph()
	got := DetectCommunities(g)

	if len(got) != 6 {
		t.Fatalf("expected 6 entries, got %d: %+v", len(got), got)
	}

	// All members within a cluster must share the same community.
	if got["a"] != got["b"] || got["b"] != got["c"] {
		t.Fatalf("expected a,b,c to share a community, got %+v", got)
	}
	if got["d"] != got["e"] || got["e"] != got["f"] {
		t.Fatalf("expected d,e,f to share a community, got %+v", got)
	}
	if got["a"] == got["d"] {
		t.Fatalf("expected the two clusters to be in different communities, got %+v", got)
	}

	// Both clusters have 3 members each, so neither should be reassigned to misc.
	if got["a"] == -1 {
		t.Fatalf("expected cluster a,b,c to not be misc, got %+v", got)
	}
	if got["d"] == -1 {
		t.Fatalf("expected cluster d,e,f to not be misc, got %+v", got)
	}
}

func TestDetectCommunities_DisconnectedNodeIsMisc(t *testing.T) {
	components := []Component{
		{ID: "a", Title: "A"},
		{ID: "b", Title: "B"},
		{ID: "lonely", Title: "Lonely"},
	}
	edges := []Edge{
		{From: "a", To: "b", Kind: "references"},
	}
	g := BuildGraph(components, edges)

	got := DetectCommunities(g)

	if len(got) != 3 {
		t.Fatalf("expected 3 entries, got %d: %+v", len(got), got)
	}
	if got["lonely"] != -1 {
		t.Fatalf("expected lonely node to be misc (-1), got %d", got["lonely"])
	}
	// a-b is a community of size 2, which is also <= 2, so it should be misc too.
	if got["a"] != -1 {
		t.Fatalf("expected 2-member community to be misc (-1), got %d", got["a"])
	}
}

func TestDetectCommunities_EmptyGraph(t *testing.T) {
	g := BuildGraph(nil, nil)
	got := DetectCommunities(g)
	if len(got) != 0 {
		t.Fatalf("expected empty map, got %+v", got)
	}
}

func TestDetectCommunities_MiscCommunitiesAllShareNegativeOne(t *testing.T) {
	components := []Component{
		{ID: "x", Title: "X"},
		{ID: "y", Title: "Y"},
	}
	// No edges at all: two isolated singleton communities, both size 1 <= 2.
	g := BuildGraph(components, nil)

	got := DetectCommunities(g)
	if got["x"] != -1 || got["y"] != -1 {
		t.Fatalf("expected both isolated nodes to be misc, got %+v", got)
	}
}
