import { execFile } from 'child_process'
import { promisify } from 'util'
import { resolve } from 'path'
import { WorktreeManager, type ConflictAnalysis } from './WorktreeManager'
import type { WorkflowScheduler } from '../orchestration/WorkflowScheduler'
import { createLogger } from '../lib/logger'

const execFileAsync = promisify(execFile)
const log = createLogger('ConflictResolver')

export interface ConflictDiff {
  file: string
  baseChange: string
  featureChange: string
}

export interface ConflictResolutionRequest {
  chatId: string
  worktreePath: string
  repoRoot: string
  targetBranch: string
}

export class ConflictResolver {
  constructor(
    private workflowScheduler: WorkflowScheduler,
    private broadcastToChat: (chatId: string, msg: Record<string, unknown>) => void,
  ) {}

  async resolve(req: ConflictResolutionRequest): Promise<{
    autoResolving: boolean
    escalationReason?: string
  }> {
    const manager = new WorktreeManager(req.repoRoot)

    const analysis = await manager.mergeWithConflictMarkers({
      worktreePath: req.worktreePath,
      targetBranch: req.targetBranch,
    })

    if (analysis.conflictingFiles.length === 0 && analysis.binaryConflicts.length > 0) {
      log.info('Only binary conflicts, escalating to user', { files: analysis.binaryConflicts })
      return { autoResolving: false, escalationReason: 'binary_conflicts_only' }
    }

    if (analysis.conflictingFiles.length === 0) {
      return { autoResolving: false, escalationReason: 'no_text_conflicts' }
    }

    if (analysis.tooManyConflicts) {
      log.info('Too many conflicts, escalating to user', { count: analysis.conflictingFiles.length })
      return { autoResolving: false, escalationReason: 'too_many_conflicts' }
    }

    const diffs = await this.collectConflictDiffs(
      req.worktreePath, analysis,
    )

    const prompt = this.buildConflictPrompt(req, analysis, diffs)
    this.workflowScheduler.notifyLead(req.chatId, prompt)

    this.broadcastToChat(req.chatId, {
      type: 'worktree:conflict-auto-resolving',
      payload: {
        worktreePath: req.worktreePath,
        conflictingFiles: analysis.conflictingFiles,
        binaryConflicts: analysis.binaryConflicts,
      },
    })

    log.info('Dispatched conflict resolution to Lead', {
      chatId: req.chatId,
      textConflicts: analysis.conflictingFiles.length,
      binaryConflicts: analysis.binaryConflicts.length,
    })

    return { autoResolving: true }
  }

  private async collectConflictDiffs(
    worktreePath: string,
    analysis: ConflictAnalysis,
  ): Promise<ConflictDiff[]> {
    const diffs: ConflictDiff[] = []
    const absPath = resolve(worktreePath)

    for (const file of analysis.conflictingFiles.slice(0, 10)) {
      const [baseChange, featureChange] = await Promise.all([
        execFileAsync('git', ['diff', `${analysis.featureBranch}...${analysis.baseBranch}`, '--', file], { cwd: absPath, timeout: 5000 })
          .then(r => r.stdout.slice(0, 3000))
          .catch(() => '(no diff available)'),
        execFileAsync('git', ['diff', `${analysis.baseBranch}...${analysis.featureBranch}`, '--', file], { cwd: absPath, timeout: 5000 })
          .then(r => r.stdout.slice(0, 3000))
          .catch(() => '(no diff available)'),
      ])

      diffs.push({ file, baseChange, featureChange })
    }

    return diffs
  }

  private buildConflictPrompt(
    req: ConflictResolutionRequest,
    analysis: ConflictAnalysis,
    diffs: ConflictDiff[],
  ): string {
    const fileList = analysis.conflictingFiles
      .map(f => `  - ${f}`)
      .join('\n')

    let diffSection = ''
    for (const d of diffs) {
      diffSection += `\n--- ${d.file} ---\n`
      diffSection += `Base branch (${analysis.baseBranch}) change:\n\`\`\`\n${d.baseChange}\n\`\`\`\n\n`
      diffSection += `Feature branch (${analysis.featureBranch}) change:\n\`\`\`\n${d.featureChange}\n\`\`\`\n`
    }

    let binaryNote = ''
    if (analysis.binaryConflicts.length > 0) {
      binaryNote = `\nBinary file conflicts (cannot auto-resolve, will need user attention):\n` +
        analysis.binaryConflicts.map(f => `  - ${f}`).join('\n') + '\n'
    }

    return `[Merge conflict detected]

Worktree: ${req.worktreePath}
Base branch: ${analysis.baseBranch}
Feature branch: ${analysis.featureBranch}
Conflicting files (${analysis.conflictingFiles.length}):
${fileList}
${binaryNote}
Conflict details:
${diffSection}
Dispatch a fullstack-engineer to resolve these conflicts:
1. Use \`handoff.sh fullstack-engineer "<task>"\` with the conflict details above
2. The engineer should work in ${req.worktreePath}, read files with conflict markers, resolve them, \`git add\` resolved files, and \`git commit\`
3. After the engineer completes, review the merge commit diff
4. If resolution looks correct, report success
5. If resolution dropped code from either side, reject with feedback via \`reject-task.sh\`
6. If resolution fails after 2 attempts, write an \`open_question\` to escalate to the user`
  }
}
