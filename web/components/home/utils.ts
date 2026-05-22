import type { AgentActivity, AgentPhase, ExpertActivitySnapshot } from '../../types/chat'
import type { QuickItem } from './types'

export const getQuickItemKey = (item: QuickItem) =>
  item.type === 'workspace' ? `ws-${item.workspaceId}` : `repo-${item.paths[0]}`

export const POINTER_SENSOR_OPTIONS = { activationConstraint: { distance: 8 } }

/**  ExpertActivitySnapshot[]  Record<string, AgentActivity> */
export const toExpertActivitiesMap = (
  experts?: ExpertActivitySnapshot[],
): Record<string, AgentActivity> => {
  if (!experts?.length) return {}
  const map: Record<string, AgentActivity> = {}
  for (const e of experts) {
    map[e.agentId] = {
      phase: e.phase as AgentPhase,
      background: false,
      currentTool: e.currentTool,
      toolCount: e.toolCount,
      toolCompleted: e.toolCompleted,
      hasText: false,
      cost: e.cost,
      updatedAt: Date.now(),
    }
  }
  return map
}
