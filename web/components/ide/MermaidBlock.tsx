import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@/contexts/ThemeContext'

// mermaid is heavy (~500KB); load it on demand and share a single instance.
type MermaidApi = typeof import('mermaid')['default']
let mermaidPromise: Promise<MermaidApi> | null = null
const loadMermaid = () => {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((m) => m.default)
  }
  return mermaidPromise
}

interface MermaidBlockProps {
  code: string
}

const MermaidBlock = ({ code }: MermaidBlockProps) => {
  const { t } = useTranslation('workspace')
  const { theme } = useTheme()
  const idSuffix = useId().replace(/[^a-zA-Z0-9]/g, '')
  const [svg, setSvg] = useState('')
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    const trimmed = code.trim()
    if (!trimmed) {
      setSvg('')
      setError(null)
      return
    }
    loadMermaid()
      .then(async (mermaid) => {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: theme === 'dark' ? 'dark' : 'default',
          fontFamily: 'inherit',
        })
        const { svg: rendered } = await mermaid.render(`mermaid-${idSuffix}`, trimmed)
        if (!cancelled) {
          setSvg(rendered)
          setError(null)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setSvg('')
          setError(err instanceof Error ? err.message : String(err))
        }
      })
    return () => {
      cancelled = true
    }
  }, [code, theme, idSuffix])

  if (error) {
    return (
      <div className="mermaid-error">
        <div className="mermaid-error-title">{t('ide.mermaidError', { defaultValue: 'Diagram render failed' })}</div>
        <pre>
          <code>{code}</code>
        </pre>
        <div className="mermaid-error-msg">{error}</div>
      </div>
    )
  }

  if (!svg) {
    return <div className="mermaid-loading">{t('ide.mermaidLoading', { defaultValue: 'Rendering diagram…' })}</div>
  }

  return <div ref={containerRef} className="mermaid-diagram" dangerouslySetInnerHTML={{ __html: svg }} />
}

export default MermaidBlock
