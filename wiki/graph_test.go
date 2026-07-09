package wiki

import "testing"

func TestBuildGraph_ForwardAndBacklinks(t *testing.T) {
	a := Component{ID: "a", Title: "A"}
	b := Component{ID: "b", Title: "B"}
	components := []Component{a, b}
	edges := []Edge{{From: "a", To: "b", Kind: "implements", Source: "yaml"}}

	g := BuildGraph(components, edges)

	got, ok := g.Component("a")
	if !ok || got.Title != "A" {
		t.Fatalf("expected to find component 'a', got %+v ok=%v", got, ok)
	}

	fwd := g.Forward("a")
	if len(fwd) != 1 || fwd[0].To != "b" {
		t.Fatalf("expected 1 forward edge a->b, got %+v", fwd)
	}

	back := g.Backlinks("b")
	if len(back) != 1 || back[0].From != "a" {
		t.Fatalf("expected 1 backlink from a, got %+v", back)
	}

	if len(g.Backlinks("a")) != 0 {
		t.Fatalf("expected no backlinks for 'a'")
	}
}

func TestBuildGraph_UnknownComponentReturnsFalse(t *testing.T) {
	g := BuildGraph(nil, nil)
	if _, ok := g.Component("nonexistent"); ok {
		t.Fatal("expected ok=false for unknown component")
	}
}
