import { useEffect, useState } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import { fetchArtifactContent } from '../api/client'

const markdownComponents: Components = {
  h1: ({ node, ...rest }) => <h1 className="text-xl font-bold mt-4 mb-2" {...rest} />,
  h2: ({ node, ...rest }) => <h2 className="text-lg font-semibold mt-4 mb-2" {...rest} />,
  h3: ({ node, ...rest }) => <h3 className="text-base font-semibold mt-3 mb-1" {...rest} />,
  p: ({ node, ...rest }) => <p className="mb-2 leading-relaxed" {...rest} />,
  ul: ({ node, ...rest }) => <ul className="list-disc pl-5 mb-2" {...rest} />,
  ol: ({ node, ...rest }) => <ol className="list-decimal pl-5 mb-2" {...rest} />,
  li: ({ node, ...rest }) => <li className="mb-0.5" {...rest} />,
  code: ({ node, ...rest }) => <code className="bg-[#f5f5f7] rounded px-1 py-0.5 text-xs font-mono" {...rest} />,
  pre: ({ node, ...rest }) => <pre className="bg-[#f5f5f7] rounded p-3 overflow-x-auto mb-2" {...rest} />,
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
      .then(setContent)
      .catch(() => setError(true))
  }, [path])

  if (!path) return null

  return (
    <div className="bg-white rounded-lg p-6 shadow-[0_4px_12px_rgba(0,0,0,0.06)]">
      <div className="flex justify-end mb-4">
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-[#6e6e73] hover:text-[#dc2626]"
        >
          ✕ 关闭
        </button>
      </div>
      <div className="max-w-prose mx-auto text-sm">
        {error && <div className="text-[#dc2626]">加载失败</div>}
        {!error && content === null && <div className="text-[#6e6e73]">加载中…</div>}
        {!error && content !== null && (
          <ReactMarkdown components={markdownComponents}>{content}</ReactMarkdown>
        )}
      </div>
    </div>
  )
}
