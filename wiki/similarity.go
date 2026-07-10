package wiki

import (
	"math"
	"os"
	"sort"
	"strings"
	"unicode"
)

// bm25K1 and bm25B are the standard BM25 tuning constants (Okapi BM25
// defaults): k1 controls term-frequency saturation, b controls document
// length normalization strength.
const (
	bm25K1 = 1.2
	bm25B  = 0.75

	// corpusBodyChars caps how much of a component's file we read to build
	// its corpus — enough to capture the intro/summary without reading
	// (and tokenizing) potentially large documents in full.
	corpusBodyChars = 200
)

// posting is one inverted-index entry: a document containing a term, and
// how many times the term occurs in that document (raw term frequency).
type posting struct {
	docIdx int
	tf     float64
}

// ComputeSimilarityEdges builds BM25-scored "similar" edges between wiki
// components. For each component it builds a small corpus from its title
// plus the first corpusBodyChars characters of its source file, tokenizes
// it (ASCII words lowercased, CJK handled as individual runes so that
// Chinese titles/bodies still produce meaningful overlapping terms), scores
// every other component against it with BM25, and keeps up to topK edges
// whose score exceeds threshold.
//
// A component whose file cannot be read still participates using a
// title-only corpus rather than being skipped or causing a failure.
func ComputeSimilarityEdges(components []Component, topK int, threshold float64) []Edge {
	n := len(components)
	if n < 2 || topK <= 0 {
		return nil
	}

	docs := make([][]string, n)
	for i, c := range components {
		docs[i] = tokenizeCorpus(buildCorpus(c))
	}

	index := buildInvertedIndex(docs)
	avgDocLen := averageDocLength(docs)

	var edges []Edge
	for i := range components {
		scores := scoreAgainstAll(i, docs, index, avgDocLen, n)
		top := topScores(scores, topK, threshold)
		for _, s := range top {
			edges = append(edges, Edge{
				From:   components[i].ID,
				To:     components[s.docIdx].ID,
				Kind:   "similar",
				Source: "bm25",
			})
		}
	}
	return edges
}

// buildCorpus assembles "Title + first 200 chars of body" for a component.
// A read failure (missing file, permission error, etc.) falls back to the
// title alone.
func buildCorpus(c Component) string {
	corpus := c.Title
	data, err := os.ReadFile(c.Path)
	if err != nil {
		return corpus
	}
	body := string(data)
	if len(body) > corpusBodyChars {
		// Truncate on a rune boundary so multi-byte CJK characters are not
		// split, which would otherwise corrupt the trailing rune.
		body = truncateRunes(body, corpusBodyChars)
	}
	return corpus + " " + body
}

// truncateRunes returns at most maxRunes runes of s.
func truncateRunes(s string, maxRunes int) string {
	runes := []rune(s)
	if len(runes) <= maxRunes {
		return s
	}
	return string(runes[:maxRunes])
}

// tokenizeCorpus splits text on whitespace, then further splits each field
// into individual CJK runes (since Chinese text has no word boundaries),
// while keeping runs of ASCII letters/digits together as single lowercased
// tokens.
func tokenizeCorpus(text string) []string {
	var tokens []string
	for _, field := range strings.Fields(text) {
		var asciiRun []rune
		flushASCII := func() {
			if len(asciiRun) > 0 {
				tokens = append(tokens, strings.ToLower(string(asciiRun)))
				asciiRun = asciiRun[:0]
			}
		}
		for _, r := range field {
			if r <= unicode.MaxASCII && (unicode.IsLetter(r) || unicode.IsDigit(r)) {
				asciiRun = append(asciiRun, r)
				continue
			}
			flushASCII()
			if unicode.IsLetter(r) || unicode.IsDigit(r) {
				// Non-ASCII letter/digit (e.g. CJK ideograph): its own token.
				tokens = append(tokens, string(r))
			}
			// Punctuation and other symbols are dropped as separators.
		}
		flushASCII()
	}
	return tokens
}

// buildInvertedIndex maps each term to the documents it appears in, along
// with its raw term frequency in each of those documents.
func buildInvertedIndex(docs [][]string) map[string][]posting {
	index := make(map[string][]posting)
	for docIdx, tokens := range docs {
		counts := make(map[string]float64)
		for _, tok := range tokens {
			counts[tok]++
		}
		for term, tf := range counts {
			index[term] = append(index[term], posting{docIdx: docIdx, tf: tf})
		}
	}
	return index
}

// averageDocLength returns the mean token count across all documents (used
// for BM25's length-normalization term). Empty corpora count as length 0.
func averageDocLength(docs [][]string) float64 {
	if len(docs) == 0 {
		return 0
	}
	total := 0
	for _, d := range docs {
		total += len(d)
	}
	return float64(total) / float64(len(docs))
}

// scoreAgainstAll computes the BM25 score of every other document against
// document srcIdx's terms, returning one entry per document with a nonzero
// score (self excluded).
func scoreAgainstAll(srcIdx int, docs [][]string, index map[string][]posting, avgDocLen float64, n int) []posting {
	scores := make([]float64, n)
	seen := make(map[string]bool)
	for _, term := range docs[srcIdx] {
		if seen[term] {
			continue
		}
		seen[term] = true

		postings := index[term]
		df := len(postings)
		if df == 0 {
			continue
		}
		idf := math.Log(1 + (float64(n)-float64(df)+0.5)/(float64(df)+0.5))

		for _, p := range postings {
			if p.docIdx == srcIdx {
				continue
			}
			docLen := float64(len(docs[p.docIdx]))
			denom := p.tf + bm25K1*(1-bm25B+bm25B*docLen/avgDocLenOrOne(avgDocLen))
			scores[p.docIdx] += idf * (p.tf * (bm25K1 + 1)) / denom
		}
	}

	var out []posting
	for docIdx, score := range scores {
		if score > 0 {
			out = append(out, posting{docIdx: docIdx, tf: score})
		}
	}
	return out
}

// avgDocLenOrOne guards against dividing by zero when every document is
// empty (e.g. all components have empty titles and unreadable files).
func avgDocLenOrOne(avgDocLen float64) float64 {
	if avgDocLen == 0 {
		return 1
	}
	return avgDocLen
}

// topScores sorts candidates by score descending and returns at most topK
// entries whose score exceeds threshold.
func topScores(scores []posting, topK int, threshold float64) []posting {
	filtered := make([]posting, 0, len(scores))
	for _, s := range scores {
		if s.tf > threshold {
			filtered = append(filtered, s)
		}
	}
	sort.Slice(filtered, func(i, j int) bool {
		if filtered[i].tf != filtered[j].tf {
			return filtered[i].tf > filtered[j].tf
		}
		return filtered[i].docIdx < filtered[j].docIdx
	})
	if len(filtered) > topK {
		filtered = filtered[:topK]
	}
	return filtered
}
