import { useState } from 'react'

const TagInput = ({ value, onChange, disabled, placeholder }: {
  value: string[]
  onChange: (v: string[]) => void
  disabled?: boolean
  placeholder?: string
}) => {
  const [inputValue, setInputValue] = useState('')

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      const trimmed = inputValue.trim().replace(/,$/, '')
      if (trimmed && !value.includes(trimmed)) {
        onChange([...value, trimmed])
      }
      setInputValue('')
    }
    if (e.key === 'Backspace' && !inputValue && value.length > 0) {
      onChange(value.slice(0, -1))
    }
  }

  const handleRemove = (tag: string) => {
    if (disabled) return
    onChange(value.filter((v) => v !== tag))
  }

  return (
    <div
      className="flex flex-wrap items-center gap-1 rounded-md border border-border bg-bg-input px-2 py-1 min-h-[32px] focus-within:ring-1 focus-within:ring-accent-brand"
      style={disabled ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
    >
      {value.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded bg-bg-hover px-1.5 py-0.5 text-xs text-text-primary"
        >
          {tag}
          {!disabled && (
            <button
              onClick={() => handleRemove(tag)}
              className="ml-0.5 text-text-secondary hover:text-text-primary"
              aria-label={`Remove ${tag}`}
              tabIndex={0}
            >
              x
            </button>
          )}
        </span>
      ))}
      {!disabled && (
        <input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={value.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[60px] bg-transparent border-none outline-none text-xs text-text-primary placeholder:text-text-muted"
        />
      )}
    </div>
  )
}

export default TagInput
