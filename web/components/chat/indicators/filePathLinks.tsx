import { FileCode2 } from 'lucide-react'

const FILE_EXT_RE = /\.(tsx?|jsx?|css|scss|less|json|md|mdx|yml|yaml|toml|py|rs|go|java|rb|php|sh|bash|zsh|sql|graphql|gql|html|vue|svelte|astro|prisma|env|config|lock|txt|log|xml|ini|cfg|conf|c|cpp|h|hpp|swift|kt|dart|lua|zig|nix|tf|hcl|proto)$/i

interface ParseFilePathOptions {
  allowSpaces?: boolean
  allowBareFilename?: boolean
}

export const parseFilePath = (text: string, options: ParseFilePathOptions = {}): { path: string; line?: number } | null => {
  const trimmed = text.trim()
  if (!trimmed || (!options.allowSpaces && trimmed.includes(' ')) || trimmed.includes('\n')) return null
  const lineMatch = trimmed.match(/:(\d+)(?:-\d+)?$/)
  const pathPart = lineMatch ? trimmed.slice(0, lineMatch.index!) : trimmed
  if (pathPart.includes(':') && !/^[A-Za-z]:[\\/]/.test(pathPart)) return null
  if (!FILE_EXT_RE.test(pathPart)) return null
  if (!options.allowBareFilename && !pathPart.includes('/') && !pathPart.startsWith('.')) return null
  return { path: pathPart, line: lineMatch ? parseInt(lineMatch[1], 10) : undefined }
}

const URL_SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i

const safeDecodeHref = (value: string): string => {
  try {
    return decodeURIComponent(value)
  } catch {
    try {
      return decodeURI(value)
    } catch {
      return value
    }
  }
}

export const parseFileHref = (href?: string): { path: string; line?: number } | null => {
  const raw = href?.trim()
  if (!raw || raw.startsWith('#')) return null

  let candidate = raw
  const directFileTarget = parseFilePath(safeDecodeHref(raw), { allowSpaces: true, allowBareFilename: true })
  if (directFileTarget) return directFileTarget

  if (URL_SCHEME_RE.test(raw)) {
    let url: URL
    try {
      url = new URL(raw)
    } catch {
      return null
    }
    if (url.protocol !== 'file:') return null
    candidate = safeDecodeHref(url.pathname)
    if (/^\/[A-Za-z]:\//.test(candidate)) candidate = candidate.slice(1)
  } else {
    candidate = safeDecodeHref(raw)
  }

  return parseFilePath(candidate, { allowSpaces: true, allowBareFilename: true })
}

export const openFileInIde = (filePath: string, line?: number) => {
  window.dispatchEvent(new CustomEvent('ide:open-file', { detail: { filePath, line } }))
}

const FILE_PATH_IN_TEXT_RE = /((?:~\/|\/|\.\.?\/|[\w@-]+\/)(?:[\w@./-])*\.(?:tsx?|jsx?|css|scss|less|json|md|mdx|yml|yaml|toml|py|rs|go|java|rb|php|sh|sql|html|vue|svelte|c|cpp|h|hpp|swift|kt)(?::\d+(?:-\d+)?)?)/g

const processTextChildren = (children: React.ReactNode): React.ReactNode => {
  if (typeof children === 'string') {
    const parts: React.ReactNode[] = []
    let lastIndex = 0
    let match: RegExpExecArray | null
    FILE_PATH_IN_TEXT_RE.lastIndex = 0
    while ((match = FILE_PATH_IN_TEXT_RE.exec(children)) !== null) {
      const parsed = parseFilePath(match[1])
      if (!parsed) continue
      if (match.index > lastIndex) parts.push(children.slice(lastIndex, match.index))
      parts.push(
        <span
          key={match.index}
          role="button"
          tabIndex={0}
          className="file-path-link"
          onClick={(e) => { e.stopPropagation(); openFileInIde(parsed.path, parsed.line) }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); openFileInIde(parsed.path, parsed.line) } }}
          title={`Open ${parsed.path}${parsed.line ? `:${parsed.line}` : ''} in IDE`}
        >
          <FileCode2 size={10} style={{ display: 'inline', verticalAlign: '-1px', marginRight: 2, opacity: 0.6 }} />
          {match[1]}
        </span>,
      )
      lastIndex = match.index + match[0].length
    }
    if (parts.length === 0) return children
    if (lastIndex < children.length) parts.push(children.slice(lastIndex))
    return parts
  }
  if (Array.isArray(children)) {
    return children.map((child, i) =>
      typeof child === 'string' ? <span key={i}>{processTextChildren(child)}</span> : child,
    )
  }
  return children
}

export const MarkdownP = ({ children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
  <p {...props}>{processTextChildren(children)}</p>
)
export const MarkdownLi = ({ children, ...props }: React.LiHTMLAttributes<HTMLLIElement>) => (
  <li {...props}>{processTextChildren(children)}</li>
)
export const MarkdownTd = ({ children, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) => (
  <td {...props}>{processTextChildren(children)}</td>
)

export const InlineCode = ({ children, className, ...props }: React.HTMLAttributes<HTMLElement>) => {
  if (className?.includes('language-')) {
    return <code className={className} {...props}>{children}</code>
  }
  const text = typeof children === 'string' ? children : Array.isArray(children) ? children.join('') : ''
  const parsed = parseFilePath(text)
  if (!parsed) return <code className={className} {...props}>{children}</code>
  return (
    <code
      {...props}
      role="button"
      tabIndex={0}
      className="file-path-link file-path-code"
      onClick={(e) => { e.stopPropagation(); openFileInIde(parsed.path, parsed.line) }}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); openFileInIde(parsed.path, parsed.line) } }}
      title={`Open ${parsed.path}${parsed.line ? `:${parsed.line}` : ''} in IDE`}
    >
      <FileCode2 size={10} style={{ display: 'inline', verticalAlign: '-1px', marginRight: 2, opacity: 0.6 }} />
      {children}
    </code>
  )
}
