import { API_BASE, authFetch } from '@/config/api'

export interface GenerateAvatarParams {
  name: string
  animal: string
}

export interface GenerateAvatarResult {
  ok: boolean
  succeeded: number
  failed: number
  errors?: Array<{ style: string; reason: string }>
  reason?: string
}

export const generateAvatar = async (
  agentId: string,
  params: GenerateAvatarParams,
): Promise<GenerateAvatarResult | null> => {
  if (!agentId || !params.name || !params.animal) return null
  try {
    const res = await authFetch(`${API_BASE}/api/agents/generate-avatar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId, ...params }),
    })
    return await res.json() as GenerateAvatarResult
  } catch (err) {
    console.warn('[agentApi] generateAvatar failed', err)
    return null
  }
}
