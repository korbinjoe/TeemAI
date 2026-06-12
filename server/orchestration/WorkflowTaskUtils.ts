import type { WorkflowEngine } from './WorkflowEngine'
import type { FileManifest, WorkflowTask } from '../../shared/workflow-types'
import { WorktreeManager } from '../git/WorktreeManager'
import { createLogger } from '../lib/logger'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { stat } from 'fs/promises'
import { resolve, matchesGlob } from 'path'

const execFileAsync = promisify(execFile)
const log = createLogger('WorkflowTaskUtils')

export interface FileManifestValidation {
  passed: boolean
  missingFiles: string[]
  emptyFiles: string[]
  forbiddenChanges: string[]
}

export const buildFileManifestBlock = (manifest: FileManifest): string => {
  const lines: string[] = [
    '\n## File Requirements (enforced — violations will cause rejection)\n',
  ]

  lines.push('### Files you MUST create:')
  for (const f of manifest.create) {
    lines.push(`- ${f}`)
  }
  lines.push('')

  if (manifest.modify?.length) {
    lines.push('### Files you MAY modify:')
    for (const f of manifest.modify) {
      lines.push(`- ${f}`)
    }
    lines.push('')
  }

  if (manifest.forbid?.length) {
    lines.push('### Files you MUST NOT touch (except files listed above):')
    for (const f of manifest.forbid) {
      lines.push(`- ${f}`)
    }
    lines.push('')
  }

  lines.push('After creating each file, verify it exists with `ls -la`.')
  return lines.join('\n')
}

export const validateFileManifest = async (
  cwd: string,
  manifest: FileManifest,
  baselineSha?: string,
): Promise<FileManifestValidation> => {
  const result: FileManifestValidation = {
    passed: true,
    missingFiles: [],
    emptyFiles: [],
    forbiddenChanges: [],
  }

  const createSet = new Set(manifest.create)

  for (const filePath of manifest.create) {
    const fullPath = resolve(cwd, filePath)
    try {
      const s = await stat(fullPath)
      if (s.size === 0) {
        result.emptyFiles.push(filePath)
        result.passed = false
      }
    } catch {
      result.missingFiles.push(filePath)
      result.passed = false
    }
  }

  if (manifest.forbid?.length && baselineSha) {
    try {
      const { stdout } = await execFileAsync(
        'git', ['diff', '--name-only', `${baselineSha}..HEAD`],
        { cwd, timeout: 5000 },
      )
      const changedFiles = stdout.trim().split('\n').filter(Boolean)
      for (const changed of changedFiles) {
        if (createSet.has(changed)) continue
        for (const pattern of manifest.forbid) {
          if (matchesGlob(changed, pattern)) {
            result.forbiddenChanges.push(changed)
            result.passed = false
          }
        }
      }
    } catch { /* git diff failure is non-fatal */ }
  }

  return result
}

export const detectMissingManifest = (description: string, manifest?: FileManifest): string | undefined => {
  if (manifest) return undefined
  const creationKeywords = /\b(create|implement|scaffold|build|write)\b.*\b(file|module|server|component|class)\b/i
  if (creationKeywords.test(description)) {
    return 'Note: this task appears to create new files but has no fileManifest. ' +
      'Consider adding one to enforce file creation requirements.'
  }
  return undefined
}

export const shouldUseWorktree = (engine: WorkflowEngine, task: WorkflowTask): boolean => {
  if (task.isolation === 'worktree') return true
  if (task.isolation === 'shared') return false

  const runningTasks = Object.values(engine.getState().tasks)
    .filter(t => t.status === 'running' && t.taskId !== task.taskId)
  return runningTasks.length > 0
}

export const createWorktreeManager = (cwd: string): WorktreeManager => {
  return new WorktreeManager(cwd)
}

export const mergeTaskWorktree = async (
  engine: WorkflowEngine,
  taskId: string,
  cwd: string,
  onConflict: (conflicts: string[] | undefined, worktreePath: string) => void,
): Promise<void> => {
  const taskState = engine.getTaskState(taskId)
  if (!taskState?.worktreePath) return

  const wtManager = createWorktreeManager(cwd)

  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd, timeout: 5000 })
    const currentBranch = stdout.trim()

    const mergeResult = await wtManager.merge({
      worktreePath: taskState.worktreePath,
      targetBranch: currentBranch,
    })

    if (mergeResult.success) {
      await wtManager.remove(taskState.worktreePath, { deleteBranch: true })
      engine.setTaskWorktree(taskId, undefined)
      log.info('Worktree merged and cleaned up', { taskId })
    } else {
      log.warn('Worktree merge conflict', { taskId, conflicts: mergeResult.conflicts })
      onConflict(mergeResult.conflicts, taskState.worktreePath)
    }
  } catch (err) {
    log.warn('Worktree merge failed', {
      taskId, error: err instanceof Error ? err.message : String(err),
    })
  }
}

export const discardWorktree = async (engine: WorkflowEngine, taskId: string, cwd: string): Promise<void> => {
  const taskState = engine.getTaskState(taskId)
  if (!taskState?.worktreePath) return

  try {
    const wtManager = createWorktreeManager(cwd)
    await wtManager.remove(taskState.worktreePath, { force: true, deleteBranch: true })
    engine.setTaskWorktree(taskId, undefined)
    log.info('Worktree discarded', { taskId })
  } catch (err) {
    log.warn('Worktree discard failed', {
      taskId, error: err instanceof Error ? err.message : String(err),
    })
  }
}

export const getCurrentBranch = async (cwd: string): Promise<string> => {
  const { stdout } = await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd, timeout: 5000 })
  return stdout.trim()
}
