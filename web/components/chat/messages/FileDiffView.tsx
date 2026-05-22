/** FileDiffView — Edit / MultiEdit / Write  diff  */

import { useMemo } from 'react'
import { diffLines, type Change } from 'diff'

type DiffLine = { kind: 'add' | 'del' | 'ctx'; text: string }

type EditBlock = {
  oldString: string
  newString: string
  replaceAll?: boolean
}

type ParsedInput =
  | { kind: 'edit'; filePath: string; blocks: EditBlock[] }
  | { kind: 'write'; filePath: string; content: string }
  | null

const parseInput = (toolName: string, input: string): ParsedInput => {
  try {
    const parsed = JSON.parse(input)
    const filePath = typeof parsed.file_path === 'string' ? parsed.file_path : ''
    if (!filePath) return null

    if (toolName === 'Edit') {
      if (typeof parsed.old_string !== 'string' || typeof parsed.new_string !== 'string') return null
      return {
        kind: 'edit',
        filePath,
        blocks: [{ oldString: parsed.old_string, newString: parsed.new_string, replaceAll: parsed.replace_all }],
      }
    }

    if (toolName === 'MultiEdit') {
      if (!Array.isArray(parsed.edits)) return null
      const blocks: EditBlock[] = []
      for (const e of parsed.edits) {
        if (typeof e?.old_string === 'string' && typeof e?.new_string === 'string') {
          blocks.push({ oldString: e.old_string, newString: e.new_string, replaceAll: e.replace_all })
        }
      }
      if (blocks.length === 0) return null
      return { kind: 'edit', filePath, blocks }
    }

    if (toolName === 'Write') {
      if (typeof parsed.content !== 'string') return null
      return { kind: 'write', filePath, content: parsed.content }
    }
  } catch { /* ignore */ }
  return null
}

const splitLines = (value: string): string[] => {
  if (value === '') return []
  const trimmed = value.endsWith('\n') ? value.slice(0, -1) : value
  return trimmed.split('\n')
}

const changesToLines = (changes: Change[]): DiffLine[] => {
  const lines: DiffLine[] = []
  for (const c of changes) {
    const kind: DiffLine['kind'] = c.added ? 'add' : c.removed ? 'del' : 'ctx'
    for (const text of splitLines(c.value)) {
      lines.push({ kind, text })
    }
  }
  return lines
}

/**  unchanged  threshold  keep  */
const collapseContext = (lines: DiffLine[], threshold = 6, keep = 2): DiffLine[] => {
  const out: DiffLine[] = []
  let i = 0
  while (i < lines.length) {
    if (lines[i].kind !== 'ctx') { out.push(lines[i]); i++; continue }
    let j = i
    while (j < lines.length && lines[j].kind === 'ctx') j++
    const run = j - i
    const atStart = i === 0
    const atEnd = j === lines.length
    if (run > threshold) {
      if (!atStart) for (let k = 0; k < keep; k++) out.push(lines[i + k])
      out.push({ kind: 'ctx', text: `⋯ ${run - (atStart ? 0 : keep) - (atEnd ? 0 : keep)} unchanged lines` })
      if (!atEnd) for (let k = keep; k > 0; k--) out.push(lines[j - k])
    } else {
      for (let k = i; k < j; k++) out.push(lines[k])
    }
    i = j
  }
  return out
}

