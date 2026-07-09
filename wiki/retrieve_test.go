package wiki

import "testing"

func TestKeywordRetriever_MatchesTitleSubstring(t *testing.T) {
	g := BuildGraph([]Component{
		{ID: "a", Title: "Secure Boot Design"},
		{ID: "b", Title: "Unrelated Topic"},
	}, nil)
	r := NewKeywordRetriever(g)

	results, err := r.Search("secure", 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 1 || results[0].ID != "a" {
		t.Fatalf("expected 1 match for 'a', got %+v", results)
	}
}

func TestKeywordRetriever_RespectsK(t *testing.T) {
	g := BuildGraph([]Component{
		{ID: "a", Title: "Match One"},
		{ID: "b", Title: "Match Two"},
		{ID: "c", Title: "Match Three"},
	}, nil)
	r := NewKeywordRetriever(g)
	results, _ := r.Search("match", 2)
	if len(results) != 2 {
		t.Fatalf("expected exactly 2 results (k=2), got %d", len(results))
	}
}

func TestVectorRetrieverStub_IsDisabledByDefault(t *testing.T) {
	if VectorRetrievalEnabled {
		t.Fatal("vector retrieval must default to disabled — this plan does not wire it into any UI")
	}
}
