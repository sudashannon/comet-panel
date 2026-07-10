package wiki

import (
	"math"
	"sort"
	"strings"
	"unicode"
)

// DetectCommunities runs a simplified single-level Louvain community
// detection over the undirected view of g (forward and backward edges
// merged) and returns a map from Component ID to community index.
//
// Communities with two or fewer members are considered too small to be
// meaningful and are collapsed into a single "misc" bucket, reported as -1.
func DetectCommunities(g *Graph) map[string]int {
	components := g.Components()
	result := make(map[string]int, len(components))
	if len(components) == 0 {
		return result
	}

	// Build an undirected adjacency list (as a neighbor -> edge-count map,
	// since duplicate edges between the same pair should count as multi-edges).
	adj := make(map[string]map[string]int, len(components))
	for id := range components {
		adj[id] = map[string]int{}
	}
	addEdge := func(a, b string) {
		if a == b {
			return
		}
		if _, ok := adj[a]; !ok {
			adj[a] = map[string]int{}
		}
		if _, ok := adj[b]; !ok {
			adj[b] = map[string]int{}
		}
		adj[a][b]++
		adj[b][a]++
	}
	for id := range components {
		for _, e := range g.Forward(id) {
			addEdge(e.From, e.To)
		}
		for _, e := range g.Backlinks(id) {
			addEdge(e.From, e.To)
		}
	}

	// degree[id] = number of incident edges (weighted by multiplicity).
	degree := make(map[string]int, len(adj))
	totalEdges := 0
	for id, neighbors := range adj {
		d := 0
		for _, w := range neighbors {
			d += w
		}
		degree[id] = d
		totalEdges += d
	}
	totalEdges /= 2 // each edge counted from both endpoints
	if totalEdges == 0 {
		// No edges at all: every node is its own (size-1) community, so all
		// nodes collapse to misc.
		for id := range components {
			result[id] = -1
		}
		return result
	}
	m2 := float64(2 * totalEdges) // 2m, used repeatedly in ΔQ

	// Initialize: every node in its own community.
	community := make(map[string]string, len(adj)) // node -> community id (represented by a node id)
	for id := range adj {
		community[id] = id
	}
	// communityDegree[c] = sum of degrees of members of community c.
	communityDegree := make(map[string]int, len(adj))
	for id, d := range degree {
		communityDegree[id] = d
	}

	// weightToCommunity returns, for node, the total edge weight it has
	// toward each neighboring community (excluding its own membership).
	weightToCommunity := func(node string) map[string]int {
		w := make(map[string]int)
		for neighbor, weight := range adj[node] {
			w[community[neighbor]] += weight
		}
		return w
	}

	improved := true
	for improved {
		improved = false
		for id := range adj {
			currentComm := community[id]
			nodeDeg := degree[id]
			neighborWeights := weightToCommunity(id)

			// Weight this node currently contributes to its own community
			// (excluding itself), used to compute the cost of removing it.
			currentWeight := neighborWeights[currentComm]

			// ΔQ of removing id from its current community.
			// Removing a node from community c changes Q by:
			//   -currentWeight/m + nodeDeg * (communityDegree[c]-nodeDeg) / (2m^2)
			removeGain := -float64(currentWeight)/float64(totalEdges) +
				float64(nodeDeg)*float64(communityDegree[currentComm]-nodeDeg)/(m2*m2/2)

			bestComm := currentComm
			bestDelta := 0.0

			for comm, weight := range neighborWeights {
				if comm == currentComm {
					continue
				}
				// ΔQ of adding id to comm (comm's degree sum excludes id, since
				// id isn't currently a member).
				addGain := float64(weight)/float64(totalEdges) -
					float64(nodeDeg)*float64(communityDegree[comm])/(m2*m2/2)

				delta := addGain + removeGain
				if delta > bestDelta {
					bestDelta = delta
					bestComm = comm
				}
			}

			if bestComm != currentComm {
				communityDegree[currentComm] -= nodeDeg
				communityDegree[bestComm] += nodeDeg
				community[id] = bestComm
				improved = true
			}
		}
	}

	// Collect final communities, assign dense 0-based indices in a
	// deterministic (sorted) order, and compute sizes.
	members := make(map[string][]string)
	for id, comm := range community {
		members[comm] = append(members[comm], id)
	}

	commOrder := make([]string, 0, len(members))
	for comm := range members {
		commOrder = append(commOrder, comm)
	}
	sort.Strings(commOrder)

	idx := 0
	for _, comm := range commOrder {
		ids := members[comm]
		assigned := idx
		if len(ids) <= 2 {
			assigned = -1
		} else {
			idx++
		}
		for _, id := range ids {
			result[id] = assigned
		}
	}

	return result
}

