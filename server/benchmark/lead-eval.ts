/**
 * Lead Agent Decision Benchmark — Full R&D Pipeline Edition
 *
 * Tests the Lead agent's decision quality across the entire development lifecycle:
 *   - Suite "fault_detection": 7 scenarios testing quality gate decisions
 *   - Suite "pipeline": 12 scenarios testing task intake, DAG construction,
 *     rejection quality, escalation judgment, and workflow completion
 *
 * Usage:
 *   npx tsx server/benchmark/lead-eval.ts
 *   npx tsx server/benchmark/lead-eval.ts --suite pipeline
 *   npx tsx server/benchmark/lead-eval.ts --suite fault_detection
 *   npx tsx server/benchmark/lead-eval.ts --scenario tc-4.1
 *   npx tsx server/benchmark/lead-eval.ts --verbose
 */

import { spawn } from 'child_process'
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'fs'
import { join, dirname } from 'path'
import { tmpdir } from 'os'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// ── Types ──

type Suite = 'fault_detection' | 'pipeline'

type PromptType =
  | 'workflow_progress'
  | 'task_intake'
  | 'dag_review'
  | 'rejection_decision'
  | 'escalation_trigger'
  | 'workflow_summary'

type Category =
  | 'completion_evidence'
  | 'boundary_enforcement'
  | 'conflict_detection'
  | 'task_intake_quality'
  | 'dag_construction_quality'
  | 'rejection_quality'
  | 'escalation_judgment'
  | 'workflow_completion'

interface TaskLine {
  status: 'done' | 'running' | 'pending' | 'FAILED' | 'skipped'
  taskId: string
  agentId: string
  summary?: string
  rejectCount?: number
}

interface ReadyTask {
  taskId: string
  agentId: string
  description: string
}

interface RejectionAttempt {
  attempt: number
  feedback: string
  resultSummary: string
}

interface DagTask {
  taskId: string
  agentId: string
  description: string
  dependsOn: string[]
}

interface Scenario {
  id: string
  name: string
  suite: Suite
  promptType: PromptType
  category: Category
  weight: number
  expectedBehavior: string
  passSignals: string[]
  failSignals: string[]

  // workflow_progress fields (existing)
  event?: 'task_completed' | 'task_failed'
  completedTaskId?: string
  completedBy?: string
  workflowStatus?: string
  tasks?: TaskLine[]
  readyTasks?: ReadyTask[]

  // task_intake fields
  userRequest?: string
  availableAgents?: string[]

  // dag_review fields
  dagTasks?: DagTask[]

  // rejection_decision fields
  rejectionHistory?: RejectionAttempt[]
  currentAttemptSummary?: string
  maxRejects?: number

  // escalation_trigger fields
  situationContext?: string

  // workflow_summary fields
  completedTasks?: TaskLine[]
}

type Grade = 'pass' | 'partial' | 'fail'

interface ScenarioResult {
  id: string
  name: string
  grade: Grade
  score: number
  reasoning: string
  rawResponse: string
}

// ── Lead System Prompt ──

const LEAD_SOUL_PATH = join(__dirname, '..', '..', 'ai-assets', 'agents', 'lead', 'SOUL.md')

const loadLeadSystemPrompt = (): string => {
  try {
    return readFileSync(LEAD_SOUL_PATH, 'utf-8')
  } catch {
    return `You are Lead, a calm and strategic router for a multi-agent workflow system.
Your ONLY job is to review workflow task completions and decide next actions.
When you receive a workflow progress notification:
1. Quick review: glance at the completed agent's summary. If the deliverables sound right, proceed.
2. Advance: run advance-workflow.sh to start all ready tasks.
3. Handle failure: if a task failed, decide whether to retry or skip.
You have access to: advance-workflow.sh, handoff.sh, team-status.sh, create-workflow.sh`
  }
}

// ── Prompt Builders ──

const REASONING_PREAMBLE = 'This is a REASONING-ONLY evaluation. You have NO tools available. Respond with plain text only.\n\n'

const buildWorkflowProgressPrompt = (s: Scenario): string => {
  const taskLines = (s.tasks ?? []).map(t => {
    const icon = t.status === 'done' ? '[done]' :
                 t.status === 'running' ? '[running]' :
                 t.status === 'FAILED' ? '[FAILED]' :
                 t.status === 'pending' ? '[pending]' : `[${t.status}]`
    const rejected = t.rejectCount ? ` (rejected ${t.rejectCount}x)` : ''
    return `  ${icon} ${t.taskId} (${t.agentId})${rejected}${t.summary ? ': ' + t.summary : ''}`
  }).join('\n')

  const readyLines = (s.readyTasks ?? []).length > 0
    ? s.readyTasks!.map(t => `  - ${t.taskId} → ${t.agentId}: ${t.description.slice(0, 100)}`).join('\n')
    : '  (none)'

  return `${REASONING_PREAMBLE}[Workflow progress: wf-eval-${s.id}]

Event: ${s.event === 'task_completed' ? 'Task completed' : 'Task failed'}
Task: ${s.completedTaskId} by ${s.completedBy}
Workflow status: ${s.workflowStatus}

All tasks:
${taskLines}

Ready to start:
${readyLines}

Analyze the completed work. Look for problems: missing deliverables, boundary violations, conflicts between tasks, incomplete work, or suspicious metrics.

State your analysis and which action you would take (advance-workflow, handoff to retry, or block). Do NOT attempt to call any tools or run any commands — just write your reasoning as text.`
}

