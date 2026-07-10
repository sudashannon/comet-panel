package wiki

type Graph struct {
	components map[string]Component
	forward    map[string][]Edge
	backward   map[string][]Edge
}

func BuildGraph(components []Component, edges []Edge) *Graph {
	g := &Graph{
		components: make(map[string]Component, len(components)),
		forward:    make(map[string][]Edge),
		backward:   make(map[string][]Edge),
	}
	for _, c := range components {
		g.components[c.ID] = c
	}
	for _, e := range edges {
		g.forward[e.From] = append(g.forward[e.From], e)
		g.backward[e.To] = append(g.backward[e.To], e)
	}
	return g
}

func (g *Graph) Component(id string) (Component, bool) {
	c, ok := g.components[id]
	return c, ok
}

func (g *Graph) Components() map[string]Component {
	return g.components
}

func (g *Graph) Forward(id string) []Edge {
	return g.forward[id]
}

func (g *Graph) Backlinks(id string) []Edge {
	return g.backward[id]
}
