import { useState, useRef, useEffect } from 'react'

interface QuickInputProps {
  visible: boolean
}

export const QuickInput = ({ visible }: QuickInputProps) => {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (visible) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [visible])

  const handleSubmit = () => {
    const msg = value.trim()
    if (!msg) return
    window.notchBridge?.sendQuickCommand(msg)
    setValue('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    }
    if (e.key === 'Escape') {
      window.notchBridge?.notchAction('compact')
    }
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-t border-white/10">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Send a quick command..."
        className="flex-1 bg-white/5 text-white/90 text-xs px-2.5 py-1.5 rounded-md outline-none placeholder:text-white/25 focus:bg-white/10 transition-colors"
      />
      <button
        onClick={handleSubmit}
        disabled={!value.trim()}
        className="text-white/60 hover:text-white/90 disabled:text-white/20 text-xs px-2 py-1 transition-colors"
      >
        Send
      </button>
    </div>
  )
}
