package wiki

import "time"

type ComponentType string

const (
	TypeChange   ComponentType = "change"
	TypeProposal ComponentType = "proposal"
	TypeDesign   ComponentType = "design"
	TypeTasks    ComponentType = "tasks"
	TypeSpec     ComponentType = "spec"
	TypePlan     ComponentType = "plan"
	TypeArtifact ComponentType = "artifact"
	TypeDiagram  ComponentType = "diagram"
)

type Component struct {
	ID          string // absolute, canonicalized path — stable identity
	Type        ComponentType
	Title       string
	Path        string
	Workspace   string
	Frontmatter map[string]any
	UpdatedAt   time.Time
}

type Edge struct {
	From, To string // Component.ID
	Kind     string // references | implements | generates | traces-back | supersedes
	Source   string // "yaml" (highest confidence) | "markdown-link" | "slug-match" (lint-only)
}