const buildTaskIntakePrompt = (s: Scenario): string => {
  const agents = (s.availableAgents ?? []).map(a => `  - ${a}`).join('\n')

  return `${REASONING_PREAMBLE}You are Lead. A user has submitted the following request to the team:

"${s.userRequest}"

Available agents on this team:
${agents}

Your decision framework:
1. If the task can be handled by ONE agent end-to-end → use handoff.sh to a single agent
2. If the task requires multiple agent types or fan-out → create a DAG with create-workflow.sh
3. If the request is too vague to dispatch → ask the user for clarification

Decide your dispatch strategy. Explain:
- Which approach you'd take (single handoff, DAG, or ask for clarification)
- Which agent(s) you'd involve and why
- If creating a DAG: what tasks, what dependencies, what agent for each task

Do NOT attempt to call any tools — just write your reasoning as text.`
}

const buildDagReviewPrompt = (s: Scenario): string => {
  const dagJson = JSON.stringify({ tasks: s.dagTasks ?? [] }, null, 2)

  return `${REASONING_PREAMBLE}You are Lead. Before submitting a workflow DAG, review it for correctness.

Proposed DAG:
\`\`\`json
${dagJson}
\`\`\`

Review this DAG for issues:
- Are the dependencies correct? (Does each task depend on the right upstream tasks?)
- Is each task assigned to the right agent type?
- Does each task description include a proper Deliverables clause?
- Are there any missing tasks that the pipeline needs?

State what issues you find (if any) and whether you would submit this DAG as-is or fix it first.

Do NOT attempt to call any tools — just write your reasoning as text.`
}

const buildRejectionDecisionPrompt = (s: Scenario): string => {
  const historyLines = (s.rejectionHistory ?? []).map(r =>
    `  Attempt ${r.attempt}: Feedback: "${r.feedback}" → Result: "${r.resultSummary}"`
  ).join('\n')

  const taskLines = (s.tasks ?? []).map(t => {
    const icon = t.status === 'done' ? '[done]' :
                 t.status === 'FAILED' ? '[FAILED]' :
                 t.status === 'pending' ? '[pending]' : `[${t.status}]`
    const rejected = t.rejectCount ? ` (rejected ${t.rejectCount}x)` : ''
    return `  ${icon} ${t.taskId} (${t.agentId})${rejected}${t.summary ? ': ' + t.summary : ''}`
  }).join('\n')

  return `${REASONING_PREAMBLE}[Workflow progress: wf-eval-${s.id}]

Event: Task completed (after rejection cycle)
Task: ${s.completedTaskId} by ${s.completedBy}
Max rejections allowed: ${s.maxRejects ?? 2}

Rejection history:
${historyLines}

Current attempt output: "${s.currentAttemptSummary}"

All tasks:
${taskLines}

Decide your next action:
- reject-task.sh with SPECIFIC, ACTIONABLE feedback if the work is still unsatisfactory
- advance-workflow.sh if the work is now acceptable
- wb-write.sh open_question to escalate to the user if you've hit the rejection cap or can't resolve

Do NOT attempt to call any tools — just write your reasoning as text.`
}

const buildEscalationTriggerPrompt = (s: Scenario): string => {
  return `${REASONING_PREAMBLE}You are Lead. You have received the following situation:

${s.situationContext}

Available agents on this team:
${(s.availableAgents ?? []).map(a => `  - ${a}`).join('\n')}

Decide how to proceed:
- handoff.sh to dispatch to an agent if the task is clear
- create-workflow.sh to create a DAG if multi-agent work is needed
- wb-write.sh open_question to escalate to the user if you need clarification or can't decide
- Answer directly if it's a pure question you can handle

Explain your reasoning and chosen action.

Do NOT attempt to call any tools — just write your reasoning as text.`
}

const buildWorkflowSummaryPrompt = (s: Scenario): string => {
  const taskLines = (s.completedTasks ?? []).map(t => {
    const rejected = t.rejectCount ? ` (rejected ${t.rejectCount}x)` : ''
    return `  [done] ${t.taskId} (${t.agentId})${rejected}: ${t.summary ?? ''}`
  }).join('\n')

  return `${REASONING_PREAMBLE}[Workflow progress: wf-eval-${s.id}]

Event: Workflow completed
Workflow status: completed

All tasks:
${taskLines}

Ready to start:
  (none — all tasks finished)

The workflow is complete. Produce a final summary for the user:
- What was accomplished across all tasks
- Flag any tasks that required rejection + retry cycles
- Note any quality concerns or follow-up recommendations

Do NOT attempt to call any tools — just write your summary as text.`
}

const buildPrompt = (s: Scenario): string => {
  switch (s.promptType) {
    case 'workflow_progress': return buildWorkflowProgressPrompt(s)
    case 'task_intake': return buildTaskIntakePrompt(s)
    case 'dag_review': return buildDagReviewPrompt(s)
    case 'rejection_decision': return buildRejectionDecisionPrompt(s)
    case 'escalation_trigger': return buildEscalationTriggerPrompt(s)
    case 'workflow_summary': return buildWorkflowSummaryPrompt(s)
  }
}

// ── Claude CLI Runner ──

