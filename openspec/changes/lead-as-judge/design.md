# Design: Lead as Judge

## Architecture

```
Task Agent completes
        │
        ▼
┌──────────────────┐
│WorkflowScheduler │
│ recordAndNotify  │
│  Lead()          │
└────────┬─────────┘
         │ enriched prompt (diff stats, artifact snippets)
         ▼
┌──────────────────┐
│   Lead Agent     │
│  (judge mode)    │
│                  │
│  ┌─ advance ──────────▶ advance-workflow.sh → start next tasks
│  │
│  ├─ reject ───────────▶ reject-task.sh → reset task, prepend feedback
│  │
│  └─ escalate ─────────▶ wb-write.sh open_question → pause for user
└──────────────────┘
```

## 1. Enriched Lead Prompt

### Data Collection (WorkflowScheduler)

When a task completes, before waking Lead, collect:

```typescript
interface EnrichedTaskContext {
  // Already available from TaskResult
  summary: string
  artifacts: Array<{ path: string; type: string; description: string }>
  modifiedFiles: Array<{ path: string; changeType: string; linesAdded: number; linesRemoved: number }>

  // New: collected by scheduler before waking Lead
  gitDiffStat?: string          // output of `git diff --stat` in task agent's worktree
  artifactSnippets?: Array<{    // first N lines of key artifact files
    path: string
    content: string             // truncated to 80 lines
  }>
  testOutput?: string           // truncated test runner output if available
}
```

### Collection Logic

```typescript
// WorkflowScheduler — new private method
private async collectEnrichedContext(
  chatId: string,
  agentId: string,
  result: TaskResult,
): Promise<EnrichedTaskContext> {
  const cwd = this.resolveCwd(chatId)
  const context: EnrichedTaskContext = {
    summary: result.summary,
    artifacts: result.artifacts,
    modifiedFiles: result.modifiedFiles,
  }

  if (cwd) {
    // git diff stat
    try {
      const { stdout } = await execAsync('git diff --stat HEAD~1', { cwd })
      context.gitDiffStat = stdout.slice(0, 2000)
    } catch { /* no git changes is fine */ }

    // artifact snippets — read first 80 lines of declared artifacts
    for (const artifact of result.artifacts.slice(0, 5)) {
      try {
        const fullPath = resolve(cwd, artifact.path)
        const content = await readFile(fullPath, 'utf-8')
        const lines = content.split('\n').slice(0, 80).join('\n')
        context.artifactSnippets ??= []
        context.artifactSnippets.push({ path: artifact.path, content: lines })
      } catch { /* file may not exist */ }
    }
  }

  return context
}
```

### Prompt Template

```typescript
private buildLeadPrompt(workflowId: string, progress: Record<string, unknown>): string {
  // ... existing task status lines ...

  // NEW: enriched context section
  let enrichedSection = ''

  if (context.gitDiffStat) {
    enrichedSection += `\nGit changes:\n\`\`\`\n${context.gitDiffStat}\n\`\`\`\n`
  }

  if (context.modifiedFiles?.length) {
    enrichedSection += `\nModified files:\n`
    for (const f of context.modifiedFiles) {
      enrichedSection += `  ${f.changeType} ${f.path} (+${f.linesAdded} -${f.linesRemoved})\n`
    }
  }

  if (context.artifactSnippets?.length) {
    enrichedSection += `\nArtifact previews:\n`
    for (const s of context.artifactSnippets) {
      enrichedSection += `--- ${s.path} ---\n${s.content}\n---\n\n`
    }
  }

  // ... existing ready tasks section ...

  // NEW: judgment instructions
  const judgmentBlock = `
Review the completed work and choose one action:
1. \`advance-workflow.sh '${workflowId}'\` — deliverables are satisfactory, proceed to next tasks
2. \`reject-task.sh '${workflowId}' '${taskId}' "<feedback>"\` — deliverables are missing or wrong, send back with feedback
3. Write an \`open_question\` to the war-room — you need user input to decide

Judgment guidance:
- Did the agent actually modify files? (check git diff stat)
- Does the summary match the task's Deliverables clause?
- Are declared artifacts present and non-empty?
- If this is a review task, does the review contain substantive findings?
- When in doubt, advance — downstream reviewer agents provide another quality gate`

  return `${statusSection}\n${enrichedSection}\n${judgmentBlock}`
}
```

## 2. Reject Task Mechanism

### Type Changes (shared/workflow-types.ts)

```typescript
export interface WorkflowTaskState {
  // ... existing fields ...
  rejectionFeedback?: string    // latest rejection reason from Lead
  rejectCount: number           // how many times Lead rejected this task
}

