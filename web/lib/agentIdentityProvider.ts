/**
 * IDENTITY.md  `provider`  `Agent.provider`  `codex` /  claude
 */

/**  `claude code` → `claudecode` */
const providerCompactKey = (raw: string) => raw.trim().toLowerCase().replace(/\s+/g, '')

/**
 *  `provider:`
 * `claudecode`  `Claude Code` / `claude code` Claude Code `claude`
 *
 * @returns  Claude / Codex  `null`
 */
export const parseIdentityProviderField = (raw: string): 'claude' | 'codex' | 'qoder' | 'qodercli' | null => {
  const k = providerCompactKey(raw)
  if (k === 'codex') return 'codex'
  if (k === 'qodercli') return 'qodercli'
  if (k === 'qoder') return 'qoder'
  if (k === 'claude' || k === 'claudecode') return 'claude'
  return null
}

/**
 *  IDENTITY  `provider:` Claude  `Claude Code`
 */
export const formatIdentityProviderYamlValue = (parsedProviderField: string): string => {
  const trimmed = parsedProviderField.trim()
  if (!trimmed) return 'Claude Code'
  const p = parseIdentityProviderField(trimmed)
  if (p === 'codex') return 'Codex'
  if (p === 'qodercli') return 'Qoder CLI'
  if (p === 'qoder') return 'Qoder'
  if (p === 'claude') return 'Claude Code'
  return trimmed
}

/**
 *  Agent JSON  `provider`  Codex  `'codex'` `undefined` Claude
 */
export const agentProviderFromIdentityField = (parsedProviderField: string): 'codex' | 'qoder' | 'qodercli' | undefined => {
  const p = parseIdentityProviderField(parsedProviderField)
  if (p === 'codex') return 'codex'
  if (p === 'qodercli') return 'qodercli'
  if (p === 'qoder') return 'qoder'
  return undefined
}
