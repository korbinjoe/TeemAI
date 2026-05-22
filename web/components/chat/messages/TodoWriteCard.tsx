/**
 * TodoWriteCard —  TodoWrite
 *
 *  toolUse.input  todos
 */

import { useMemo } from 'react'
import { CheckCircle2, Circle, Loader2, AlertCircle } from 'lucide-react'

interface TodoItem {
  content: string
  status: 'pending' | 'in_progress' | 'completed'
  activeForm: string
}

interface TodoWriteCardProps {
  toolInput: string
  isCompleted?: boolean
}

const parseTodos = (input: string): TodoItem[] | null => {
  try {
    const parsed = JSON.parse(input)
    if (parsed?.todos && Array.isArray(parsed.todos)) {
      return parsed.todos as TodoItem[]
    }
  } catch { /* ignore */ }
  return null
}

const StatusIcon = ({ status, isCompleted }: { status: TodoItem['status']; isCompleted?: boolean }) => {
  switch (status) {
    case 'completed':
      return <CheckCircle2 size={14} style={{ color: 'rgb(var(--accent-green))', flexShrink: 0 }} />
    case 'in_progress':
      if (isCompleted) {
        return <AlertCircle size={14} style={{ color: 'rgb(var(--accent-orange))', flexShrink: 0 }} />
      }
      return <Loader2 size={14} style={{ color: 'rgb(var(--accent-purple))', animation: 'spin 1s linear infinite', flexShrink: 0 }} />
    default:
      return <Circle size={14} style={{ color: 'rgb(var(--text-muted))', opacity: 0.4, flexShrink: 0 }} />
  }
}

const TodoWriteCard = ({ toolInput, isCompleted }: TodoWriteCardProps) => {
  const todos = useMemo(() => parseTodos(toolInput), [toolInput])

  if (!todos || todos.length === 0) return null

  const completed = todos.filter((t) => t.status === 'completed').length

  return (
    <div style={{
      margin: '6px 4px 6px 17px',
      borderRadius: 8,
      border: '1px solid rgb(var(--border-subtle))',
      background: 'rgb(var(--bg-elevated))',
      overflow: 'hidden',
    }}>
      {/* Title bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 14px',
        borderBottom: '1px solid rgb(var(--border-subtle))',
      }}>
        <span style={{
          fontSize: 11,
          fontWeight: 600,
          color: 'rgb(var(--text-secondary))',
        }}>
          Tasks
        </span>
        <span style={{
          fontSize: 10,
          color: 'rgb(var(--text-muted))',
          fontFamily: "'SF Mono', monospace",
        }}>
          {completed}/{todos.length}
        </span>
      </div>

      {/* Progress bar */}
      <div style={{
        height: 2,
        background: 'rgb(var(--border-subtle))',
      }}>
        <div style={{
          height: '100%',
          width: `${(completed / todos.length) * 100}%`,
          background: 'rgb(var(--accent-green))',
          transition: 'width 0.3s ease',
        }} />
      </div>

      {/* TaskList */}
      <div style={{ padding: '6px 10px' }}>
        {todos.map((todo, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
              padding: '5px 4px',
              borderRadius: 4,
              background: todo.status === 'in_progress'
                ? 'rgb(var(--accent-purple) / 0.05)'
                : 'transparent',
            }}
          >
            <StatusIcon status={todo.status} isCompleted={isCompleted} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 12,
                color: todo.status === 'completed'
                  ? 'rgb(var(--text-muted))'
                  : 'rgb(var(--text-primary))',
                textDecoration: todo.status === 'completed' ? 'line-through' : 'none',
                lineHeight: 1.5,
              }}>
                {todo.status === 'in_progress' ? todo.activeForm : todo.content}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default TodoWriteCard