export interface WorkflowTask {
  // ... existing fields ...
  maxRejects?: number           // default 2, cap to prevent loops
}
```

### WorkflowEngine.rejectTask()

```typescript
rejectTask(taskId: string, feedback: string): 'rejected' | 'cap_reached' {
  const ts = this.state.tasks[taskId]
  if (!ts || ts.status !== 'completed') return 'cap_reached'

  const task = this.state.dag.tasks.find(t => t.taskId === taskId)
  const maxRejects = task?.maxRejects ?? 2

  if (ts.rejectCount >= maxRejects) {
    return 'cap_reached'
  }

  ts.status = 'pending'
  ts.rejectionFeedback = feedback
  ts.rejectCount += 1
  ts.result = undefined
  ts.completedAt = undefined
  ts.startedAt = undefined
  this.state.updatedAt = new Date().toISOString()

  log.info('Task rejected by Lead', {
    workflowId: this.workflowId,
    taskId,
    rejectCount: ts.rejectCount,
    maxRejects,
  })

  this.persistCheckpoint().catch(() => {})
  this.emit('task-rejected', taskId, feedback)
  return 'rejected'
}
```

### Feedback Injection into Agent Prompt

When `WorkflowScheduler.startTask()` launches a rejected task, prepend the
feedback:

```typescript
private async startTask(engine: WorkflowEngine, taskId: string, ...): Promise<void> {
  const ts = engine.getState().tasks[taskId]
  let prompt = `[Workflow task: ${taskId}]\n\n${description}`

  if (ts?.rejectionFeedback) {
    prompt = `[IMPORTANT — Previous attempt was rejected]\n` +
      `Feedback from reviewer:\n${ts.rejectionFeedback}\n\n` +
      `Address this feedback in your new attempt.\n\n` +
      prompt
  }

  // ... existing handleStart logic ...
}
```

### API Endpoint

```
POST /api/workflow/:workflowId/tasks/:taskId/reject
Content-Type: application/json
Body: { "feedback": "Review is empty — no findings listed. Re-read the diff and provide substantive review." }

Response 200: { "success": true, "rejectCount": 1, "maxRejects": 2 }
Response 400: { "success": false, "error": "reject_cap_reached" }
```

### Shell Script (reject-task.sh)

```bash
#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/_env.sh"

WORKFLOW_ID="${1:?Usage: reject-task.sh '<workflowId>' '<taskId>' '<feedback>'}"
TASK_ID="${2:?Usage: reject-task.sh '<workflowId>' '<taskId>' '<feedback>'}"
FEEDBACK="${3:?Usage: reject-task.sh '<workflowId>' '<taskId>' '<feedback>'}"

RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST "${EXPERT_API_BASE}/api/workflow/${WORKFLOW_ID}/tasks/${TASK_ID}/reject" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg f "$FEEDBACK" '{feedback: $f}')")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -ge 400 ]; then
  ERROR=$(echo "$BODY" | jq -r '.error // "unknown"')
  if [ "$ERROR" = "reject_cap_reached" ]; then
    echo "Rejection cap reached for task ${TASK_ID}. You must either advance or escalate to the user."
  else
    echo "Reject failed: ${ERROR}"
  fi
  exit 1
fi

REJECT_COUNT=$(echo "$BODY" | jq -r '.rejectCount')
MAX_REJECTS=$(echo "$BODY" | jq -r '.maxRejects')
echo "Task ${TASK_ID} rejected (${REJECT_COUNT}/${MAX_REJECTS}). It will restart with your feedback."
```

## 3. Lead SOUL.md Changes

### Current Workflow Progress Section

```
1. Quick review: glance at summary → advance
2. Handle failure: retry or skip
3. Final summary
```

### New Workflow Progress Section

```
When you receive a workflow progress notification:

1. **Review enriched context**: read the git diff stat, modified files list,
   and artifact previews included in the notification.

2. **Judge deliverables** against the task's Deliverables clause:
   - Did files actually change? (empty diff = no work done)
   - Do artifact files exist and have content? (empty review.md = no review)
   - Does the summary accurately reflect the changes?
   - For implementation tasks: were the right files modified?
   - For review tasks: are there substantive findings?

3. **Choose one action**:
   - `advance-workflow.sh` — work is satisfactory, start next tasks
   - `reject-task.sh` — work is unsatisfactory, send specific feedback
     for the agent to address in a retry. Be concrete: "review.md is empty"
     not "try harder"
   - `wb-write.sh open_question` — you can't decide, escalate to user

4. **Rejection cap**: each task can be rejected up to 2 times. After that,
   you must advance or escalate. Don't waste cycles on diminishing returns.

5. **Final summary**: when workflow completes, summarize what was accomplished
   and flag any tasks that required rejection + retry.
```

## Decisions

1. **No server-side rules** — all judgment is LLM-driven via Lead's prompt.
   The server only provides the rejection mechanism and enriched data. This
   keeps the system flexible and avoids a schema for acceptance criteria.

2. **maxRejects defaults to 2** — enough for one "you missed something" and
   one "still not right" before forcing a decision. Higher values risk
   compute waste on tasks the agent fundamentally can't do.

3. **Enriched context is best-effort** — if git diff or file reads fail,
   Lead still gets the basic summary. Degraded information, not a blocked
   workflow.

4. **Rejected task restarts from scratch** — the agent gets a fresh session
   with feedback prepended, not a continuation. This is simpler and avoids
   conversation state management across rejection cycles.

5. **Feedback injection uses a structured prefix** — `[IMPORTANT — Previous
   attempt was rejected]` block is visually distinct and hard for the agent
   to ignore.
