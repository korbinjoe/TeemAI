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
export const parseIdentityProviderField = (raw: string): 'claude' | 'codex' | null => {
  const k = providerCompactKey(raw)
  if (k === 'codex') return 'codex'
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
  if (p === 'claude') return 'Claude Code'
  return trimmed
}

/**
 *  Agent JSON  `provider`  Codex  `'codex'` `undefined` Claude
 */
export const agentProviderFromIdentityField = (parsedProviderField: string): 'codex' | undefined =>
  parseIdentityProviderField(parsedProviderField) === 'codex' ? 'codex' : undefined
