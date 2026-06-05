import { join } from 'path'
import { homedir } from 'os'
import { existsSync, renameSync } from 'fs'

export { TEEMAI_HOME } from '../../shared/teemai-home'
import { TEEMAI_HOME } from '../../shared/teemai-home'

const legacyHome = join(homedir(), '.openteam')
if (existsSync(legacyHome) && !existsSync(TEEMAI_HOME)) {
  renameSync(legacyHome, TEEMAI_HOME)
  console.log(`[Migration] Renamed ${legacyHome} → ${TEEMAI_HOME}`)
}

export const TMP_ROOT = join(TEEMAI_HOME, 'tmp')

export const TMP_MCP_DIR = join(TMP_ROOT, 'mcp')

export const TMP_HOOKS_DIR = join(TMP_ROOT, 'hooks')

export const MAILBOX_ROOT = join(TEEMAI_HOME, 'mailbox')

/** Chat  ~/.teemai/whiteboard */
export const WHITEBOARD_ROOT = join(TEEMAI_HOME, 'whiteboard')

/**
 *  cursor  ~/.teemai/whiteboard/_cursors/
 *  chatId {chatId}.json agentInstanceId → lastReadSeq
 *  entries.jsonl  cleanupChat
 */
export const WHITEBOARD_CURSOR_DIR = join(WHITEBOARD_ROOT, '_cursors')

export const TASKS_ROOT = join(TEEMAI_HOME, 'tasks')
