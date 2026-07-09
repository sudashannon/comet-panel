package wiki

import "strings"

type Retriever interface {
	Search(query string, k int) ([]Component, error)
}

// VectorRetrievalEnabled is a compile-time-visible feature flag. It stays
// false for the entire scope of this plan — chromem-go integration is
// reserved for a future iteration once corpus size actually justifies it
// (see design doc's zvec-vs-chromem-go evaluation). No handler or UI
// component in this plan reads this flag or calls a vector retriever.
const VectorRetrievalEnabled = false

type keywordRetriever struct {
	graph *Graph
}

func NewKeywordRetriever(g *Graph) Retriever {
	return &keywordRetriever{graph: g}
}

func (r *keywordRetriever) Search(query string, k int) ([]Component, error) {
	q := strings.ToLower(query)
	var matches []Component
	for id := range r.graph.components {
		c, _ := r.graph.Component(id)
		if strings.Contains(strings.ToLower(c.Title), q) {
			matches = append(matches, c)
			if len(matches) >= k {
				break
			}
		}
	}
	return matches, nil
}

// vectorRetriever is an intentionally unimplemented placeholder. Wiring a
// real chromem-go-backed implementation is out of scope for this plan —
// see design doc "为什么不用 alibaba/zvec" section for the reasoning on
// why chromem-go (not zvec) would be the correct choice if this is ever
// built out.
type vectorRetriever struct{}

func (vectorRetriever) Search(query string, k int) ([]Component, error) {
	return nil, nil
}
