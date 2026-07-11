package wiki

import "testing"

func TestComputeVectorSimilarityEdges(t *testing.T) {
	// Create embeddings where a and b are similar (same direction), c is orthogonal
	a := make([]float32, 384)
	b := make([]float32, 384)
	c := make([]float32, 384)
	// a and b point in same direction
	for i := 0; i < 100; i++ {
		a[i] = 1.0
		b[i] = 0.9
	}
	// c is orthogonal
	for i := 200; i < 300; i++ {
		c[i] = 1.0
	}

	embeddings := map[string][]float32{"a": a, "b": b, "c": c}
	edges := ComputeVectorSimilarityEdges(embeddings, 3, 0.5)

	// a-b should be connected (high cosine), neither should connect to c
	hasAB := false
	hasAC := false
	for _, e := range edges {
		if (e.From == "a" && e.To == "b") || (e.From == "b" && e.To == "a") {
			hasAB = true
		}
		if (e.From == "a" && e.To == "c") || (e.From == "c" && e.To == "a") {
			hasAC = true
		}
	}
	if !hasAB {
		t.Error("expected edge between similar vectors a and b")
	}
	if hasAC {
		t.Error("unexpected edge between orthogonal vectors a and c")
	}
}

func TestComputeVectorSimilarityEdges_NoSelfEdge(t *testing.T) {
	a := make([]float32, 384)
	a[0] = 1.0
	embeddings := map[string][]float32{"a": a}
	edges := ComputeVectorSimilarityEdges(embeddings, 3, 0.0)
	if len(edges) != 0 {
		t.Errorf("expected 0 edges for single node, got %d", len(edges))
	}
}
