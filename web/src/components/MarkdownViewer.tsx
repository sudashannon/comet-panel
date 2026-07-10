import { useEffect, useState } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { fetchArtifactContent } from '../api/client'
import { DiagramBlock } from './DiagramBlock'

// Fenced code blocks carry their language as `language-xxx` in the code
// element's className (e.g. ```mermaid -> "language-mermaid"). Only these two
// languages should render as diagrams; everything else stays plain code.
function getDiagramLanguage(className?: string): 'mermaid' | 'plantuml' | null {
  if (className === 'language-mermaid') return 'mermaid'
  if (className === 'language-plantuml') return 'plantuml'
  return null
}

// Strips a leading YAML frontmatter block (---\n...\n---). Real design-doc
// artifacts from the API start with this metadata, but it's noise inside the
// rendered document.
function stripFrontmatter(text: string): string {
  if (text.startsWith('---\n') || text.startsWith('---\r\n')) {
    const end = text.indexOf('\n---', 3)
    if (end !== -1) {
      return text.slice(end + 4).trimStart()
    }
  }
  return text
}

const markdownComponents: Components = {
  h1: ({ node, ...rest }) => <h1 className="text-2xl font-bold mt-5 mb-3" {...rest} />,
  h2: ({ node, ...rest }) => <h2 className="text-xl font-semibold mt-5 mb-2" {...rest} />,
  h3: ({ node, ...rest }) => <h3 className="text-lg font-semibold mt-4 mb-2" {...rest} />,
  p: ({ node, ...rest }) => <p className="mb-3 leading-7" {...rest} />,
  ul: ({ node, ...rest }) => <ul className="list-disc pl-6 mb-3" {...rest} />,
  ol: ({ node, ...rest }) => <ol className="list-decimal pl-6 mb-3" {...rest} />,
  li: ({ node, ...rest }) => <li className="mb-1" {...rest} />,
  blockquote: ({ node, ...rest }) => (
    <blockquote
      className="border-l-4 border-[#e8e8ed] pl-4 py-1 mb-3 text-[#6e6e73] italic"
      {...rest}
    />
  ),
  hr: ({ node, ...rest }) => <hr className="my-6 border-[#e8e8ed]" {...rest} />,
  img: ({ node, ...rest }) => <img className="max-w-full rounded-lg" {...rest} />,
  table: ({ node, ...rest }) => (
    <div className="overflow-x-auto mb-4">
      <table className="border-collapse w-full text-left" {...rest} />
    </div>
  ),
  thead: ({ node, ...rest }) => <thead className="bg-[#f5f5f7]" {...rest} />,
  tbody: ({ node, ...rest }) => <tbody {...rest} />,
  tr: ({ node, ...rest }) => <tr className="border-b border-[#e8e8ed]" {...rest} />,
  th: ({ node, ...rest }) => (
    <th className="border border-[#e8e8ed] px-3 py-2 font-semibold whitespace-nowrap" {...rest} />
  ),
  td: ({ node, ...rest }) => <td className="border border-[#e8e8ed] px-3 py-2 align-top" {...rest} />,
  // Inline `code` is different from block code; react-markdown nests the
  // inline case inside <code> only, and the block case inside <pre><code>.
  code: ({ node, className, children, ...rest }) => {
    const language = getDiagramLanguage(className)
    if (language) {
      return <DiagramBlock language={language} code={String(children).replace(/\n$/, '')} />
    }
    return (
      <code className="bg-[#f5f5f7] rounded px-1 py-0.5 font-mono text-sm break-words" {...rest}>
        {children}
      </code>
    )
  },
  pre: ({ node, ...rest }) => (
    <pre
      className="bg-[#f5f5f7] rounded-lg p-4 overflow-x-auto font-mono text-sm mb-3 whitespace-pre-wrap break-words"
      {...rest}
    />
  ),
  a: ({ node, ...rest }) => <a className="text-[#0063f8] underline" {...rest} />,
}

interface Artifact {
  path: string
  label: string
}

interface Props {
  path: string | null
  artifacts?: Artifact[]
  onSelectArtifact?: (path: string) => void
  onClose: () => void
}

export function MarkdownViewer({ path, artifacts, onSelectArtifact, onClose }: Props) {
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!path) return
    setContent(null)
    setError(false)
    fetchArtifactContent(path)
      .then((text) => setContent(stripFrontmatter(text)))
      .catch(() => setError(true))
  }, [path])

  // Escape closes the modal: matches the ✕ button so keyboard users have the
  // same affordance. Listener is only attached while the viewer is open.
  useEffect(() => {
    if (!path) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [path, onClose])

  if (!path) return null

  const filename = path.split('/').pop() ?? path

  return (
    <div
      className="h-full min-h-0 flex flex-col bg-white rounded-lg shadow-[0_4px_12px_rgba(0,0,0,0.06)]"
      role="region"
      aria-label={filename}
    >
      <header className="sticky top-0 z-10 bg-white border-b border-[#e8e8ed] px-6 py-3 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-4">
          <div className="text-sm font-semibold text-[#1d1d1f] truncate" title={path}>
            {filename}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-sm font-medium px-3 py-1.5 rounded border border-[#e8e8ed] text-[#0063f8] hover:bg-[#f0f5ff] hover:border-[#0063f8]"
          >
            ✕ 关闭
          </button>
        </div>
        {artifacts && artifacts.length > 1 && (
          <div data-testid="artifact-switcher" className="flex items-center gap-1.5 overflow-x-auto">
            {artifacts.map((artifact) => {
              const active = artifact.path === path
              return (
                <button
                  key={artifact.path}
                  type="button"
                  aria-current={active}
                  onClick={() => !active && onSelectArtifact?.(artifact.path)}
                  className={
                    'shrink-0 text-xs px-2.5 py-1 rounded-full border whitespace-nowrap ' +
                    (active
                      ? 'bg-[#0063f8] text-white border-[#0063f8]'
                      : 'text-[#1d1d1f] border-[#e8e8ed] hover:border-[#0063f8] hover:text-[#0063f8]')
                  }
                >
                  {artifact.label}
                </button>
              )
            })}
          </div>
        )}
      </header>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 py-8 text-base leading-relaxed">
          {error && <div className="text-[#dc2626]">加载失败</div>}
          {!error && content === null && <div className="text-[#6e6e73]">加载中…</div>}
          {!error && content !== null && (
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {content}
            </ReactMarkdown>
          )}
        </div>
      </div>
    </div>
  )
}
