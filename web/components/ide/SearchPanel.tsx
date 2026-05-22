import { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, Loader2, ChevronRight, ChevronDown, File, Folder, ArrowLeft, FolderOpen } from 'lucide-react'
import { useContentSearch, type ContentResult } from '@/hooks/useContentSearch'

export interface SearchCache {
  inputValue: string
  activeQuery: string
  results: ContentResult[]
  truncated: boolean
}

export const emptySearchCache: SearchCache = {
  inputValue: '', activeQuery: '', results: [], truncated: false,
}

interface SearchPanelProps {
  roots: string
  onFileSelect: (filePath: string, line?: number, keyword?: string) => void
  onClose?: () => void
  cache?: SearchCache
  onCacheChange?: (cache: SearchCache) => void
}

const DEBOUNCE_MS = 400

const repoName = (root: string) => root.split('/').pop() || root

const HighlightMatch = ({ text, query }: { text: string; query: string }) => {
  if (!query) return <span>{text}</span>
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return <span>{text}</span>
  return (
    <span>
      {text.slice(0, idx)}
      <span className="bg-amber-500/30 text-amber-200 rounded-sm px-px">{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </span>
  )
}

const FileGroup = ({
  result, query, onFileSelect, defaultExpanded, depth = 0,
}: {
  result: ContentResult
  query: string
  onFileSelect: (filePath: string, line?: number, keyword?: string) => void
  defaultExpanded: boolean
  depth?: number
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const root = result.root || ''

  return (
    <div>
      <button
        onClick={() => setExpanded(v => !v)}
        className="flex items-center gap-1 w-full text-left py-0.5 text-xs hover:bg-bg-hover transition-colors rounded-sm"
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
      >
        {expanded
          ? <ChevronDown size={12} className="shrink-0 text-text-muted" />
          : <ChevronRight size={12} className="shrink-0 text-text-muted" />
        }
        <File size={13} className="shrink-0 text-text-muted" />
        <span className="truncate text-text-primary font-medium">{result.file}</span>
        <span className="shrink-0 ml-auto text-[10px] text-text-muted">{result.matches.length}</span>
      </button>
      {expanded && result.matches.map((m, i) => (
        <button
          key={i}
          onClick={() => onFileSelect(`${root}/${result.file}`, m.line, query)}
          className="flex items-start gap-2 w-full text-left py-0.5 text-xs hover:bg-bg-hover transition-colors rounded-sm"
          style={{ paddingLeft: `${(depth + 1) * 12 + 4}px` }}
        >
          <span className="shrink-0 w-8 text-right text-text-muted font-mono text-[10px] leading-4">
            {m.line}
          </span>
          <span className="truncate text-text-secondary font-mono text-[11px] leading-4">
            <HighlightMatch text={m.content.trim()} query={query} />
          </span>
        </button>
      ))}
    </div>
  )
}

const RepoGroup = ({
  root, results, query, onFileSelect, defaultExpanded,
}: {
  root: string
  results: ContentResult[]
  query: string
  onFileSelect: (filePath: string, line?: number, keyword?: string) => void
  defaultExpanded: boolean
}) => {
  const { t } = useTranslation('workspace')
  const [expanded, setExpanded] = useState(defaultExpanded)
  const matchCount = results.reduce((s, r) => s + r.matches.length, 0)

  return (
    <div>
      <button
        onClick={() => setExpanded(v => !v)}
        className="flex items-center gap-1 w-full text-left py-0.5 px-1 text-xs hover:bg-bg-hover transition-colors rounded-sm"
      >
        {expanded
          ? <ChevronDown size={12} className="shrink-0 text-text-muted" />
          : <ChevronRight size={12} className="shrink-0 text-text-muted" />
        }
        {expanded
          ? <FolderOpen size={13} className="shrink-0 text-accent-brand/70" />
          : <Folder size={13} className="shrink-0 text-accent-brand/70" />
        }
        <span className="truncate text-text-primary font-medium">{repoName(root)}</span>
        <span className="shrink-0 ml-auto text-[10px] text-text-muted">{t('ide.searchMatches', { matchCount, fileCount: results.length })}</span>
      </button>
      {expanded && results.map((r, i) => (
        <FileGroup
          key={r.file}
          result={r}
          query={query}
          onFileSelect={onFileSelect}
          defaultExpanded={i < 10}
          depth={1}
        />
      ))}
    </div>
  )
}

const SearchPanel = ({ roots, onFileSelect, onClose, cache, onCacheChange }: SearchPanelProps) => {
  const [inputValue, setInputValue] = useState(cache?.inputValue ?? '')
  const [activeQuery, setActiveQuery] = useState(cache?.activeQuery ?? '')
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const inputRef = useRef<HTMLInputElement>(null)

  const { results, isSearching, truncated, search, clear, setResults, setTruncated } = useContentSearch(roots)

  useEffect(() => {
    if (cache?.results.length) {
      setResults(cache.results)
      setTruncated(cache.truncated)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    onCacheChange?.({ inputValue, activeQuery, results, truncated })
  }, [inputValue, activeQuery, results, truncated]) // eslint-disable-line react-hooks/exhaustive-deps

  const totalMatches = useMemo(
    () => results.reduce((s, r) => s + r.matches.length, 0),
    [results],
  )

  const rootList = roots.split(',')
  const isMultiRoot = rootList.length > 1

  const groupedByRoot = useMemo(() => {
    if (!isMultiRoot) return null
    const map = new Map<string, ContentResult[]>()
    for (const r of results) {
      const key = r.root || rootList[0]
      const list = map.get(key)
      if (list) list.push(r)
      else map.set(key, [r])
    }
    return map
  }, [results, isMultiRoot, roots])

  const triggerSearch = useCallback((q: string) => {
    clearTimeout(timerRef.current)
    if (!q.trim()) {
      clear()
      setActiveQuery('')
      return
    }
    timerRef.current = setTimeout(() => {
      setActiveQuery(q)
      search(q)
    }, DEBOUNCE_MS)
  }, [search, clear])

  const handleInputChange = useCallback((val: string) => {
    setInputValue(val)
    triggerSearch(val)
  }, [triggerSearch])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      clearTimeout(timerRef.current)
      if (inputValue.trim()) {
        setActiveQuery(inputValue)
        search(inputValue)
      }
    }
  }, [inputValue, search])

  return (
    <div className="h-full flex flex-col bg-bg-primary text-text-primary">
      {onClose && (
        <div className="flex items-center justify-between px-2 py-1.5 border-b border-border-subtle shrink-0">
          <span className="text-[11px] font-medium text-text-secondary uppercase tracking-wider">Global Search</span>
          <button
            onClick={onClose}
            className="p-0.5 rounded text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
            aria-label="Back to file tree"
          >
            <ArrowLeft size={12} />
          </button>
        </div>
      )}

      <div className="shrink-0 px-2 pt-2 pb-1 space-y-1.5 border-b border-border-subtle">
        <div className="flex items-center gap-1.5 bg-bg-secondary rounded px-2 py-1">
          <Search size={13} className="shrink-0 text-text-muted" />
          <input
            ref={inputRef}
            value={inputValue}
            onChange={e => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search in files…"
            className="flex-1 min-w-0 bg-transparent text-xs text-text-primary outline-none placeholder:text-text-muted"
            autoFocus
          />
          {isSearching && <Loader2 size={12} className="shrink-0 animate-spin text-text-muted" />}
        </div>
      </div>

      {activeQuery && !isSearching && (
        <div className="shrink-0 px-2 py-1 text-[10px] text-text-muted border-b border-border-subtle">
          {totalMatches} matches / {results.length} files
          {truncated && <span className="text-amber-500 ml-1">(truncated)</span>}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {!activeQuery && !isSearching && (
          <div className="flex flex-col items-center justify-center h-full text-text-muted text-xs gap-2 select-none">
            <Search size={24} className="opacity-30" />
            <span>Enter keywords to search files</span>
          </div>
        )}
        {isMultiRoot && groupedByRoot ? (
          Array.from(groupedByRoot.entries()).map(([root, items]) => (
            <RepoGroup
              key={root}
              root={root}
              results={items}
              query={activeQuery}
              onFileSelect={onFileSelect}
              defaultExpanded
            />
          ))
        ) : (
          results.map((r, i) => (
            <FileGroup
              key={r.file}
              result={r}
              query={activeQuery}
              onFileSelect={onFileSelect}
              defaultExpanded={i < 10}
            />
          ))
        )}
        {activeQuery && !isSearching && results.length === 0 && (
          <div className="px-2 py-8 text-xs text-text-muted text-center">No matching results found</div>
        )}
      </div>
    </div>
  )
}

export default SearchPanel
