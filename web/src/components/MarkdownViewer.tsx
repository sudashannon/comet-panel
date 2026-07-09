import { useEffect, useState } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import { fetchArtifactContent } from '../api/client'

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
  h1: ({ node, ...rest }) => <h1 className="text-xl font-bold mt-4 mb-2" {...rest} />,
  h2: ({ node, ...rest }) => <h2 className="text-lg font-semibold mt-4 mb-2" {...rest} />,
  h3: ({ node, ...rest }) => <h3 className="text-base font-semibold mt-3 mb-1" {...rest} />,
  p: ({ node, ...rest }) => <p className="mb-2 leading-relaxed" {...rest} />,
  ul: ({ node, ...rest }) => <ul className="list-disc pl-5 mb-2" {...rest} />,
  ol: ({ node, ...rest }) => <ol className="list-decimal pl-5 mb-2" {...rest} />,
  li: ({ node, ...rest }) => <li className="mb-0.5" {...rest} />,
  // Inline `code` is different from block code; react-markdown nests the
  // inline case inside <code> only, and the block case inside <pre><code>.
  code: ({ node, ...rest }) => (
    <code className="bg-[#f5f5f7] rounded px-1 py-0.5 font-mono text-sm" {...rest} />
  ),
  pre: ({ node, ...rest }) => (
    <pre className="bg-[#f5f5f7] rounded-lg p-4 overflow-x-auto font-mono text-sm mb-3" {...rest} />
  ),
  a: ({ node, ...rest }) => <a className="text-[#0063f8] underline" {...rest} />,
}

interface Props {
  path: string | null
  onClose: () => void
}

export function MarkdownViewer({ path, onClose }: Props) {
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
      className="fixed inset-0 z-50 bg-white flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label={filename}
    >
      <header className="sticky top-0 z-10 bg-white border-b border-[#e8e8ed] px-6 py-3 flex items-center justify-between gap-4">
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
      </header>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-6 text-sm">
          {error && <div className="text-[#dc2626]">加载失败</div>}
          {!error && content === null && <div className="text-[#6e6e73]">加载中…</div>}
          {!error && content !== null && (
            <ReactMarkdown components={markdownComponents}>{content}</ReactMarkdown>
          )}
        </div>
      </div>
    </div>
  )
}
