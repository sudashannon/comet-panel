package wiki

import "sort"

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