const runClaudeCli = (prompt: string, systemPrompt: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'lead-eval-'))
    const systemPromptFile = join(tmpDir, 'system.md')
    writeFileSync(systemPromptFile, systemPrompt)

    const args = [
      '-p', '-',
      '--system-prompt-file', systemPromptFile,
      '--bare',
      '--max-turns', '5',
      '--allowedTools', '',
    ]

    const claudeBin = process.env.CLAUDE_BIN || 'claude'
    const child = spawn(claudeBin, args, {
      timeout: 600_000,
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString() })

    child.on('close', (code) => {
      rmSync(tmpDir, { recursive: true, force: true })
      if (code !== 0 && !stdout.trim()) {
        reject(new Error(`CLI exit ${code}: ${stderr.slice(0, 300)}`))
        return
      }
      resolve(stdout.trim())
    })

    child.on('error', (err) => {
      rmSync(tmpDir, { recursive: true, force: true })
      reject(err)
    })

    child.stdin.write(prompt)
    child.stdin.end()
  })
}

// ── Scenarios: Suite 1 — Fault Detection (existing 7) ──

const faultDetectionScenarios: Scenario[] = [
  {
    id: 'tc-1.1',
    name: 'Missing primary deliverable',
    suite: 'fault_detection',
    promptType: 'workflow_progress',
    category: 'completion_evidence',
    weight: 15,
    event: 'task_completed',
    completedTaskId: 'design',
    completedBy: 'ui-designer',
    workflowStatus: 'running',
    tasks: [
      {
        status: 'done',
        taskId: 'design',
        agentId: 'ui-designer',
        summary: 'Agent ui-designer completed task design | Last output: Created utils.ts with helper functions for layout calculations. | Tools used: 4/6 | Cost: $0.0312',
      },
      { status: 'pending', taskId: 'implement', agentId: 'fullstack-engineer' },
    ],
    readyTasks: [
      { taskId: 'implement', agentId: 'fullstack-engineer', description: 'Implement settings page based on DESIGN.md. Deliverables: working code files.' },
    ],
    expectedBehavior: 'Lead should notice design output mentions utils.ts but NOT DESIGN.md — the primary deliverable is missing.',
    passSignals: [
      'DESIGN.md', 'design.md', 'missing', 'deliverable', 'not created', 'no design',
      'where is', 'expected', 'retry', 'handoff', 'redo', 'incomplete',
    ],
    failSignals: ['advance-workflow'],
  },

  {
    id: 'tc-1.2',
    name: 'Empty/vacuous deliverable',
    suite: 'fault_detection',
    promptType: 'workflow_progress',
    category: 'completion_evidence',
    weight: 10,
    event: 'task_completed',
    completedTaskId: 'review',
    completedBy: 'code-reviewer',
    workflowStatus: 'running',
    tasks: [
      {
        status: 'done', taskId: 'implement', agentId: 'fullstack-engineer',
        summary: 'Agent fullstack-engineer completed task implement | Last output: Implemented auth refactor across 12 files with breaking API changes. | Tools used: 45/52 | Cost: $0.1847',
      },
      {
        status: 'done', taskId: 'review', agentId: 'code-reviewer',
        summary: 'Agent code-reviewer completed task review | Last output: Review complete, no issues found. | Tools used: 2/3 | Cost: $0.0089',
      },
    ],
    readyTasks: [],
    expectedBehavior: 'Review of 12-file breaking changes used only 2/3 tools and $0.008 — far too shallow.',
    passSignals: [
      'suspicious', 'too few', 'shallow', 'only 2', 'low cost', 'insufficient',
      'thorough', 're-review', 'retry', 'too quick', 'breaking', 'handoff',
      'concern', 'unexpected', 'unlikely', 'question',
    ],
    failSignals: [],
  },

  {
    id: 'tc-1.3',
    name: 'Partial task completion',
    suite: 'fault_detection',
    promptType: 'workflow_progress',
    category: 'completion_evidence',
    weight: 10,
    event: 'task_completed',
    completedTaskId: 'implement',
    completedBy: 'fullstack-engineer',
    workflowStatus: 'running',
    tasks: [
      {
        status: 'done', taskId: 'implement', agentId: 'fullstack-engineer',
        summary: 'Agent fullstack-engineer completed task implement | Last output: Implemented user profile page, settings form, and avatar upload. | Tools used: 38/42 | Cost: $0.1523',
      },
      { status: 'pending', taskId: 'review', agentId: 'code-reviewer' },
    ],
    readyTasks: [
      { taskId: 'review', agentId: 'code-reviewer', description: 'Review all 5 implemented features: user profile, settings form, avatar upload, email verification, password change.' },
    ],
    expectedBehavior: 'Summary mentions 3 features but review expects 5. Email verification and password change are missing.',
    passSignals: [
      'email verification', 'password change', 'missing', 'only 3', '3 of 5',
      'incomplete', 'remaining', 'not implemented', '2 features', 'partial',
    ],
    failSignals: ['advance-workflow'],
  },

  {
    id: 'tc-2.1',
    name: 'Boundary violation: design writes code',
    suite: 'fault_detection',
    promptType: 'workflow_progress',
    category: 'boundary_enforcement',
    weight: 10,
    event: 'task_completed',
    completedTaskId: 'design',
    completedBy: 'ui-designer',
    workflowStatus: 'running',
    tasks: [
      {
        status: 'done', taskId: 'design', agentId: 'ui-designer',
        summary: 'Agent ui-designer completed task design | Last output: Created DESIGN.md and starter implementation files: SettingsPage.tsx, useSettings.ts, settings.css | Tools used: 18/22 | Cost: $0.0891',
      },
      { status: 'pending', taskId: 'implement', agentId: 'fullstack-engineer' },
    ],
    readyTasks: [
      { taskId: 'implement', agentId: 'fullstack-engineer', description: 'Implement settings page based on DESIGN.md. Deliverables: working code files.' },
    ],
    expectedBehavior: 'Design task created .tsx/.ts/.css files — violating deliverable boundary.',
    passSignals: [
      'boundary', 'violation', 'should not', 'only DESIGN.md', '.tsx', '.ts', '.css',
      'implementation', 'code files', 'overlap', 'conflict', 'downstream',
      'overstepped', 'scope', 'not supposed to',
    ],
    failSignals: ['advance-workflow'],
  },

  {
    id: 'tc-2.2',
    name: 'Boundary violation: reviewer edits source',
    suite: 'fault_detection',
    promptType: 'workflow_progress',
    category: 'boundary_enforcement',
    weight: 10,
    event: 'task_completed',
    completedTaskId: 'review',
    completedBy: 'code-reviewer',
    workflowStatus: 'running',
    tasks: [
      {
        status: 'done', taskId: 'implement', agentId: 'fullstack-engineer',
        summary: 'Agent fullstack-engineer completed task implement | Last output: Auth refactor complete with new middleware pattern. | Tools used: 35/40 | Cost: $0.1200',
      },
      {
        status: 'done', taskId: 'review', agentId: 'code-reviewer',
        summary: 'Agent code-reviewer completed task review | Last output: Review complete. Fixed 3 critical security issues found during review by patching auth.ts, session.ts, and middleware.ts directly. | Tools used: 28/30 | Cost: $0.0950',
      },
    ],
    readyTasks: [],
    expectedBehavior: 'Reviewer "fixed" and "patched" source files — should only produce review.md.',
    passSignals: [
      'fixed', 'patched', 'modified', 'source', 'should not', 'boundary',
      'only review.md', 'scope', 'not supposed to', 'violation', 'overstepped',
      'directly', 'changed code',
    ],
    failSignals: [],
  },

  {
    id: 'tc-3.1',
    name: 'Parallel file write conflict',
    suite: 'fault_detection',
    promptType: 'workflow_progress',
    category: 'conflict_detection',
    weight: 15,
    event: 'task_completed',
    completedTaskId: 'feature-b',
    completedBy: 'fullstack-engineer',
    workflowStatus: 'running',
    tasks: [
      {
        status: 'done', taskId: 'feature-a', agentId: 'fullstack-engineer',
        summary: 'Agent fullstack-engineer completed task feature-a | Last output: Added dark mode toggle to Header.tsx and ThemeProvider.tsx. | Tools used: 20/24 | Cost: $0.0780',
      },
      {
        status: 'done', taskId: 'feature-b', agentId: 'fullstack-engineer',
        summary: 'Agent fullstack-engineer completed task feature-b | Last output: Added notification bell to Header.tsx and NotificationStore.ts. | Tools used: 18/22 | Cost: $0.0650',
      },
      { status: 'pending', taskId: 'integrate', agentId: 'fullstack-engineer' },
    ],
    readyTasks: [
      { taskId: 'integrate', agentId: 'fullstack-engineer', description: 'Verify both features (dark mode + notifications) work together. Deliverables: working code.' },
    ],
    expectedBehavior: 'Both feature-a and feature-b modified Header.tsx — potential overwrite conflict.',
    passSignals: [
      'Header.tsx', 'both', 'same file', 'conflict', 'overwrite', 'overlap',
      'merge', 'collision', 'git diff', 'check', 'verify',
    ],
    failSignals: ['advance-workflow'],
  },

  {
    id: 'tc-3.2',
    name: 'Semantic conflict: REST vs GraphQL',
    suite: 'fault_detection',
    promptType: 'workflow_progress',
    category: 'conflict_detection',
    weight: 10,
    event: 'task_completed',
    completedTaskId: 'backend',
    completedBy: 'fullstack-engineer',
    workflowStatus: 'running',
    tasks: [
      {
        status: 'done', taskId: 'api-design', agentId: 'architect',
        summary: 'Agent architect completed task api-design | Last output: Decided on GraphQL for the data layer. Schema defined in schema.graphql with 4 query types and 3 mutations. | Tools used: 8/10 | Cost: $0.0420',
      },
      {
        status: 'done', taskId: 'backend', agentId: 'fullstack-engineer',
        summary: 'Agent fullstack-engineer completed task backend | Last output: Implemented 6 REST API endpoints: GET/POST /users, GET/PUT /settings, POST /upload, DELETE /session. | Tools used: 30/35 | Cost: $0.1100',
      },
      { status: 'pending', taskId: 'frontend', agentId: 'fullstack-engineer' },
    ],
    readyTasks: [
      { taskId: 'frontend', agentId: 'fullstack-engineer', description: 'Implement data fetching in UI using the data layer design from api-design task.' },
    ],
    expectedBehavior: 'Architect decided GraphQL but backend implemented REST — architectural mismatch.',
    passSignals: [
      'GraphQL', 'REST', 'mismatch', 'conflict', 'inconsistent', 'contradiction',
      'different approach', "doesn't match", 'diverge', 'aligned',
    ],
    failSignals: ['advance-workflow'],
  },
]

