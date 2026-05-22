export interface CliLog {
  level: 'info' | 'error' | 'warn'
  source: 'stdout' | 'stderr' | 'system'
  data: string
  timestamp: number
}

export interface ParsedLog {
  id: string
  timestamp: number
  kind: 'system' | 'assistant' | 'tool_use' | 'tool_result' | 'result' | 'stream_event' | 'raw' | 'error'
  summary: string
  content: string | null
  overflow: string | null
  level: CliLog['level']
  meta?: Record<string, string>
}

const INLINE_LINE_LIMIT = 4
const INLINE_CHAR_LIMIT = 300

function tryParseJSON(raw: string): Record<string, unknown> | null {
  try { return JSON.parse(raw) } catch { return null }
}

function prettyJSON(obj: unknown): string {
  try { return JSON.stringify(obj, null, 2) } catch { return String(obj) }
}

function splitContent(text: string): { content: string | null; overflow: string | null } {
  if (!text || text.length === 0) return { content: null, overflow: null }
  const lines = text.split('\n')
  if (text.length <= INLINE_CHAR_LIMIT && lines.length <= INLINE_LINE_LIMIT) {
    return { content: text, overflow: null }
  }
  const preview = lines.slice(0, INLINE_LINE_LIMIT).join('\n')
  return {
    content: preview.length > INLINE_CHAR_LIMIT ? preview.slice(0, INLINE_CHAR_LIMIT) + '…' : preview,
    overflow: text,
  }
}

function extractAssistantBlocks(blocks: unknown[]): { summary: string; content: string | null; overflow: string | null } {
  const summaryParts: string[] = []
  const fullParts: string[] = []

  for (const block of blocks) {
    const b = block as Record<string, unknown>
    if (b.type === 'text') {
      const text = (b.text as string) ?? ''
      summaryParts.push('text')
      fullParts.push(text)
    } else if (b.type === 'tool_use') {
      const name = (b.name as string) ?? 'unknown'
      summaryParts.push(`tool:${name}`)
      fullParts.push(`── Tool: ${name} ──\n${prettyJSON(b.input)}`)
    } else if (b.type === 'tool_result') {
      summaryParts.push('tool_result')
      fullParts.push(prettyJSON(b))
    } else {
      summaryParts.push(String(b.type))
      fullParts.push(prettyJSON(b))
    }
  }

  const full = fullParts.join('\n\n')
  const { content, overflow } = splitContent(full)
  return { summary: summaryParts.join(' + '), content, overflow }
}