const styles = {
  container: {
    borderRadius: 4,
    background: 'rgb(var(--bg-elevated))',
    border: '1px solid rgb(var(--border-subtle))',
    fontFamily: "'SF Mono', Menlo, Consolas, monospace",
    fontSize: 11,
    lineHeight: 1.5,
    overflow: 'hidden',
    marginBottom: 2,
  },
  header: {
    padding: '4px 8px',
    borderBottom: '1px solid rgb(var(--border-subtle))',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: 'rgb(var(--bg-hover-subtle) / var(--bg-hover-subtle-alpha))',
  },
  filePath: {
    fontSize: 10,
    color: 'rgb(var(--text-secondary))',
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  stat: { fontSize: 10, fontVariantNumeric: 'tabular-nums' as const },
  body: { maxHeight: 360, overflowY: 'auto' as const, padding: '2px 0' },
  row: (kind: DiffLine['kind']) => ({
    display: 'flex',
    padding: '0 8px',
    background:
      kind === 'add' ? 'rgb(var(--accent-green) / 0.08)' :
      kind === 'del' ? 'rgb(var(--accent-red) / 0.08)' :
      'transparent',
    color:
      kind === 'add' ? 'rgb(var(--accent-green))' :
      kind === 'del' ? 'rgb(var(--accent-red))' :
      'rgb(var(--text-muted))',
  }),
  gutter: {
    width: 14,
    flexShrink: 0,
    opacity: 0.6,
    userSelect: 'none' as const,
    textAlign: 'center' as const,
  },
  code: {
    flex: 1,
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-all' as const,
  },
  blockLabel: {
    padding: '3px 8px',
    fontSize: 10,
    color: 'rgb(var(--text-muted))',
    borderTop: '1px dashed rgb(var(--border-subtle))',
    opacity: 0.75,
  },
}

const DiffBody = ({ lines }: { lines: DiffLine[] }) => (
  <div style={styles.body}>
    {lines.map((line, idx) => (
      <div key={idx} style={styles.row(line.kind)}>
        <span style={styles.gutter}>{line.kind === 'add' ? '+' : line.kind === 'del' ? '-' : ' '}</span>
        <span style={styles.code}>{line.text || ' '}</span>
      </div>
    ))}
  </div>
)

const countLines = (lines: DiffLine[]) => {
  let adds = 0, dels = 0
  for (const l of lines) {
    if (l.kind === 'add') adds++
    else if (l.kind === 'del') dels++
  }
  return { adds, dels }
}

const shortPath = (p: string) => {
  const parts = p.split('/')
  if (parts.length <= 3) return p
  return '…/' + parts.slice(-3).join('/')
}

const FileDiffView = ({ toolName, toolInput }: { toolName: string; toolInput: string }) => {
  const parsed = useMemo(() => parseInput(toolName, toolInput), [toolName, toolInput])

  const rendered = useMemo(() => {
    if (!parsed) return null
    if (parsed.kind === 'write') {
      const lines = splitLines(parsed.content).map((text) => ({ kind: 'add' as const, text }))
      return { lines, blockRanges: [] as { start: number; label: string }[] }
    }
    const lines: DiffLine[] = []
    const blockRanges: { start: number; label: string }[] = []
    parsed.blocks.forEach((block, i) => {
      if (parsed.blocks.length > 1) {
        blockRanges.push({ start: lines.length, label: `Edit ${i + 1}${block.replaceAll ? ' · replace_all' : ''}` })
      }
      const changes = diffLines(block.oldString, block.newString)
      lines.push(...collapseContext(changesToLines(changes)))
    })
    return { lines, blockRanges }
  }, [parsed])

  if (!parsed || !rendered) return null

  const { adds, dels } = countLines(rendered.lines)
  const isWrite = parsed.kind === 'write'

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.filePath} title={parsed.kind === 'write' ? parsed.filePath : parsed.filePath}>
          {shortPath(parsed.kind === 'write' ? parsed.filePath : parsed.filePath)}
        </span>
        {isWrite ? (
          <span style={{ ...styles.stat, color: 'rgb(var(--accent-green))' }}>new · {adds} lines</span>
        ) : (
          <>
            <span style={{ ...styles.stat, color: 'rgb(var(--accent-green))' }}>+{adds}</span>
            <span style={{ ...styles.stat, color: 'rgb(var(--accent-red))' }}>-{dels}</span>
          </>
        )}
      </div>
      {rendered.blockRanges.length === 0 ? (
        <DiffBody lines={rendered.lines} />
      ) : (
        <div style={styles.body}>
          {rendered.blockRanges.map((range, idx) => {
            const end = idx + 1 < rendered.blockRanges.length ? rendered.blockRanges[idx + 1].start : rendered.lines.length
            const slice = rendered.lines.slice(range.start, end)
            return (
              <div key={idx}>
                <div style={styles.blockLabel}>{range.label}</div>
                {slice.map((line, i) => (
                  <div key={i} style={styles.row(line.kind)}>
                    <span style={styles.gutter}>{line.kind === 'add' ? '+' : line.kind === 'del' ? '-' : ' '}</span>
                    <span style={styles.code}>{line.text || ' '}</span>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default FileDiffView
