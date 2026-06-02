import { useMemo } from 'react'

interface WorkflowTask {
  icon: 'done' | 'running' | 'failed' | 'pending' | 'rejected'
  taskId: string
  agentId: string
  summary?: string
  rejectCount?: number
}

interface WorkflowData {
  workflowId: string
  event: string
  completedTaskId: string
  completedBy: string
  workflowStatus: string
  tasks: WorkflowTask[]
}

const TASK_LINE_RE = /^\s*(✅|🔄|❌|⬜)\s+(\S+)\s+\(([^)]+)\)(?:\s+\(rejected\s+(\d+)x\))?(?::\s+(.*))?$/

const parseWorkflowProgress = (text: string): WorkflowData | null => {
  const headerMatch = text.match(/^\[Workflow progress:\s*([^\]]+)\]/)
  if (!headerMatch) return null

  const workflowId = headerMatch[1].trim()
  const eventMatch = text.match(/^Event:\s*(.+)$/m)
  const taskMatch = text.match(/^Task:\s*(\S+)\s+by\s+(\S+)$/m)
  const statusMatch = text.match(/^Workflow status:\s*(.+)$/m)

  const event = eventMatch?.[1]?.trim() ?? ''
  const completedTaskId = taskMatch?.[1] ?? ''
  const completedBy = taskMatch?.[2] ?? ''
  const workflowStatus = statusMatch?.[1]?.trim() ?? ''

  const tasks: WorkflowTask[] = []
  for (const line of text.split('\n')) {
    const m = line.match(TASK_LINE_RE)
    if (!m) continue
    const iconChar = m[1]
    const icon: WorkflowTask['icon'] =
      iconChar === '✅' ? 'done' :
      iconChar === '🔄' ? 'running' :
      iconChar === '❌' ? 'failed' : 'pending'
    tasks.push({
      icon,
      taskId: m[2],
      agentId: m[3],
      rejectCount: m[4] ? parseInt(m[4], 10) : undefined,
      summary: m[5]?.trim() || undefined,
    })
  }

  return { workflowId, event, completedTaskId, completedBy, workflowStatus, tasks }
}

const statusDot = (icon: WorkflowTask['icon']) => {
  const base = 'inline-block w-2 h-2 rounded-full flex-shrink-0'
  switch (icon) {
    case 'done':
      return <span className={`${base} bg-accent-green/40`} />
    case 'running':
      return (
        <span className="relative inline-flex flex-shrink-0 w-2 h-2">
          <span className="absolute inset-0 rounded-full bg-accent-brand animate-ping-soft" />
          <span className={`${base} bg-accent-brand`} />
        </span>
      )
    case 'failed':
      return <span className={`${base} bg-accent-red`} />
    default:
      return <span className={`${base} bg-text-muted`} />
  }
}

const eventLabel = (event: string, taskId: string) => {
  if (event.toLowerCase().includes('completed')) return `Task completed: ${taskId}`
  if (event.toLowerCase().includes('failed')) return `Task failed: ${taskId}`
  return `${event}: ${taskId}`
}

const WorkflowProgressCard = ({ text }: { text: string }) => {
  const data = useMemo(() => parseWorkflowProgress(text), [text])
  if (!data) return null

  const doneCount = data.tasks.filter((t) => t.icon === 'done').length

  return (
    <div
      style={{
        margin: '6px 4px 6px 17px',
        borderRadius: 8,
        border: '1px solid rgb(var(--border-subtle))',
        background: 'rgb(var(--bg-elevated))',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 14px',
          borderBottom: '1px solid rgb(var(--border-subtle))',
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 600, color: 'rgb(var(--text-secondary))' }}>
          {eventLabel(data.event, data.completedTaskId)}
        </span>
        <span
          style={{
            fontSize: 10,
            color: 'rgb(var(--text-muted))',
            fontFamily: "'SF Mono', monospace",
          }}
        >
          {doneCount}/{data.tasks.length}
        </span>
      </div>

      {/* Progress bar */}
      <div style={{ height: 2, background: 'rgb(var(--border-subtle))' }}>
        <div
          style={{
            height: '100%',
            width: `${data.tasks.length > 0 ? (doneCount / data.tasks.length) * 100 : 0}%`,
            background: 'rgb(var(--accent-green))',
            transition: 'width 0.3s ease',
          }}
        />
      </div>

      {/* Task list */}
      <div style={{ padding: '6px 10px' }}>
        {data.tasks.map((task) => (
          <div
            key={task.taskId}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '4px 4px',
              borderRadius: 4,
              background: task.icon === 'running' ? 'rgb(var(--accent-brand) / 0.05)' : 'transparent',
            }}
          >
            {statusDot(task.icon)}
            <span
              style={{
                fontSize: 12,
                color: task.icon === 'done' ? 'rgb(var(--text-muted))' : 'rgb(var(--text-primary))',
                textDecoration: task.icon === 'done' ? 'line-through' : 'none',
                lineHeight: 1.5,
                flex: 1,
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {task.taskId}
            </span>
            <span
              style={{
                fontSize: 10,
                color: 'rgb(var(--text-muted))',
                fontFamily: "'SF Mono', monospace",
                opacity: 0.7,
                flexShrink: 0,
              }}
            >
              {task.agentId}
            </span>
            {task.rejectCount && task.rejectCount > 0 && (
              <span
                style={{
                  fontSize: 9,
                  padding: '0 4px',
                  borderRadius: 3,
                  background: 'rgb(var(--accent-red) / 0.1)',
                  color: 'rgb(var(--accent-red))',
                  fontFamily: "'SF Mono', monospace",
                  flexShrink: 0,
                }}
              >
                reject x{task.rejectCount}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Workflow status footer */}
      {data.workflowStatus && (
        <div
          style={{
            padding: '4px 14px 6px',
            borderTop: '1px solid rgb(var(--border-subtle))',
          }}
        >
          <span style={{ fontSize: 10, color: 'rgb(var(--text-muted))', fontFamily: "'SF Mono', monospace" }}>
            {data.workflowStatus}
          </span>
        </div>
      )}
    </div>
  )
}

export const isWorkflowProgress = (text: string): boolean =>
  text.startsWith('[Workflow progress:')

export default WorkflowProgressCard