export function parseCliLog(log: CliLog, index: number): ParsedLog {
  const id = `log-${index}`
  const base = { id, timestamp: log.timestamp, level: log.level }

  if (log.source === 'system') {
    return { ...base, kind: 'system', summary: log.data, content: null, overflow: null }
  }

  if (log.source === 'stderr') {
    const { content, overflow } = splitContent(log.data)
    return { ...base, kind: 'error', summary: 'stderr', content, overflow }
  }

  const msg = tryParseJSON(log.data)
  if (!msg) {
    const { content, overflow } = splitContent(log.data)
    return { ...base, kind: 'raw', summary: 'raw output', content, overflow }
  }

  const type = msg.type as string

  switch (type) {
    case 'system': {
      const sub = msg.subtype as string
      const meta: Record<string, string> = {}
      if (msg.model) meta.model = String(msg.model)
      if (msg.cwd) meta.cwd = String(msg.cwd)

      const infoLines: string[] = []
      if (msg.session_id) infoLines.push(`session: ${msg.session_id}`)
      if (msg.model) infoLines.push(`model: ${msg.model}`)
      if (msg.cwd) infoLines.push(`cwd: ${msg.cwd}`)

      const overflowLines: string[] = []
      const cmds = Array.isArray(msg.slash_commands) ? msg.slash_commands as string[] : []
      const tools = Array.isArray(msg.tools) ? msg.tools as string[] : []
      if (cmds.length > 0) overflowLines.push(`commands (${cmds.length}): ${cmds.join(', ')}`)
      if (tools.length > 0) overflowLines.push(`tools (${tools.length}): ${tools.join(', ')}`)

      return {
        ...base, kind: 'system',
        summary: `system/${sub}`,
        content: infoLines.length > 0 ? infoLines.join('\n') : null,
        overflow: overflowLines.length > 0 ? [...infoLines, ...overflowLines].join('\n') : null,
        meta,
      }
    }

    case 'assistant': {
      const blocks = (msg.message as Record<string, unknown>)?.content
      if (Array.isArray(blocks) && blocks.length > 0) {
        const { summary, content, overflow } = extractAssistantBlocks(blocks)
        return { ...base, kind: 'assistant', summary, content, overflow }
      }
      return { ...base, kind: 'assistant', summary: 'empty', content: null, overflow: null }
    }

    case 'tool': {
      const toolName = (msg.tool_name as string) || 'unknown'
      let fullText = ''
      if (Array.isArray(msg.content)) {
        fullText = (msg.content as Array<Record<string, unknown>>)
          .filter((c) => c.type === 'text')
          .map((c) => c.text as string)
          .join('\n')
      } else if (msg.content) {
        fullText = prettyJSON(msg.content)
      }
      const { content, overflow } = splitContent(fullText)
      return { ...base, kind: 'tool_result', summary: toolName, content, overflow }
    }

    case 'result': {
      const isError = msg.is_error as boolean
      const usage = msg.usage as { input_tokens?: number; output_tokens?: number } | undefined
      const meta: Record<string, string> = {}
      if (msg.duration_ms) meta.duration = `${((msg.duration_ms as number) / 1000).toFixed(1)}s`
      if (msg.total_cost_usd) meta.cost = `$${(msg.total_cost_usd as number).toFixed(4)}`
      if (usage?.input_tokens) meta['in'] = `${usage.input_tokens}`
      if (usage?.output_tokens) meta['out'] = `${usage.output_tokens}`
      if (msg.num_turns) meta.turns = `${msg.num_turns}`

      const infoLines: string[] = []
      if (msg.duration_ms) infoLines.push(`duration: ${meta.duration}`)
      if (msg.total_cost_usd) infoLines.push(`cost: ${meta.cost}`)
      if (usage) infoLines.push(`tokens: ↑${usage.input_tokens ?? 0} ↓${usage.output_tokens ?? 0}`)
      if (msg.num_turns) infoLines.push(`turns: ${msg.num_turns}`)

      let errorOverflow: string | null = null
      if (isError && msg.result) {
        const errStr = String(msg.result)
        if (errStr.length > INLINE_CHAR_LIMIT) {
          errorOverflow = errStr
          infoLines.unshift(`error: ${errStr.slice(0, 120)}…`)
        } else {
          infoLines.unshift(`error: ${errStr}`)
        }
      }

      return {
        ...base, kind: 'result',
        summary: isError ? 'ERROR' : 'OK',
        content: infoLines.length > 0 ? infoLines.join('\n') : null,
        overflow: errorOverflow,
        level: isError ? 'error' : 'info',
        meta,
      }
    }

    case 'stream_event': {
      const evt = msg.event as Record<string, unknown> | undefined
      if (!evt) return { ...base, kind: 'stream_event', summary: 'empty', content: null, overflow: null }

      const evtType = evt.type as string

      if (evtType === 'content_block_delta') {
        const delta = evt.delta as Record<string, unknown> | undefined
        if (delta?.type === 'text_delta') {
          const text = (delta.text as string) ?? ''
          const { content, overflow } = splitContent(text)
          return { ...base, kind: 'stream_event', summary: `text_delta (${text.length})`, content, overflow }
        }
        if (delta?.type === 'input_json_delta') {
          const json = (delta.partial_json as string) ?? ''
          return {
            ...base, kind: 'stream_event', summary: `input_json (${json.length})`,
            content: json.length > 0 ? json.slice(0, INLINE_CHAR_LIMIT) : null,
            overflow: json.length > INLINE_CHAR_LIMIT ? json : null,
          }
        }
        return { ...base, kind: 'stream_event', summary: `δ ${delta?.type ?? '?'}`, content: null, overflow: null }
      }

      if (evtType === 'content_block_start') {
        const block = evt.content_block as Record<string, unknown> | undefined
        const label = block?.type === 'tool_use' ? `tool_use: ${block.name ?? '?'}` : String(block?.type ?? '?')
        return {
          ...base, kind: 'stream_event', summary: `block_start · ${label}`,
          content: block?.id ? `id: ${block.id}` : null,
          overflow: null,
        }
      }

      if (evtType === 'content_block_stop') {
        return { ...base, kind: 'stream_event', summary: 'block_stop', content: null, overflow: null }
      }

      if (evtType === 'message_start' || evtType === 'message_delta' || evtType === 'message_stop') {
        const usageInfo = evtType === 'message_delta' && evt.usage ? prettyJSON(evt.usage) : null
        const { content, overflow } = usageInfo ? splitContent(usageInfo) : { content: null, overflow: null }
        return { ...base, kind: 'stream_event', summary: evtType, content, overflow }
      }

      const full = prettyJSON(evt)
      const { content, overflow } = splitContent(full)
      return { ...base, kind: 'stream_event', summary: evtType, content, overflow }
    }

    default: {
      const full = prettyJSON(msg)
      const { content, overflow } = splitContent(full)
      return { ...base, kind: 'raw', summary: type, content, overflow }
    }
  }
}
