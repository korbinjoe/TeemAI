/**
 * Sensei Response Parser —  LLM
 *
 *  ===IDENTITY=== / ===AGENTS=== / ===SOUL===
 *  markdown
 *  JSON  `{identity, agents, soul}`
 *
 *  fallback —— / null +  partialError
 */

export interface ParsedFullSuite {
  identity: string | null
  agents: string | null
  soul: string | null
  partialError: string[]
}

const SECTIONS = ['identity', 'agents', 'soul'] as const
type Section = (typeof SECTIONS)[number]

const SEPARATOR_REGEX = /^[ \t]*={3,}\s*(IDENTITY|AGENTS|SOUL)\s*={3,}[ \t]*$/im

const buildSegmentRegex = (name: string): RegExp =>
  new RegExp(`^[ \\t]*={3,}\\s*${name}\\s*={3,}[ \\t]*$`, 'im')

const stripCodeFence = (raw: string): string => {
  const fenced = raw.match(/^```(?:[a-zA-Z]+)?\n([\s\S]*?)```\s*$/)
  return fenced ? fenced[1].trim() : raw.trim()
}

const trimSection = (raw: string | null | undefined): string | null => {
  if (raw == null) return null
  const stripped = stripCodeFence(raw).trim()
  return stripped.length > 0 ? stripped : null
}

const parseBySeparators = (raw: string): Partial<Record<Section, string>> | null => {
  if (!SEPARATOR_REGEX.test(raw)) return null

  const result: Partial<Record<Section, string>> = {}
  for (const name of SECTIONS) {
    const startRe = buildSegmentRegex(name.toUpperCase())
    const startMatch = raw.match(startRe)
    if (!startMatch || startMatch.index == null) continue

    const startIdx = startMatch.index + startMatch[0].length
    const rest = raw.slice(startIdx)
    const nextMatch = rest.match(SEPARATOR_REGEX)
    const endIdx = nextMatch?.index ?? rest.length
    result[name] = rest.slice(0, endIdx).replace(/^\n+/, '')
  }
  return result
}

const parseByJson = (raw: string): Partial<Record<Section, string>> | null => {
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return null
  try {
    const obj = JSON.parse(jsonMatch[0]) as Record<string, unknown>
    const out: Partial<Record<Section, string>> = {}
    for (const name of SECTIONS) {
      const v = obj[name]
      if (typeof v === 'string') out[name] = v
    }
    return Object.keys(out).length > 0 ? out : null
  } catch {
    return null
  }
}

/**
 *  buffer fallback /  trim
 *  section.length  emit delta:<section>
 */
export const extractSectionsForStreaming = (
  raw: string,
): Record<Section, string> => {
  const parts = parseBySeparators(raw) ?? {}
  return {
    identity: parts.identity ?? '',
    agents: parts.agents ?? '',
    soul: parts.soul ?? '',
  }
}

/**
 *  feed  raw
 *  ===SECTION===  emit
 */
export const createStreamSplitter = () => {
  let buf = ''
  const emitted: Record<Section, number> = { identity: 0, agents: 0, soul: 0 }

  return {
    feed: (chunk: string, emit: (section: Section, content: string) => void): void => {
      if (!chunk) return
      buf += chunk
      const sections = extractSectionsForStreaming(buf)
      for (const name of SECTIONS) {
        const cur = sections[name]
        if (cur.length > emitted[name]) {
          const slice = cur.slice(emitted[name])
          if (slice) emit(name, slice)
          emitted[name] = cur.length
        }
      }
    },
    full: (): string => buf,
  }
}

export const parseFullSuiteResponse = (raw: string): ParsedFullSuite => {
  const partialError: string[] = []

  if (!raw || !raw.trim()) {
    return {
      identity: null,
      agents: null,
      soul: null,
      partialError: [...SECTIONS],
    }
  }

  const segments = parseBySeparators(raw) ?? parseByJson(raw) ?? {}

  const identity = trimSection(segments.identity)
  const agents = trimSection(segments.agents)
  const soul = trimSection(segments.soul)

  if (!identity) partialError.push('identity')
  if (!agents) partialError.push('agents')
  if (!soul) partialError.push('soul')

  return { identity, agents, soul, partialError }
}
