/**
 * CLI tool names organized by category for the IDENTITY editor;
 * aligned with Claude Code / OpenClaw common tools.
 */

export type IdentityToolCategoryDef = {
  id: string
  title: string
  tools: readonly string[]
}

export const IDENTITY_TOOL_CATEGORIES: readonly IdentityToolCategoryDef[] = [
  {
    id: 'file',
    title: 'File Operations',
    tools: [
      'Read',
      'Write',
      'Edit',
      'Glob',
      'Grep',
      'NotebookEdit',
      'MultiEdit',
    ],
  },
  {
    id: 'exec',
    title: 'Execution & System',
    tools: ['Bash', 'Agent', 'Skill', 'TodoWrite'],
  },
  {
    id: 'planning',
    title: 'Planning & Workflow',
    tools: ['EnterPlanMode', 'ExitPlanMode', 'EnterWorktree', 'ExitWorktree'],
  },
  {
    id: 'cron',
    title: 'Scheduling & Tasks',
    tools: [
      'CronCreate',
      'CronDelete',
      'CronList',
      'ScheduleWakeup',
      'TaskCreate',
      'TaskList',
      'TaskGet',
      'TaskUpdate',
      'TaskOutput',
      'TaskStop',
    ],
  },
  {
    id: 'interaction',
    title: 'Interaction & Web',
    tools: ['AskUserQuestion', 'WebFetch', 'WebSearch'],
  },
] as const

const FLAT_PRESET_TOOLS: readonly string[] = IDENTITY_TOOL_CATEGORIES.flatMap((c) => [...c.tools])

const sortUnique = (arr: string[]) => [...new Set(arr)].sort((a, b) => a.localeCompare(b))

export const mergeIdentityToolRows = (allowed: string[], disallowed: string[]): string[] => {
  const s = new Set<string>([...FLAT_PRESET_TOOLS, ...allowed, ...disallowed])
  return [...s].sort((a, b) => a.localeCompare(b))
}

export const getIdentityExtraTools = (allowed: string[], disallowed: string[]): string[] => {
  const preset = new Set(FLAT_PRESET_TOOLS)
  return mergeIdentityToolRows(allowed, disallowed).filter((t) => !preset.has(t))
}

export const applyToolAllowedRow = (
  tool: string,
  on: boolean,
  allowed: string[],
  disallowed: string[],
): { allowedTools: string[]; disallowedTools: string[] } => {
  let a = [...allowed]
  let d = [...disallowed].filter((t) => t !== tool)
  if (on) {
    if (!a.includes(tool)) a.push(tool)
  } else {
    a = a.filter((t) => t !== tool)
  }
  return { allowedTools: sortUnique(a), disallowedTools: sortUnique(d) }
}

export const applyToolDisallowedRow = (
  tool: string,
  on: boolean,
  allowed: string[],
  disallowed: string[],
): { allowedTools: string[]; disallowedTools: string[] } => {
  let a = [...allowed].filter((t) => t !== tool)
  let d = [...disallowed]
  if (on) {
    if (!d.includes(tool)) d.push(tool)
  } else {
    d = d.filter((t) => t !== tool)
  }
  return { allowedTools: sortUnique(a), disallowedTools: sortUnique(d) }
}

const IDENTITY_TOOL_TOOLTIP_BODY: Record<string, string> = {
  Read: 'Read file contents',
  Write: 'Create/overwrite file',
  Edit: 'Edit file via exact string replacement',
  Glob: 'Search for files',
  Grep: 'Search file contents',
  NotebookEdit: 'Edit notebooks',
  MultiEdit: 'Batch structured edits across multiple files',
  Bash: 'Execute shell commands',
  Agent: 'Dispatch sub-tasks',
  Skill: 'Invoke predefined skills',
  TodoWrite: 'Create and manage task lists',
  EnterPlanMode: 'Enter plan mode',
  ExitPlanMode: 'Exit plan mode',
  EnterWorktree: 'Create git worktree isolation',
  ExitWorktree: 'Exit git worktree environment',
  CronCreate: 'Create scheduled job',
  CronDelete: 'Delete scheduled job',
  CronList: 'List scheduled jobs',
  ScheduleWakeup: 'Dynamic loop wakeup scheduling',
  TaskCreate: 'Create background task subprocess',
  TaskList: 'List running or recent tasks',
  TaskGet: 'Query task status and metadata',
  TaskUpdate: 'Update task parameters or status',
  TaskOutput: 'Get background task output',
  TaskStop: 'Stop background task',
  AskUserQuestion: 'Ask user a question',
  WebFetch: 'Fetch and analyze web content',
  WebSearch: 'Search the web',
}

export const getIdentityToolTooltip = (tool: string): string => {
  const body = IDENTITY_TOOL_TOOLTIP_BODY[tool]
  if (body) return `${tool}: ${body}`
  return `${tool}: This tool appears in config or source; see CLI docs for details`
}
