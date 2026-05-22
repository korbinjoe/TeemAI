
const SELECTED_AGENT_KEY = 'openteam:selected-agent'

export function getSelectedAgentId(): string | null {
  try {
    return localStorage.getItem(SELECTED_AGENT_KEY)
  } catch {
    return null
  }
}

export function setSelectedAgentId(id: string | null) {
  try {
    if (id) {
      localStorage.setItem(SELECTED_AGENT_KEY, id)
    } else {
      localStorage.removeItem(SELECTED_AGENT_KEY)
    }
  } catch { /* ignore */ }
}