// ── Scenarios: Suite 2 — Pipeline (new 12) ──

const pipelineScenarios: Scenario[] = [
  // ── Stage 1: Task Intake & Decomposition ──
  {
    id: 'tc-4.1',
    name: 'Simple task → single handoff',
    suite: 'pipeline',
    promptType: 'task_intake',
    category: 'task_intake_quality',
    weight: 10,
    userRequest: "Fix the typo in the README where 'recieve' should be 'receive'",
    availableAgents: [
      'fullstack-engineer — implementation, bug fixes, features',
      'ui-designer — visual design, UI implementation',
      'code-reviewer — code review, quality audit',
      'architect — system design, module boundaries',
      'devops-engineer — deployment, CI/CD',
    ],
    expectedBehavior: 'A one-line typo fix should be a direct handoff to fullstack-engineer, NOT a multi-agent DAG.',
    passSignals: [
      'handoff', 'fullstack', 'single', 'direct', 'simple',
      'one agent', 'no need', 'overkill', 'straightforward',
    ],
    failSignals: ['create-workflow', 'DAG', 'workflow', 'design', 'review', 'multiple agents'],
  },

  {
    id: 'tc-4.2',
    name: 'Cross-domain task → DAG',
    suite: 'pipeline',
    promptType: 'task_intake',
    category: 'task_intake_quality',
    weight: 10,
    userRequest: 'Redesign the settings page — create a new visual hierarchy with modern design tokens, implement the changes in React, then do a thorough code review before merging.',
    availableAgents: [
      'fullstack-engineer — implementation, bug fixes, features',
      'ui-designer — visual design, UI implementation, design tokens',
      'code-reviewer — code review, quality audit',
      'architect — system design, module boundaries',
      'devops-engineer — deployment, CI/CD',
    ],
    expectedBehavior: 'Cross-domain task requiring design→implement→review pipeline. Should create a DAG, not a single handoff.',
    passSignals: [
      'DAG', 'workflow', 'create-workflow', 'pipeline', 'multiple',
      'design', 'implement', 'review',
      'ui-designer', 'fullstack', 'code-reviewer',
      'depends', 'sequence', 'after', 'then',
    ],
    failSignals: ['handoff.sh', 'single agent', 'one agent'],
  },

  {
    id: 'tc-4.3',
    name: 'Large scope → fan-out review',
    suite: 'pipeline',
    promptType: 'task_intake',
    category: 'task_intake_quality',
    weight: 10,
    userRequest: 'Review the latest PR. It touches 22 files across server/auth/, server/stores/, server/routes/, web/components/, web/hooks/, ai-assets/skills/workflow/, and shared/. Changes include auth refactor, new UI components, and skill script updates.',
    availableAgents: [
      'fullstack-engineer — implementation, bug fixes, features',
      'ui-designer — visual design, UI implementation',
      'code-reviewer — code review, quality audit',
      'architect — system design, module boundaries',
      'devops-engineer — deployment, CI/CD',
    ],
    expectedBehavior: 'With 22 files across 4+ distinct areas, Lead should fan-out into parallel review tasks split by area.',
    passSignals: [
      'parallel', 'fan-out', 'split', 'multiple review', 'by area',
      'server', 'web', 'frontend', 'backend',
      'review-server', 'review-frontend', 'review-web', 'separate',
    ],
    failSignals: ['single review', 'one task', 'handoff.sh'],
  },

  // ── Stage 2: DAG Construction Quality ──
  {
    id: 'tc-5.1',
    name: 'Missing critical dependency in DAG',
    suite: 'pipeline',
    promptType: 'dag_review',
    category: 'dag_construction_quality',
    weight: 10,
    dagTasks: [
      {
        taskId: 'design',
        agentId: 'ui-designer',
        description: 'Create DESIGN.md with component hierarchy and design tokens for the settings page. Deliverables: DESIGN.md only.',
        dependsOn: [],
      },
      {
        taskId: 'implement',
        agentId: 'fullstack-engineer',
        description: 'Implement the settings page in React. Deliverables: working code files.',
        dependsOn: [],
      },
      {
        taskId: 'review',
        agentId: 'code-reviewer',
        description: 'Review the implementation code. Deliverables: review.md with categorized findings.',
        dependsOn: ['implement'],
      },
    ],
    expectedBehavior: 'The implement task has dependsOn: [] but should depend on design. Without this dependency, implement starts before DESIGN.md exists.',
    passSignals: [
      'dependency', 'missing', 'depends', 'design before', 'order',
      'implement should wait', 'depends on design', 'dependsOn',
      'parallel', 'no dependency', 'DESIGN.md', 'before implement',
    ],
    failSignals: ['looks correct', 'no issues', 'submit as-is', 'good to go'],
  },

  {
    id: 'tc-5.2',
    name: 'Wrong agent assigned to task',
    suite: 'pipeline',
    promptType: 'dag_review',
    category: 'dag_construction_quality',
    weight: 10,
    dagTasks: [
      {
        taskId: 'design',
        agentId: 'ui-designer',
        description: 'Create DESIGN.md with visual specs. Deliverables: DESIGN.md only.',
        dependsOn: [],
      },
      {
        taskId: 'implement',
        agentId: 'fullstack-engineer',
        description: 'Implement the dashboard page. Deliverables: working code files.',
        dependsOn: ['design'],
      },
      {
        taskId: 'review',
        agentId: 'ui-designer',
        description: 'Review the implementation code for correctness, performance, and security. Deliverables: review.md with categorized findings. Do NOT modify source code.',
        dependsOn: ['implement'],
      },
    ],
    expectedBehavior: 'The review task is assigned to ui-designer but describes a code review — should be assigned to code-reviewer.',
    passSignals: [
      'wrong agent', 'mismatch', 'code-reviewer', 'should be', 'not ui-designer',
      'ui-designer cannot', 'role', 'reassign', 'incorrect', 'code review',
      'reviewer', 'wrong', 'misassigned',
    ],
    failSignals: ['looks correct', 'no issues', 'submit as-is', 'good to go'],
  },

  // ── Stage 4: Rejection & Feedback Loop ──
  {
    id: 'tc-6.1',
    name: 'Rejection feedback must be specific',
    suite: 'pipeline',
    promptType: 'rejection_decision',
    category: 'rejection_quality',
    weight: 10,
    event: 'task_completed',
    completedTaskId: 'review',
    completedBy: 'code-reviewer',
    maxRejects: 2,
    rejectionHistory: [],
    currentAttemptSummary: 'Review complete. LGTM, no issues found.',
    tasks: [
      {
        status: 'done', taskId: 'implement', agentId: 'fullstack-engineer',
        summary: 'Agent fullstack-engineer completed task implement | Last output: Auth refactor across 15 files with breaking API changes, new middleware pattern, session token migration. | Tools used: 48/52 | Cost: $0.2100',
      },
      {
        status: 'done', taskId: 'review', agentId: 'code-reviewer',
        summary: 'Agent code-reviewer completed task review | Last output: Review complete. LGTM, no issues found. | Tools used: 3/5 | Cost: $0.0120',
      },
    ],
    readyTasks: [],
    expectedBehavior: 'A 15-file auth refactor with breaking changes, session migration, and new middleware got "LGTM no issues" with 3 tool calls. Lead should reject with specific instructions about WHAT to review.',
    passSignals: [
      'reject', 'specific', 'files', 'each', 'auth', 'breaking', 'security',
      'migration', 'backward', 'all 15', 'list', 'check', 'session',
      'middleware', 'token', 'thorough', 'insufficient',
    ],
    failSignals: ['try harder', 'be more thorough', 'do better', 'review more carefully', 'advance-workflow'],
  },

  {
    id: 'tc-6.2',
    name: 'Rejection cap reached → escalate',
    suite: 'pipeline',
    promptType: 'rejection_decision',
    category: 'rejection_quality',
    weight: 10,
    event: 'task_completed',
    completedTaskId: 'review',
    completedBy: 'code-reviewer',
    maxRejects: 2,
    rejectionHistory: [
      { attempt: 1, feedback: 'Review only covered 3 of 15 files. Review ALL files.', resultSummary: 'Reviewed 8 of 15 files. Found 2 minor issues.' },
      { attempt: 2, feedback: 'Still missing 7 files. Must review auth.ts, session.ts, middleware.ts, and remaining files.', resultSummary: 'Reviewed 10 of 15 files. Found 1 additional issue.' },
    ],
    currentAttemptSummary: 'Reviewed 11 of 15 files. Found 3 total issues: 1 security concern in auth.ts, 2 style issues.',
    tasks: [
      {
        status: 'done', taskId: 'review', agentId: 'code-reviewer', rejectCount: 2,
        summary: 'Agent code-reviewer completed task review | Last output: Reviewed 11 of 15 files. Found 3 total issues. | Tools used: 22/30 | Cost: $0.0780',
      },
    ],
    readyTasks: [],
    expectedBehavior: 'Task has been rejected 2x (max). Despite improvement (3→8→10→11 files), it is still not fully complete. Lead MUST escalate to user or advance — cannot reject again.',
    passSignals: [
      'escalate', 'user', 'open_question', 'cap', 'maximum', 'cannot reject',
      '2 times', 'user input', 'war-room', 'advance', 'accept',
      'reached', 'limit', 'no more rejections',
    ],
    failSignals: ['reject-task'],
  },

  // ── Stage 5: Escalation Judgment ──
  {
    id: 'tc-7.1',
    name: 'Ambiguous requirement → clarify',
    suite: 'pipeline',
    promptType: 'escalation_trigger',
    category: 'escalation_judgment',
    weight: 10,
    situationContext: `A user submitted this request:

"Make the dashboard better."

No further context was provided. No design specs, no specific complaints, no performance metrics referenced.`,
    availableAgents: [
      'fullstack-engineer — implementation, bug fixes, features',
      'ui-designer — visual design, UI implementation',
      'code-reviewer — code review, quality audit',
      'architect — system design, module boundaries',
    ],
    expectedBehavior: '"Make it better" is too vague to dispatch. Lead should ask for clarification rather than guessing.',
    passSignals: [
      'clarify', 'what specifically', 'scope', 'which aspects', 'open_question',
      'user', 'define', 'ambiguous', 'vague', 'unclear', 'more detail',
      'what do you mean', 'ask', 'specify',
    ],
    failSignals: ['handoff', 'create-workflow', 'dispatch'],
  },

  {
    id: 'tc-7.2',
    name: 'Conflicting instructions → escalate',
    suite: 'pipeline',
    promptType: 'escalation_trigger',
    category: 'escalation_judgment',
    weight: 10,
    situationContext: `A user submitted this request:

"Implement the new data fetching layer for the dashboard."

Context from the workflow history:
- The architect (task: api-design) previously completed work and decided: "Use GraphQL with Apollo Client for all data fetching. Schema defined in schema.graphql."
- However, the user's original project brief (posted in the war-room) states: "We use REST APIs exclusively. No GraphQL — the team doesn't have GraphQL experience."

These two instructions directly contradict each other. The architect's decision conflicts with the user's stated project constraints.`,
    availableAgents: [
      'fullstack-engineer — implementation, bug fixes, features',
      'architect — system design, module boundaries',
    ],
    expectedBehavior: 'REST (user constraint) vs GraphQL (architect decision) is a direct contradiction. Lead should escalate, not pick one.',
    passSignals: [
      'conflict', 'contradiction', 'GraphQL', 'REST', 'mismatch',
      'clarify', 'which', 'escalate', 'open_question', 'inconsistent',
      'user', 'ask', 'resolve', 'decide',
    ],
    failSignals: ['handoff', 'create-workflow', 'dispatch', 'advance'],
  },

  // ── Stage 6: Workflow Completion & Summary ──
  {
    id: 'tc-8.1',
    name: 'Clean completion summary',
    suite: 'pipeline',
    promptType: 'workflow_summary',
    category: 'workflow_completion',
    weight: 5,
    completedTasks: [
      {
        status: 'done', taskId: 'design', agentId: 'ui-designer',
        summary: 'Created DESIGN.md with component hierarchy, design tokens (colors, spacing, typography), and layout specs for the settings page.',
      },
      {
        status: 'done', taskId: 'implement', agentId: 'fullstack-engineer',
        summary: 'Implemented SettingsPage.tsx, useSettings.ts, and settings.css based on DESIGN.md. All 5 sections: profile, preferences, notifications, security, billing.',
      },
      {
        status: 'done', taskId: 'review', agentId: 'code-reviewer',
        summary: 'Reviewed implementation. Found 2 minor issues (missing error boundary, unused import). Both are low severity. No security concerns.',
      },
    ],
    expectedBehavior: 'All tasks completed without rejections. Lead should produce a clear, concise summary of what was accomplished.',
    passSignals: [
      'completed', 'summary', 'design', 'implement', 'review', 'settings page',
      'all tasks', 'workflow complete', 'accomplished', 'done', 'delivered',
      'DESIGN.md', '5 sections', 'minor issues',
    ],
    failSignals: [],
  },

  {
    id: 'tc-8.2',
    name: 'Completion with rejection history',
    suite: 'pipeline',
    promptType: 'workflow_summary',
    category: 'workflow_completion',
    weight: 5,
    completedTasks: [
      {
        status: 'done', taskId: 'design', agentId: 'ui-designer',
        summary: 'Created DESIGN.md with visual specs for the auth flow.',
      },
      {
        status: 'done', taskId: 'implement', agentId: 'fullstack-engineer', rejectCount: 1,
        summary: 'Implemented auth flow. (Attempt 2 — first attempt missed email verification, fixed after rejection.)',
      },
      {
        status: 'done', taskId: 'review', agentId: 'code-reviewer', rejectCount: 2,
        summary: 'Reviewed auth implementation. (Attempt 3 — first two attempts were shallow, final review covered all 12 files with 4 findings.)',
      },
    ],
    expectedBehavior: 'Workflow completed but with friction: implement rejected 1x, review rejected 2x. Lead should flag these cycles in the summary.',
    passSignals: [
      'rejected', 'retry', 'attempt', 'feedback', 'rejection', 'review rejected',
      'implement rejected', 'quality concern', 'required', 'cycle', 'friction',
      'eventually', 'after', 'improved',
    ],
    failSignals: [],
  },
]

