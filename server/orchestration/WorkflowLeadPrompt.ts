import type { WorkflowEngine } from './WorkflowEngine'
import type { TaskResult } from '../../shared/agent-message-types'
import type { FileManifestValidation } from './WorkflowTaskUtils'

export interface EnrichedTaskContext {
  summary: string
  artifacts: TaskResult['artifacts']
  modifiedFiles: TaskResult['modifiedFiles']
  gitDiffStat?: string
  artifactSnippets?: Array<{ path: string; content: string }>
  fileManifestValidation?: FileManifestValidation
}

interface LeadPromptProgress {
  event: string
  completedTaskId: string
  completedBy: string
  workflowStatus: string
  autoAdvanced?: boolean
  tasks: Array<{ taskId: string; agentId: string; status: string; summary?: string; rejectCount?: number }>
  readyTasks: Array<{ taskId: string; agentId: string; description: string }>
  enriched?: EnrichedTaskContext
}

const buildFallbackOption = (
  workflowId: string,
  p: { completedTaskId: string; tasks: Array<{ taskId: string; rejectCount?: number }> },
  engine: WorkflowEngine | undefined,
): string => {
  if (!engine) return '3. Write an `open_question` to the whiteboard — you need user input to decide\n'

  const dag = engine.getState().dag
  if (!dag.fallback) {
    return '3. Write an `open_question` to the whiteboard — you need user input to decide\n'
  }

  const task = dag.tasks.find(t => t.taskId === p.completedTaskId)
  const taskInfo = p.tasks.find(t => t.taskId === p.completedTaskId)
  const maxRejects = task?.maxRejects ?? 2
  const atPenultimate = (taskInfo?.rejectCount ?? 0) >= maxRejects - 1

  if (atPenultimate) {
    return `3. \`fallback-workflow.sh '${workflowId}'\` — abandon individual tasks, merge all remaining into a single handoff (RECOMMENDED: next rejection hits the cap)\n` +
      '4. Write an `open_question` to the whiteboard — you need user input to decide\n'
  }
  return `3. \`fallback-workflow.sh '${workflowId}'\` — merge remaining tasks into single handoff\n` +
    '4. Write an `open_question` to the whiteboard — you need user input to decide\n'
}

export const buildLeadPrompt = (
  workflowId: string,
  progress: Record<string, unknown>,
  engine: WorkflowEngine | undefined,
): string => {
  const p = progress as LeadPromptProgress

  const taskLines = p.tasks.map(t => {
    const icon = t.status === 'completed' ? '[done]' :
                 t.status === 'running' ? '[running]' :
                 t.status === 'failed' ? '[FAILED]' :
                 t.status === 'pending' ? '[pending]' : `[${t.status}]`
    const rejected = t.rejectCount ? ` (rejected ${t.rejectCount}x)` : ''
    return `  ${icon} ${t.taskId} (${t.agentId})${rejected}${t.summary ? ': ' + t.summary : ''}`
  }).join('\n')

  const readyLines = p.readyTasks.length > 0
    ? p.readyTasks.map(t => `  - ${t.taskId} → ${t.agentId}: ${t.description.slice(0, 100)}`).join('\n')
    : '  (none)'

  let enrichedSection = ''
  const enriched = p.enriched

  if (enriched?.gitDiffStat) {
    enrichedSection += `\nGit changes:\n\`\`\`\n${enriched.gitDiffStat}\`\`\`\n`
  }

  if (enriched?.modifiedFiles?.length) {
    enrichedSection += `\nModified files:\n`
    for (const f of enriched.modifiedFiles) {
      enrichedSection += `  ${f.changeType} ${f.path} (+${f.linesAdded} -${f.linesRemoved})\n`
    }
  }

  if (enriched?.artifactSnippets?.length) {
    enrichedSection += `\nArtifact previews:\n`
    for (const s of enriched.artifactSnippets) {
      enrichedSection += `--- ${s.path} ---\n${s.content}\n---\n\n`
    }
  }

  if (enriched?.fileManifestValidation) {
    const v = enriched.fileManifestValidation
    enrichedSection += `\nFile Manifest Validation: ${v.passed ? 'PASSED' : 'FAILED'}\n`
    if (v.missingFiles.length) {
      enrichedSection += `  Missing files: ${v.missingFiles.join(', ')}\n`
    }
    if (v.emptyFiles.length) {
      enrichedSection += `  Empty files (0 bytes): ${v.emptyFiles.join(', ')}\n`
    }
    if (v.forbiddenChanges.length) {
      enrichedSection += `  Forbidden file changes: ${v.forbiddenChanges.join(', ')}\n`
    }
  }

  const autoAdvanceNote = p.autoAdvanced
    ? '\n\nNote: downstream tasks were auto-advanced per workflow config. No action needed for advancement.\n'
    : ''

  return `[Workflow progress: ${workflowId}]

Event: ${p.event === 'task_completed' ? 'Task completed' : 'Task failed'}
Task: ${p.completedTaskId} by ${p.completedBy}
Workflow status: ${p.workflowStatus}
${autoAdvanceNote}
All tasks:
${taskLines}
${enrichedSection}
Ready to start:
${readyLines}

Review the completed work and choose one action:
1. \`advance-workflow.sh '${workflowId}'\` — deliverables are satisfactory, proceed to next tasks
2. \`reject-task.sh '${workflowId}' '${p.completedTaskId}' "<feedback>"\` — deliverables are missing or wrong, send back with specific feedback for the agent to address
${buildFallbackOption(workflowId, p, engine)}
Judgment guidance:
- Did the agent actually modify files? (check git diff stat above)
- Does the summary match the task's Deliverables clause?
- Are declared artifacts present and non-empty?
- When in doubt, advance — downstream reviewer agents provide another quality gate`
}
