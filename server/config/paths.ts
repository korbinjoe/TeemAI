import { join } from 'path'
import { homedir } from 'os'
import { existsSync, renameSync } from 'fs'

export { OPENTEAM_HOME } from '../../shared/openteam-home'
import { OPENTEAM_HOME } from '../../shared/openteam-home'

const legacyHome = join(homedir(), '.openteam')
if (existsSync(legacyHome) && !existsSync(OPENTEAM_HOME)) {
  renameSync(legacyHome, OPENTEAM_HOME)
  console.log(`[Migration] Renamed ${legacyHome} → ${OPENTEAM_HOME}`)
}

export const TMP_ROOT = join(OPENTEAM_HOME, 'tmp')

export const TMP_MCP_DIR = join(TMP_ROOT, 'mcp')

export const TMP_HOOKS_DIR = join(TMP_ROOT, 'hooks')

export const MAILBOX_ROOT = join(OPENTEAM_HOME, 'mailbox')

/** Chat  ~/.openteam/whiteboard */
export const WHITEBOARD_ROOT = join(OPENTEAM_HOME, 'whiteboard')

/**
 *  cursor  ~/.openteam/whiteboard/_cursors/
 *  chatId {chatId}.json agentInstanceId → lastReadSeq
 *  entries.jsonl  cleanupChat
 */
export const WHITEBOARD_CURSOR_DIR = join(WHITEBOARD_ROOT, '_cursors')

export const TASKS_ROOT = join(OPENTEAM_HOME, 'tasks')
