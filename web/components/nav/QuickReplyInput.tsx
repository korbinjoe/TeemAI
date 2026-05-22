/**
 * QuickReplyInput — sidebar
 * Enter  WS
 */

import { useEffect, useRef, useState } from 'react'
import { Send } from 'lucide-react'
import { cn } from '@/lib/utils'

interface QuickReplyInputProps {
  onSend: (text: string) => void
  /**  reset  permission-resolved input */
  resetKey?: string
}

const QuickReplyInput = ({ onSend, resetKey }: QuickReplyInputProps) => {
  const [value, setValue] = useState('')
  const [pending, setPending] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (resetKey != null) {
      setValue('')
      setPending(false)
    }
  }, [resetKey])

  const submit = () => {
    const trimmed = value.trim()
    if (!trimmed || pending) return
    setPending(true)
    onSend(trimmed)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={pending}
        placeholder="Quick reply…（Enter Send）"
        className={cn(
          'flex-1 h-7 px-2 text-[11px] bg-bg-input border border-border-subtle rounded outline-none',
          'focus:border-accent-brand',
          pending && 'opacity-50',
        )}
      />
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); submit() }}
        disabled={pending || !value.trim()}
        className={cn(
          'h-7 w-7 flex items-center justify-center rounded text-text-muted transition-colors',
          'hover:text-text-emphasis hover:bg-bg-hover',
          (pending || !value.trim()) && 'opacity-40 pointer-events-none',
        )}
        aria-label="Send"
      >
        <Send size={12} />
      </button>
    </div>
  )
}

export default QuickReplyInput