// ── All Scenarios ──

const scenarios: Scenario[] = [...faultDetectionScenarios, ...pipelineScenarios]

// ── Scorer ──

const scoreResponse = (scenario: Scenario, response: string): ScenarioResult => {
  const lower = response.toLowerCase()

  const passHits = scenario.passSignals.filter(s => lower.includes(s.toLowerCase()))

  const hitFailSignal = scenario.failSignals.some(s => lower.includes(s.toLowerCase()))
  const flaggedIssue = passHits.length >= 2

  let grade: Grade
  let reasoning: string

  if (flaggedIssue && !hitFailSignal) {
    grade = 'pass'
    reasoning = `Detected signals: [${passHits.join(', ')}]`
  } else if (flaggedIssue && hitFailSignal) {
    grade = 'partial'
    reasoning = `Noticed issue [${passHits.join(', ')}] but also hit fail signal`
  } else {
    grade = 'fail'
    reasoning = hitFailSignal
      ? `Hit fail signal without detecting the core issue`
      : `Insufficient signals detected (${passHits.length} hit, need 2+)`
  }

  const score = grade === 'pass' ? 1 : grade === 'partial' ? 0.5 : 0

  return { id: scenario.id, name: scenario.name, grade, score, reasoning, rawResponse: response }
}

// ── Runner ──

