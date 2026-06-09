/**
 * SQLite via API
 *
 *  ID  SQLite _meta
 *  localStorage
 */

import { API_BASE, authFetch } from '@/config/api'

const LEGACY_HIRED_KEY = 'teemai:hired-agents'
const LEGACY_INIT_KEY = 'teemai:hired-agents-initialized'

interface HiredAgentsResponse {
  ids: string[]
  initialized: boolean
}

const fetchHiredAgents = async (): Promise<HiredAgentsResponse> => {
  const res = await authFetch(`${API_BASE}/api/preferences/hired-agents`)
  if (!res.ok) return { ids: [], initialized: false }
  return res.json()
}

const putHiredAgents = async (ids: string[]): Promise<void> => {
  await authFetch(`${API_BASE}/api/preferences/hired-agents`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  })
}

// ── localStorage Migration ──

const migrateLegacyData = async (): Promise<string[] | null> => {
  try {
    const raw = localStorage.getItem(LEGACY_HIRED_KEY)
    if (!raw) return null
    const ids = JSON.parse(raw)
    if (!Array.isArray(ids) || ids.length === 0) return null
    // Write SQLite
    await putHiredAgents(ids)
    localStorage.removeItem(LEGACY_HIRED_KEY)
    localStorage.removeItem(LEGACY_INIT_KEY)
    console.log('[teamStorage] Migrated hired-agents from localStorage to SQLite')
    return ids
  } catch {
    return null
  }
}

/**
 * 1.  localStorage
 * 2.  SQLite
 * 3.  First run: hire all builtin agents
 * 4.  Later runs: drop stale ids, auto-hire newly added builtins
 *
 */
export const initDefaultHiredAgents = async (
  allAgents: Array<{ id: string; source: string }>,
): Promise<string[]> => {
  const migrated = await migrateLegacyData()
  if (migrated) return migrated

  const { ids, initialized } = await fetchHiredAgents()

  if (!initialized) {
    const builtinIds = allAgents
      .filter((a) => a.source === 'builtin')
      .map((a) => a.id)
    await putHiredAgents(builtinIds)
    return builtinIds
  }

  const allAgentIds = new Set(allAgents.map((a) => a.id))
  const builtinIds = allAgents
    .filter((a) => a.source === 'builtin')
    .map((a) => a.id)

  let updated = ids.filter((id) => allAgentIds.has(id))
  const missingBuiltins = builtinIds.filter((id) => !updated.includes(id))
  if (missingBuiltins.length > 0) {
    updated = [...updated, ...missingBuiltins]
  }

  if (updated.length !== ids.length) {
    await putHiredAgents(updated)
  }

  return updated
}

export const getHiredAgentIds = async (): Promise<string[]> => {
  const { ids } = await fetchHiredAgents()
  return ids
}

export const setHiredAgentIds = async (ids: string[]): Promise<void> => {
  await putHiredAgents(ids)
}

export const hireAgent = async (id: string): Promise<string[]> => {
  const current = await getHiredAgentIds()
  if (current.includes(id)) return current
  const updated = [...current, id]
  await setHiredAgentIds(updated)
  return updated
}

export const fireAgent = async (id: string): Promise<string[]> => {
  const current = await getHiredAgentIds()
  const updated = current.filter((i) => i !== id)
  await setHiredAgentIds(updated)
  return updated
}

export const isAgentHired = async (id: string): Promise<boolean> => {
  const ids = await getHiredAgentIds()
  return ids.includes(id)
}

const AGENT_ORDER_KEY = 'teemai:agent-order'

export const DEFAULT_AGENT_ORDER = [
  'lead',
  'fullstack-engineer',
  'code-reviewer',
  'ui-designer',
  'devops-engineer',
  'sensei',
]

export const getAgentOrder = (): string[] => {
  try {
    const raw = localStorage.getItem(AGENT_ORDER_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export const setAgentOrder = (ids: string[]) => {
  try {
    localStorage.setItem(AGENT_ORDER_KEY, JSON.stringify(ids))
  } catch { /* ignore */ }
}

export const sortAgents = <T extends { id: string }>(agents: T[]): T[] => {
  const userOrder = getAgentOrder()
  const order = userOrder.length > 0 ? userOrder : DEFAULT_AGENT_ORDER

  const orderMap = new Map(order.map((id, idx) => [id, idx]))
  return [...agents].sort((a, b) => {
    const ai = orderMap.get(a.id) ?? 999
    const bi = orderMap.get(b.id) ?? 999
    return ai - bi
  })
}
