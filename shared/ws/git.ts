/**
 * Git working-changes WebSocket
 *
 * watcher  path  chatId
 *  openspec/changes/git-status-event-driven/
 */

export interface GitWorkingChangeEntry {
  file: string
  status: 'added' | 'modified' | 'deleted' | 'renamed'
  staged: boolean
  insertions: number
  deletions: number
}

export interface GitWorkingChangesPayload {
  worktreePath: string
  branch: string
  baseBranch: string
  aheadCount: number
  changedFiles: number
  untrackedFiles: number
  insertions: number
  deletions: number
  diffEntries: GitWorkingChangeEntry[]
}

export interface GitSubscribePayload {
  chatId: string
  path: string
}

export interface GitUnsubscribePayload {
  chatId: string
  path: string
}

export interface GitChangesEventPayload {
  chatId: string
  path: string
  payload: GitWorkingChangesPayload
}
