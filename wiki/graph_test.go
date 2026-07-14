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

func TestGraphMutationMethodsKeepIndexesConsistent(t *testing.T) {
	g := BuildGraph(
		[]Component{{ID: "a"}, {ID: "b"}, {ID: "c"}},
		[]Edge{
			{From: "a", To: "b", Kind: "references"},
			{From: "c", To: "a", Kind: "references"},
		},
	)
	g.SetEmbeddings(map[string][]float32{"a": {1}, "b": {2}})
	g.SetCommunities(map[string]int{"a": 0, "b": 1})

	g.RemoveEdgesFrom("a")
	if len(g.Forward("a")) != 0 || len(g.Backlinks("b")) != 0 {
		t.Fatalf("RemoveEdgesFrom left stale edge indexes: forward=%v backlinks=%v", g.Forward("a"), g.Backlinks("b"))
	}

	g.AddEdges([]Edge{{From: "a", To: "b", Kind: "implements"}})
	if len(g.Forward("a")) != 1 || len(g.Backlinks("b")) != 1 {
		t.Fatalf("AddEdges did not update both edge indexes")
	}

	g.RemoveEdgesTo("a")
	if len(g.Backlinks("a")) != 0 || len(g.Forward("c")) != 0 {
		t.Fatalf("RemoveEdgesTo left stale edge indexes: backlinks=%v forward=%v", g.Backlinks("a"), g.Forward("c"))
	}

	g.AddComponent(Component{ID: "d", Title: "D"})
	g.UpdateEmbedding("d", []float32{4})
	if c, ok := g.Component("d"); !ok || c.Title != "D" {
		t.Fatalf("AddComponent did not add d: %+v, ok=%v", c, ok)
	}
	if len(g.Embeddings()["d"]) != 1 {
		t.Fatal("UpdateEmbedding did not store d embedding")
	}

	g.RemoveComponent("a")
	if _, ok := g.Component("a"); ok {
		t.Fatal("RemoveComponent left component a")
	}
	if _, ok := g.Embeddings()["a"]; ok {
		t.Fatal("RemoveComponent left embedding a")
	}
	if _, ok := g.Communities()["a"]; ok {
		t.Fatal("RemoveComponent left community a")
	}

	g.RemoveEmbedding("b")
	if _, ok := g.Embeddings()["b"]; ok {
		t.Fatal("RemoveEmbedding left b")
	}
}
