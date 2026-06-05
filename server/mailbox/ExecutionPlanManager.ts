/**
 * ExecutionPlanManager -
 *
 *  ~/.teemai/tasks/{taskId}/plan.md
 * -  TaskEnvelope  plan.md
 * -  plan.md  Agent
 * - / plan.mdAgent
 * -  result.md TaskResult
 *
 * plan.md  Agent  LLM
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { rm } from 'fs/promises'
import { TASKS_ROOT } from '../config/paths'
import type { TaskEnvelope, TaskResult } from '../../shared/agent-message-types'
import { createLogger } from '../lib/logger'

const log = createLogger('ExecutionPlanManager')

export class ExecutionPlanManager {
  private taskDir(taskId: string): string {
    return join(TASKS_ROOT, taskId)
  }

  private planPath(taskId: string): string {
    return join(this.taskDir(taskId), 'plan.md')
  }

  private resultPath(taskId: string): string {
    return join(this.taskDir(taskId), 'result.md')
  }

  private ensureTaskDir(taskId: string): string {
    const dir = this.taskDir(taskId)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    return dir
  }

  /**
   *  TaskEnvelope  plan.md
   * Agent
   */
  createPlan(envelope: TaskEnvelope, dispatcherInstanceId: string): string {
    this.ensureTaskDir(envelope.taskId)

    const lines: string[] = [
      `# Task: ${envelope.taskId}`,
      '',
      '## Source',
      `- Dispatcher: ${dispatcherInstanceId}`,
      `- Executor: ${envelope.agentId}${envelope.instanceSuffix ? `#${envelope.instanceSuffix}` : ''}`,
      `- Priority: ${envelope.priority || 'p1'}`,
    ]

    if (envelope.parentTaskId) {
      lines.push(`- Parent task: ${envelope.parentTaskId}`)
    }

    if (envelope.expectedOutputs?.acceptanceCriteria?.length) {
      lines.push('- Acceptance criteria:')
      for (const criterion of envelope.expectedOutputs.acceptanceCriteria) {
        lines.push(`  - ${criterion}`)
      }
    }

    lines.push('', '## TaskDescription', '', envelope.description, '')

    if (envelope.inputs?.files?.length) {
      lines.push('## Key Files', '')
      for (const file of envelope.inputs.files) {
        lines.push(`- ${file}`)
      }
      lines.push('')
    }

    if (envelope.inputs?.context) {
      lines.push('## Context', '', envelope.inputs.context, '')
    }

    lines.push(
      '## Execution Plan',
      '',
      '- [ ] Step 1: Analyze requirements, confirm change scope',
      '- [ ] Step 2: Implement',
      '- [ ] Step 3: Self-test and verify',
      '',
      '## Blockers',
      '',
      '(None)',
      '',
      '## Deliverables',
      '',
      '（To be filled after execution）',
      '',
    )

    const content = lines.join('\n')
    writeFileSync(this.planPath(envelope.taskId), content, 'utf-8')
    log.info('Created plan.md', { taskId: envelope.taskId })
    return this.planPath(envelope.taskId)
  }

  readPlan(taskId: string): string | null {
    const path = this.planPath(taskId)
    if (!existsSync(path)) return null
    return readFileSync(path, 'utf-8')
  }

  updatePlan(taskId: string, content: string): void {
    this.ensureTaskDir(taskId)
    writeFileSync(this.planPath(taskId), content, 'utf-8')
    log.debug('Updated plan.md', { taskId })
  }

  writeResult(result: TaskResult): string {
    this.ensureTaskDir(result.taskId)

    const lines: string[] = [
      `# Result: ${result.taskId}`,
      '',
      `- Executor: ${result.executor}`,
      `- Status: ${result.status}`,
    ]

    if (result.parentTaskId) {
      lines.push(`- Parent task: ${result.parentTaskId}`)
    }

    lines.push('', '## Execution Summary', '', result.summary, '')

    if (result.failureReason) {
      lines.push('## Failure Reason', '', result.failureReason, '')
    }

    if (result.artifacts.length > 0) {
      lines.push('## Deliverables', '')
      for (const artifact of result.artifacts) {
        lines.push(`- \`${artifact.path}\` (${artifact.type}): ${artifact.description}`)
      }
      lines.push('')
    }

    if (result.modifiedFiles.length > 0) {
      lines.push('## Modified Files', '')
      lines.push('| File | Action | +Lines | -Lines |')
      lines.push('|------|------|-----|-----|')
      for (const file of result.modifiedFiles) {
        lines.push(`| ${file.path} | ${file.changeType} | ${file.linesAdded} | ${file.linesRemoved} |`)
      }
      lines.push('')
    }

    if (result.impactAnalysis) {
      lines.push('## Impact Analysis', '')
      lines.push(`- Affected modules: ${result.impactAnalysis.affectedModules.join(', ')}`)
      lines.push(`- Risk areas: ${result.impactAnalysis.riskAreas.join(', ')}`)
      lines.push(`- TestOverride: ${result.impactAnalysis.testCoverage}`)
      lines.push('')
    }

    if (result.delegatedResults?.length) {
      lines.push('## Sub-Task Results', '')
      for (const sub of result.delegatedResults) {
        lines.push(`- **${sub.taskId}** (${sub.executor}): ${sub.status} — ${sub.summary}`)
      }
      lines.push('')
    }

    if (result.followUp?.length) {
      lines.push('## Follow-up Suggestions', '')
      for (const item of result.followUp) {
        lines.push(`- ${item}`)
      }
      lines.push('')
    }

    const content = lines.join('\n')
    writeFileSync(this.resultPath(result.taskId), content, 'utf-8')
    log.info('Written result.md', { taskId: result.taskId, status: result.status })
    return this.resultPath(result.taskId)
  }

  readResult(taskId: string): string | null {
    const path = this.resultPath(taskId)
    if (!existsSync(path)) return null
    return readFileSync(path, 'utf-8')
  }

  exists(taskId: string): boolean {
    return existsSync(this.planPath(taskId)) || existsSync(this.resultPath(taskId))
  }

  getTaskDir(taskId: string): string {
    return this.taskDir(taskId)
  }

  async cleanup(taskId: string): Promise<void> {
    const dir = this.taskDir(taskId)
    if (!existsSync(dir)) return
    await rm(dir, { recursive: true, force: true })
    log.info('Cleaned up task dir', { taskId })
  }
}
