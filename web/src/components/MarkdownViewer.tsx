import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSlug from 'rehype-slug'
import GithubSlugger from 'github-slugger'
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

interface TocEntry {
  id: string
  text: string
  level: number
}

// Parses ATX headings (#, ##, ###) from markdown into a TOC, assigning each the
// same slug id that rehype-slug produces at render time (both use GithubSlugger
// traversing in document order, so a fresh slugger here matches the rendered
// heading ids — including duplicate-heading disambiguation like "-1"). Fenced
// code blocks are skipped so a commented "# foo" inside ```…``` isn't a heading.
function extractToc(markdown: string): TocEntry[] {
  const slugger = new GithubSlugger()
  const entries: TocEntry[] = []
  let inFence = false
  for (const line of markdown.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const m = /^(#{1,3})\s+(.+?)\s*#*\s*$/.exec(line)
    if (!m) continue
    // Strip inline markdown emphasis/code/links from the visible label.
    const text = m[2]
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .trim()
    entries.push({ id: slugger.slug(text), text, level: m[1].length })
  }
  return entries
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
  const [zoomed, setZoomed] = useState<{ src: string; alt: string } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!path) return
    setContent(null)
    setError(false)
    setZoomed(null)
    fetchArtifactContent(path)
      .then((text) => setContent(stripFrontmatter(text)))
      .catch(() => setError(true))
  }, [path])

  // Escape closes the lightbox first (if open), otherwise the viewer — so a
  // user zooming an image can dismiss just the overlay without losing the doc.
  useEffect(() => {
    if (!path) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (zoomed) setZoomed(null)
      else onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [path, onClose, zoomed])

  const toc = useMemo(() => (content ? extractToc(content) : []), [content])

  // Override img so raster images AND external SVGs open in a zoom lightbox on
  // click; everything else reuses the shared markdownComponents styling.
  const components = useMemo<Components>(
    () => ({
      ...markdownComponents,
      img: ({ node, src, alt, ...rest }) => (
        <img
          {...rest}
          src={src}
          alt={alt}
          className="max-w-full rounded-lg cursor-zoom-in"
          onClick={() => typeof src === 'string' && setZoomed({ src, alt: alt ?? '' })}
        />
      ),
    }),
    [],
  )

  if (!path) return null

  const filename = path.split('/').pop() ?? path

  const jumpTo = (id: string) => {
    const el = scrollRef.current?.querySelector(`#${CSS.escape(id)}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

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
      <div className="flex-1 min-h-0 flex">
        {toc.length > 1 && (
          <nav
            data-testid="markdown-toc"
            aria-label="文档目录"
            className="hidden lg:block w-60 shrink-0 overflow-y-auto border-r border-[#e8e8ed] py-6 px-3"
          >
            <div className="text-xs font-semibold text-[#6e6e73] px-2 mb-2">目录</div>
            <ul className="space-y-0.5">
              {toc.map((entry, i) => (
                <li key={`${entry.id}-${i}`}>
                  <button
                    type="button"
                    onClick={() => jumpTo(entry.id)}
                    className="w-full text-left text-xs text-[#1d1d1f] hover:text-[#0063f8] hover:bg-[#f0f5ff] rounded px-2 py-1 truncate"
                    style={{ paddingLeft: `${(entry.level - 1) * 12 + 8}px` }}
                    title={entry.text}
                  >
                    {entry.text}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        )}
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
          <div className="max-w-5xl mx-auto px-6 py-8 text-base leading-relaxed">
            {error && <div className="text-[#dc2626]">加载失败</div>}
            {!error && content === null && <div className="text-[#6e6e73]">加载中…</div>}
            {!error && content !== null && (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeSlug]}
                components={components}
              >
                {content}
              </ReactMarkdown>
            )}
          </div>
        </div>
      </div>
      {zoomed && (
        <div
          data-testid="image-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={zoomed.alt || '图片预览'}
          onClick={() => setZoomed(null)}
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-8 cursor-zoom-out"
        >
          <img
            src={zoomed.src}
            alt={zoomed.alt}
            className="max-w-[92vw] max-h-[92vh] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}