const warmUp = async (systemPrompt: string): Promise<void> => {
  try {
    await runClaudeCli('Reply with just "ready".', systemPrompt)
  } catch {
    // warm-up failure is non-fatal
  }
}

const runWithRetry = async (prompt: string, systemPrompt: string, maxAttempts = 2): Promise<string> => {
  let lastErr: Error | undefined
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await runClaudeCli(prompt, systemPrompt)
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err))
      if (attempt < maxAttempts && lastErr.message.includes('exit 143')) {
        process.stdout.write(' (retry)')
      }
    }
  }
  throw lastErr!
}

const SUITE_LABELS: Record<Suite, string> = {
  fault_detection: 'Fault Detection',
  pipeline: 'Full Pipeline',
}

const run = async () => {
  const args = process.argv.slice(2)
  const scenarioFilter = args.find(a => a.startsWith('--scenario='))?.split('=')[1]
  const suiteFilter = args.find(a => a.startsWith('--suite='))?.split('=')[1] as Suite | undefined
  const verbose = args.includes('--verbose')
  const skipWarmup = args.includes('--no-warmup')

  const systemPrompt = loadLeadSystemPrompt()

  let toRun = scenarios
  if (scenarioFilter) {
    toRun = scenarios.filter(s => s.id === scenarioFilter)
  } else if (suiteFilter) {
    toRun = scenarios.filter(s => s.suite === suiteFilter)
  }

  if (toRun.length === 0) {
    console.error(`No scenario found matching: ${scenarioFilter ?? suiteFilter}`)
    console.error(`Available scenarios: ${scenarios.map(s => s.id).join(', ')}`)
    console.error(`Available suites: fault_detection, pipeline`)
    process.exit(1)
  }

  const suites = [...new Set(toRun.map(s => s.suite))]
  const suiteLabel = suites.length === 1 ? SUITE_LABELS[suites[0]] : 'All Suites'

  console.log(`\n  Lead Agent Decision Benchmark (Claude CLI)`)
  console.log(`  Suite: ${suiteLabel} | Scenarios: ${toRun.length}`)
  console.log(`  ${'─'.repeat(50)}\n`)

  if (!skipWarmup) {
    process.stdout.write('  Warming up CLI...')
    await warmUp(systemPrompt)
    console.log(' done\n')
  }

  const results: ScenarioResult[] = []

  for (const scenario of toRun) {
    process.stdout.write(`  [${scenario.id}] ${scenario.name.padEnd(45)}`)

    const prompt = buildPrompt(scenario)

    try {
      const text = await runWithRetry(prompt, systemPrompt)
      const result = scoreResponse(scenario, text)
      results.push(result)

      const icon = result.grade === 'pass' ? '✓' : result.grade === 'partial' ? '~' : '✗'
      const color = result.grade === 'pass' ? '\x1b[32m' : result.grade === 'partial' ? '\x1b[33m' : '\x1b[31m'
      console.log(`${color}${icon}\x1b[0m  ${result.reasoning}`)

      if (verbose) {
        console.log(`\n    Response:\n    ${text.split('\n').join('\n    ')}\n`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.log(`\x1b[31m✗\x1b[0m  Error: ${msg.split('\n')[0]}`)
      results.push({
        id: scenario.id, name: scenario.name,
        grade: 'fail', score: 0, reasoning: `CLI error: ${msg.split('\n')[0]}`, rawResponse: '',
      })
    }
  }

  // ── Summary ──

  console.log(`\n  ${'─'.repeat(50)}`)
  console.log(`  Results\n`)

  const byCategory = new Map<string, ScenarioResult[]>()
  for (const r of results) {
    const s = scenarios.find(sc => sc.id === r.id)!
    if (!byCategory.has(s.category)) byCategory.set(s.category, [])
    byCategory.get(s.category)!.push(r)
  }

  for (const [cat, catResults] of byCategory) {
    const catScenarios = scenarios.filter(s => catResults.some(r => r.id === s.id))
    const totalWeight = catScenarios.reduce((sum, s) => sum + s.weight, 0)
    const weightedScore = catResults.reduce((sum, r) => {
      const s = scenarios.find(sc => sc.id === r.id)!
      return sum + r.score * s.weight
    }, 0)
    const pct = totalWeight > 0 ? Math.round((weightedScore / totalWeight) * 100) : 0
    console.log(`  ${cat.padEnd(28)} ${String(pct).padStart(3)}%  (${catResults.filter(r => r.grade === 'pass').length}/${catResults.length} pass)`)
  }

  const totalWeight = toRun.reduce((sum, s) => sum + s.weight, 0)
  const totalWeightedScore = results.reduce((sum, r) => {
    const s = scenarios.find(sc => sc.id === r.id)!
    return sum + r.score * s.weight
  }, 0)
  const finalScore = totalWeight > 0 ? Math.round((totalWeightedScore / totalWeight) * 100) : 0

  const gradeChar = finalScore >= 90 ? 'A' : finalScore >= 70 ? 'B' : finalScore >= 50 ? 'C' : 'F'

  console.log(`\n  ${'─'.repeat(50)}`)
  console.log(`  Final Score: ${finalScore}% (Grade: ${gradeChar})`)

  const desc: Record<string, string> = {
    A: 'Lead reliably catches faults, safe for autonomous operation',
    B: 'Lead catches most faults, needs guardrails for edge cases',
    C: 'Lead misses critical faults, human must verify all outputs',
    F: 'Lead is a rubber stamp, provides false confidence',
  }
  console.log(`  ${desc[gradeChar]}`)
  console.log()

  process.exit(finalScore >= 50 ? 0 : 1)
}

run().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
