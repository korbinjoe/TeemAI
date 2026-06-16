
/**
 *  switch  default  union case
 * TypeScript
 */
export const assertNever = (value: never): never => {
  throw new Error(`Unexpected value: ${JSON.stringify(value)}`)
}

// ── Agent Instance ID ──
// Instance IDs allow multiple copies of the same agent in a mission.
// Format: "agentId:N" where N >= 2 (first instance has no suffix).

export const INSTANCE_SEPARATOR = ':'

export const parseInstanceId = (instanceId: string): { baseId: string; instance: number } => {
  const sepIdx = instanceId.lastIndexOf(INSTANCE_SEPARATOR)
  if (sepIdx === -1) return { baseId: instanceId, instance: 1 }
  const suffix = instanceId.slice(sepIdx + 1)
  const n = Number(suffix)
  if (!Number.isInteger(n) || n < 2) return { baseId: instanceId, instance: 1 }
  return { baseId: instanceId.slice(0, sepIdx), instance: n }
}

export const makeInstanceId = (baseId: string, instance: number): string =>
  instance <= 1 ? baseId : `${baseId}${INSTANCE_SEPARATOR}${instance}`

export const nextInstanceId = (baseId: string, existingIds: string[]): string => {
  let maxInstance = 0
  for (const id of existingIds) {
    const { baseId: b, instance } = parseInstanceId(id)
    if (b === baseId) maxInstance = Math.max(maxInstance, instance)
  }
  return makeInstanceId(baseId, maxInstance + 1)
}

export interface AgentIdRegistry {
  get(id: string): unknown
  list?(): Array<{ id: string }>
}

const registryHasExactAgentId = (registry: AgentIdRegistry, id: string): boolean => {
  if (registry.list) {
    return registry.list().some((agent) => agent.id === id)
  }
  return !!registry.get(id)
}

export const canonicalAgentId = (
  raw: string | null | undefined,
  registry?: AgentIdRegistry,
): string | null => {
  let id = (raw ?? '').trim()
  if (!id) return null

  if (id.endsWith(`${INSTANCE_SEPARATOR}auto`)) {
    id = id.slice(0, -`${INSTANCE_SEPARATOR}auto`.length)
  }

  if (registry && registryHasExactAgentId(registry, id)) return id

  const withoutNumericSuffix = id.replace(/:\d+$/, '')
  if (registry) {
    return registryHasExactAgentId(registry, withoutNumericSuffix) ? withoutNumericSuffix : null
  }

  return withoutNumericSuffix
}
