package wiki

import "math"

// ComputeVectorSimilarityEdges builds top-K cosine-similarity edges from precomputed embeddings.
func ComputeVectorSimilarityEdges(embeddings map[string][]float32, topK int, threshold float64) []Edge {
	ids := make([]string, 0, len(embeddings))
	for id := range embeddings {
		ids = append(ids, id)
	}

	// Precompute norms
	norms := make(map[string]float64, len(embeddings))
	for id, vec := range embeddings {
		var sum float64
		for _, v := range vec {
			sum += float64(v) * float64(v)
		}
		norms[id] = math.Sqrt(sum)
	}

	var edges []Edge
	for _, id := range ids {
		vec := embeddings[id]
		norm := norms[id]
		if norm == 0 {
			continue
		}

		type scored struct {
			id    string
			score float64
		}
		var top []scored

		for _, otherId := range ids {
			if otherId == id {
				continue
			}
			otherVec := embeddings[otherId]
			otherNorm := norms[otherId]
			if otherNorm == 0 {
				continue
			}

			// Cosine similarity
			var dot float64
			for i, v := range vec {
				dot += float64(v) * float64(otherVec[i])
			}
			sim := dot / (norm * otherNorm)

			if sim < threshold {
				continue
			}

			// Insert into top-K (simple insertion sort)
			top = append(top, scored{otherId, sim})
			// Keep sorted, trim to topK
			for i := len(top) - 1; i > 0 && top[i].score > top[i-1].score; i-- {
				top[i], top[i-1] = top[i-1], top[i]
			}
			if len(top) > topK {
				top = top[:topK]
			}
		}

		for _, s := range top {
			edges = append(edges, Edge{
				From:   id,
				To:     s.id,
				Kind:   "similar",
				Source: "vector",
			})
		}
	}
	return edges
}
