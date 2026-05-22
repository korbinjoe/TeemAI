/**
 * ACP update  — Bridge  DevPanel  SSOT
 *
 *  stream-json provider
 * Bridgeserver  return null + DevPanelweb
 *
 * tool_call / tool_call_update / agent_thought_chunk / _openteam/thinking
 *  CliACPAdapter  emit _openteam/messages_batch
 */

export const SUPPRESSED_UPDATE_TYPES = [
  'user_message_chunk',
  '_openteam/cli_init',
  'config_option_update',
] as const

export type SuppressedUpdateType = typeof SUPPRESSED_UPDATE_TYPES[number]

export const isSuppressedUpdate = (type: string): boolean =>
  (SUPPRESSED_UPDATE_TYPES as readonly string[]).includes(type)
