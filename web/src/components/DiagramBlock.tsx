import { useEffect, useRef, useState } from 'react'
import mermaid from 'mermaid'

// Mermaid recommends a single initialize() call before any render(); module
// scope guarantees that regardless of how many DiagramBlocks mount, since ES
// modules are evaluated once and cached.
mermaid.initialize({ startOnLoad: false, theme: 'neutral' })

let mermaidIdCounter = 0

// Kroki's diagram-by-URL endpoints expect the source deflate-compressed and
// then base64url-encoded: https://docs.kroki.io/kroki/setup/encode-diagram/
async function encodeForKroki(source: string): Promise<string> {
  const data = new TextEncoder().encode(source)
  const cs = new CompressionStream('deflate')
  const writer = cs.writable.getWriter()
  writer.write(data)
  writer.close()
  const compressed = await new Response(cs.readable).arrayBuffer()
  return btoa(String.fromCharCode(...new Uint8Array(compressed)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function DiagramSvg({ svg }: { svg: string }) {
  return <div className="flex justify-center" dangerouslySetInnerHTML={{ __html: svg }} />
}

function DiagramFallback({ code }: { code: string }) {
  return <pre className="font-mono text-sm whitespace-pre-wrap">{code}</pre>
}

function DiagramLoading() {
  return <div className="text-[#6e6e73]">渲染中…</div>
}

function MermaidRenderer({ code }: { code: string }) {
  const [svg, setSvg] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const idRef = useRef('')
  if (!idRef.current) idRef.current = `mermaid-${++mermaidIdCounter}`

  useEffect(() => {
    setSvg(null)
    setFailed(false)
    mermaid
      .render(idRef.current, code)
      .then(({ svg }) => setSvg(svg))
      .catch(() => setFailed(true))
  }, [code])

  if (failed) return <DiagramFallback code={code} />
  if (svg === null) return <DiagramLoading />
  return <DiagramSvg svg={svg} />
}

function PlantUmlRenderer({ code }: { code: string }) {
  const [svg, setSvg] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setSvg(null)
    setFailed(false)
    encodeForKroki(code)
      .then((encoded) => fetch(`https://kroki.io/plantuml/svg/${encoded}`))
      .then((res) => {
        if (!res.ok) throw new Error(`kroki request failed: ${res.status}`)
        return res.text()
      })
      .then(setSvg)
      .catch(() => setFailed(true))
  }, [code])

  if (failed) return <DiagramFallback code={code} />
  if (svg === null) return <DiagramLoading />
  return <DiagramSvg svg={svg} />
}

interface Props {
  language: 'mermaid' | 'plantuml'
  code: string
}

export function DiagramBlock({ language, code }: Props) {
  return (
    <div className="bg-[#f5f5f7] rounded-lg p-4 mb-3 overflow-x-auto">
      {language === 'mermaid' ? <MermaidRenderer code={code} /> : <PlantUmlRenderer code={code} />}
    </div>
  )
}
