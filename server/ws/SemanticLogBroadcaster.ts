/**
 * SemanticLogBroadcaster -
 *
 *  SessionRegistry  activity
 *  ActivityDeriver  LogSemanticizer
 *  chatId  WS
 *
 *  server/index.ts
 */

import type { WebSocket } from 'ws'
import type { AgentRegistry } from '../config/AgentRegistry'
import type { SessionRegistry } from '../terminal/SessionRegistry'
import { LogSemanticizer } from '../terminal/LogSemanticizer'
import type { ActivityState, AgentPhase } from '../terminal/ActivityDeriver'

export class SemanticLogBroadcaster {
  private logSemanticizer = new LogSemanticizer()
  private prevActivityMap = new Map<string, ActivityState>()

  constructor(
    private agentRegistry: AgentRegistry,
    private sessionRegistry: SessionRegistry,
    private getConnectionWs: (connId: string) => WebSocket | undefined,
  ) {}

  /**
   *  activity
   *  onActivityChanged
   */
  handle(payload: { chatId: string; agentActivities?: Array<{
    agentId: string
    agentName: string
    phase: string
    currentTool?: string
    toolCount: number
    toolCompleted: number
    cost?: number
  }> }): void {
    if (!payload.agentActivities) return

    for (const agentSnapshot of payload.agentActivities) {
      const key = `${payload.chatId}:${agentSnapshot.agentId}`
      const prev = this.prevActivityMap.get(key) ?? null
      const curr: ActivityState = {
        phase: agentSnapshot.phase as AgentPhase,
        background: false,
        currentTool: agentSnapshot.currentTool,
        toolCount: agentSnapshot.toolCount,
        toolCompleted: agentSnapshot.toolCompleted,
        hasText: false,
        cost: agentSnapshot.cost,
        updatedAt: Date.now(),
      }

      const agentDef = this.agentRegistry.get(agentSnapshot.agentId) ?? this.agentRegistry.getByName(agentSnapshot.agentName)
      const personality = agentDef?.personality

      const entry = this.logSemanticizer.transform(
        agentSnapshot.agentId, agentSnapshot.agentName,
        personality, prev, curr,
      )

      this.prevActivityMap.set(key, curr)

      if (entry) {
        const slMsg = JSON.stringify({ type: 'semantic-log', payload: { chatId: payload.chatId, entry } })
        for (const connId of this.sessionRegistry.getConnectionsForChat(payload.chatId)) {
          const ws = this.getConnectionWs(connId)
          if (ws && ws.readyState === 1) ws.send(slMsg)
        }
      }
    }
  }
}
