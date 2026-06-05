/**
 * ACPToFrontendBridge - ACP session/update → WS
 *
 *  14  SessionUpdateType8  update 6
 * default  assertNever
 *
 * ACP  → WS payload  WS
 *   - planentries → expert:plan-update { plan: { entries } }
 *   - current_mode_update（modeId）→ expert:mode-change（currentModeId）
 *   - available_commands_update（AvailableCommand[]）→ expert:commands-update（string[]）
 */

import type { SessionUpdateType, ACPAvailableCommand } from '../../shared/acp-types'
import { assertNever } from '../../shared/utils'

export interface BridgeContext {
  agentId: string
  sessionId: string
  chatId: string
}

export interface WSMessage {
  type: string
  payload: Record<string, unknown>
}

export const acpUpdateToWSMessage = (
  update: SessionUpdateType,
  ctx: BridgeContext,
): WSMessage | null => {
  const { agentId, sessionId, chatId } = ctx

  switch (update.sessionUpdate) {

    case 'agent_message_chunk':
      return {
        type: 'expert:partial-text',
        payload: {
          agentId, sessionId, chatId,
          blockIndex: (update.content._meta as any)?.blockIndex ?? 0,
          text: update.content.type === 'text' ? update.content.text : '',
        },
      }

    case '_teemai/activity':
      return {
        type: 'expert:activity',
        payload: { agentId, sessionId, chatId, activity: update.activity },
      }

    case '_teemai/messages_batch':
      return {
        type: 'expert:structured-message',
        payload: {
          agentId, sessionId, chatId,
          type: update.batchType ?? 'delta',
          messages: update.messages,
          replacedStatsId: update.replacedStatsId,
        },
      }

    case 'plan':
      return {
        type: 'expert:plan-update',
        payload: { agentId, sessionId, chatId, plan: { entries: update.entries } },
      }

    case 'current_mode_update':
      return {
        type: 'expert:mode-change',
        payload: { agentId, sessionId, chatId, currentModeId: update.modeId },
      }

    case 'available_commands_update':
      return {
        type: 'expert:commands-update',
        payload: {
          agentId, sessionId, chatId,
          availableCommands: update.availableCommands.map((cmd: ACPAvailableCommand) => cmd.name),
        },
      }

    case 'session_info_update':
      return {
        type: 'expert:session-info',
        payload: { agentId, sessionId, chatId, title: update.title, updatedAt: update.updatedAt },
      }

    case 'tool_call':
    case 'tool_call_update':
    case 'agent_thought_chunk':
    case '_teemai/thinking':
      return null

    case 'config_option_update':
      return null

    case 'user_message_chunk':
      return null

    case '_teemai/cli_init':
      return null

    default:
      return assertNever(update)
  }
}