// communityLabelStopwords lists terms too generic to serve as a useful
// community label (English function words + common Chinese particles).
var communityLabelStopwords = map[string]bool{
	"the": true, "a": true, "and": true, "is": true, "of": true,
	"的": true, "是": true, "了": true, "和": true, "在": true,
}

// CommunityLabels computes a human-readable label for each community by
// finding the most distinctive term (highest TF-IDF score) across the
// titles of the community's members.
//
// TF is the term's frequency within a community's titles; IDF is
// log(N / df) where N is the number of communities and df is the number of
// communities whose titles contain the term at least once. Terms shorter
// than 2 runes and common stopwords are excluded from consideration.
func CommunityLabels(components []Component, communities map[string]int) map[int]string {
	// Group titles (as token lists) by community, skipping misc (-1).
	commTokens := make(map[int][]string)
	for _, c := range components {
		commID, ok := communities[c.ID]
		if !ok || commID == -1 {
			continue
		}
		commTokens[commID] = append(commTokens[commID], labelTokens(c.Title)...)
	}
	if len(commTokens) == 0 {
		return map[int]string{}
	}

	// termFreq[commID][term] = raw count within that community's titles.
	termFreq := make(map[int]map[string]int, len(commTokens))
	// docFreq[term] = number of communities containing the term at least once.
	docFreq := make(map[string]int)
	for commID, tokens := range commTokens {
		freq := make(map[string]int)
		for _, tok := range tokens {
			if isValidLabelTerm(tok) {
				freq[tok]++
			}
		}
		termFreq[commID] = freq
		for term := range freq {
			docFreq[term]++
		}
	}

	n := float64(len(commTokens))
	labels := make(map[int]string, len(commTokens))
	for commID, freq := range termFreq {
		bestTerm := ""
		bestScore := math.Inf(-1)
		terms := make([]string, 0, len(freq))
		for term := range freq {
			terms = append(terms, term)
		}
		sort.Strings(terms) // deterministic tie-breaking
		for _, term := range terms {
			tf := float64(freq[term])
			idf := math.Log(n / float64(docFreq[term]))
			score := tf * idf
			if score > bestScore {
				bestScore = score
				bestTerm = term
			}
		}
		if bestTerm != "" {
			labels[commID] = bestTerm
		}
	}
	return labels
}

// isValidLabelTerm reports whether tok is eligible to be a community label:
// at least 2 runes long and not a common stopword.
func isValidLabelTerm(tok string) bool {
	if communityLabelStopwords[tok] {
		return false
	}
	return len([]rune(tok)) >= 2
}

// labelTokens tokenizes text the same way tokenizeCorpus does for ASCII
// runs (kept as lowercased words), but emits CJK runs as overlapping
// 2-rune bigrams rather than single runes: single CJK characters are too
// generic to serve as a label (e.g. "设" from "设计"), while bigrams like
// "安全" or "编译" capture meaningful, distinctive terms.
func labelTokens(text string) []string {
	var tokens []string
	for _, field := range strings.Fields(text) {
		var asciiRun []rune
		var cjkRun []rune
		flushASCII := func() {
			if len(asciiRun) > 0 {
				tokens = append(tokens, strings.ToLower(string(asciiRun)))
				asciiRun = asciiRun[:0]
			}
		}
		flushCJK := func() {
			for i := 0; i+1 < len(cjkRun); i++ {
				tokens = append(tokens, string(cjkRun[i:i+2]))
			}
			cjkRun = cjkRun[:0]
		}
		for _, r := range field {
			if r <= unicode.MaxASCII && (unicode.IsLetter(r) || unicode.IsDigit(r)) {
				flushCJK()
				asciiRun = append(asciiRun, r)
				continue
			}
			flushASCII()
			if unicode.IsLetter(r) || unicode.IsDigit(r) {
				cjkRun = append(cjkRun, r)
				continue
			}
			// Punctuation and other symbols are separators.
			flushCJK()
		}
		flushASCII()
		flushCJK()
	}
	return tokens
}
