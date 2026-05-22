/**
 * AskUserQuestionCard — stream-json  AskUserQuestion  UI
 *
 *  toolUse.input  questions/options/
 *  onSubmit  Agent stdin
 */

import { useState, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Circle, Square, CheckSquare, Send } from 'lucide-react'

interface QuestionOption {
  label: string
  description?: string
}

interface Question {
  question: string
  header?: string
  options: QuestionOption[]
  multiSelect?: boolean
}

interface ParsedInput {
  questions: Question[]
}

interface AskUserQuestionCardProps {
  toolInput: string
  answered: boolean
  onSubmit?: (answer: string) => void
}

/**  AskUserQuestion  input JSON */
const parseQuestions = (input: string): ParsedInput | null => {
  try {
    const parsed = JSON.parse(input)
    if (parsed?.questions && Array.isArray(parsed.questions)) {
      return parsed as ParsedInput
    }
  } catch { /* ignore */ }
  return null
}

const AskUserQuestionCard = ({ toolInput, answered, onSubmit }: AskUserQuestionCardProps) => {
  const { t } = useTranslation('chat')
  const parsed = useMemo(() => parseQuestions(toolInput), [toolInput])
  // selections: Map<questionIndex, Set<optionIndex>>
  const [selections, setSelections] = useState<Map<number, Set<number>>>(() => new Map())
  const [submitted, setSubmitted] = useState(false)
  const [customInputs, setCustomInputs] = useState<Map<number, string>>(() => new Map())
  const [showCustom, setShowCustom] = useState<Set<number>>(() => new Set())

  const isDisabled = answered || submitted

  const handleSelect = useCallback((qIdx: number, oIdx: number, multiSelect: boolean) => {
    if (isDisabled) return
    setSelections(prev => {
      const next = new Map(prev)
      const current = new Set(next.get(qIdx) || [])
      if (multiSelect) {
        if (current.has(oIdx)) current.delete(oIdx)
        else current.add(oIdx)
      } else {
        current.clear()
        current.add(oIdx)
      }
      setShowCustom(prev => {
        const n = new Set(prev)
        n.delete(qIdx)
        return n
      })
      setCustomInputs(prev => {
        const n = new Map(prev)
        n.delete(qIdx)
        return n
      })
      next.set(qIdx, current)
      return next
    })
  }, [isDisabled])

  const handleToggleCustom = useCallback((qIdx: number) => {
    if (isDisabled) return
    setShowCustom(prev => {
      const next = new Set(prev)
      if (next.has(qIdx)) {
        next.delete(qIdx)
      } else {
        next.add(qIdx)
        setSelections(prev => {
          const n = new Map(prev)
          n.delete(qIdx)
          return n
        })
      }
      return next
    })
  }, [isDisabled])

  const handleCustomInput = useCallback((qIdx: number, value: string) => {
    setCustomInputs(prev => {
      const next = new Map(prev)
      next.set(qIdx, value)
      return next
    })
  }, [])

  const canSubmit = useMemo(() => {
    if (!parsed || isDisabled) return false
    for (let i = 0; i < parsed.questions.length; i++) {
      if (showCustom.has(i)) {
        if (!customInputs.get(i)?.trim()) return false
      } else {
        const sel = selections.get(i)
        if (!sel || sel.size === 0) return false
      }
    }
    return true
  }, [parsed, selections, isDisabled, showCustom, customInputs])

  const handleSubmit = useCallback(() => {
    if (!parsed || !canSubmit || !onSubmit) return
    const parts: string[] = []
    for (let qi = 0; qi < parsed.questions.length; qi++) {
      const q = parsed.questions[qi]
      if (showCustom.has(qi)) {
        const text = customInputs.get(qi)?.trim() || ''
        if (parsed.questions.length === 1) {
          parts.push(text)
        } else {
          parts.push(`${q.header || q.question}: ${text}`)
        }
      } else {
        const selected = selections.get(qi)
        if (!selected || selected.size === 0) continue
        const labels = Array.from(selected).map(i => q.options[i]?.label).filter(Boolean)
        if (parsed.questions.length === 1) {
          parts.push(labels.join(', '))
        } else {
          parts.push(`${q.header || q.question}: ${labels.join(', ')}`)
        }
      }
    }
    const answer = parts.join('\n') || 'OK'
    setSubmitted(true)
    onSubmit(answer)
  }, [parsed, canSubmit, onSubmit, selections, showCustom, customInputs])

  if (!parsed || parsed.questions.length === 0) return null

  return (
    <div onClick={(e) => e.stopPropagation()} style={{
      margin: '6px 4px 6px 17px',
      borderRadius: 8,
      border: '1px solid rgb(var(--accent-brand) / 0.3)',
      background: 'rgb(var(--bg-elevated))',
      overflow: 'hidden',
    }}>
      {parsed.questions.map((q, qi) => (
        <div key={qi} style={{ padding: '10px 14px', borderBottom: qi < parsed.questions.length - 1 ? '1px solid rgb(var(--border-subtle))' : undefined }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            {q.header && (
              <span style={{
                fontSize: 10,
                fontWeight: 600,
                padding: '1px 6px',
                borderRadius: 4,
                background: 'rgb(var(--accent-brand) / 0.12)',
                color: 'rgb(var(--accent-brand))',
                textTransform: 'uppercase',
                letterSpacing: '0.02em',
              }}>
                {q.header}
              </span>
            )}
            <span style={{ fontSize: 12, fontWeight: 500, color: 'rgb(var(--text-emphasis))' }}>
              {q.question}
            </span>
          </div>

          {/* OptionsList */}
          {!showCustom.has(qi) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {q.options.map((opt, oi) => {
                const isSelected = selections.get(qi)?.has(oi) ?? false
                const Icon = q.multiSelect
                  ? (isSelected ? CheckSquare : Square)
                  : (isSelected ? CheckCircle2 : Circle)

                return (
                  <div
                    key={oi}
                    role="button"
                    tabIndex={isDisabled ? -1 : 0}
                    onClick={() => handleSelect(qi, oi, !!q.multiSelect)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSelect(qi, oi, !!q.multiSelect) } }}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 8,
                      padding: '6px 10px',
                      borderRadius: 6,
                      border: `1px solid ${isSelected ? 'rgb(var(--accent-brand) / 0.5)' : 'rgb(var(--border-subtle))'}`,
                      background: isSelected ? 'rgb(var(--accent-brand) / 0.06)' : 'transparent',
                      cursor: isDisabled ? 'default' : 'pointer',
                      opacity: isDisabled ? 0.6 : 1,
                      transition: 'all 0.15s',
                    }}
                  >
                    <Icon
                      size={14}
                      style={{
                        color: isSelected ? 'rgb(var(--accent-brand))' : 'rgb(var(--text-muted))',
                        flexShrink: 0,
                        marginTop: 1,
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 12,
                        fontWeight: isSelected ? 500 : 400,
                        color: isSelected ? 'rgb(var(--text-emphasis))' : 'rgb(var(--text-primary))',
                      }}>
                        {opt.label}
                      </div>
                      {opt.description && (
                        <div style={{
                          fontSize: 11,
                          color: 'rgb(var(--text-muted))',
                          marginTop: 1,
                          lineHeight: 1.4,
                        }}>
                          {opt.description}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* CustomInput */}
          {showCustom.has(qi) && (
            <div style={{ marginBottom: 4 }}>
              <textarea
                value={customInputs.get(qi) || ''}
                onChange={(e) => handleCustomInput(qi, e.target.value)}
                disabled={isDisabled}
                placeholder={t('askQuestion.customPlaceholder')}
                style={{
                  width: '100%',
                  minHeight: 60,
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: '1px solid rgb(var(--border-subtle))',
                  background: 'rgb(var(--bg-input))',
                  color: 'rgb(var(--text-primary))',
                  fontSize: 12,
                  fontFamily: 'inherit',
                  resize: 'vertical',
                  outline: 'none',
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'rgb(var(--accent-brand))' }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'rgb(var(--border-subtle))' }}
              />
            </div>
          )}

          {/* Other Switch */}
          {!isDisabled && (
            <button
              onClick={() => handleToggleCustom(qi)}
              style={{
                marginTop: 4,
                fontSize: 11,
                color: 'rgb(var(--text-muted))',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '2px 0',
                textDecoration: 'underline',
                textDecorationColor: 'rgb(var(--text-muted) / 0.3)',
              }}
            >
              {showCustom.has(qi) ? t('askQuestion.selectPreset') : t('askQuestion.customInput')}
            </button>
          )}
        </div>
      ))}

      {/* SubmitButton */}
      {!isDisabled && (
        <div style={{ padding: '8px 14px', borderTop: '1px solid rgb(var(--border-subtle))', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 14px',
              borderRadius: 6,
              border: 'none',
              background: canSubmit ? 'rgb(var(--accent-brand))' : 'rgb(var(--bg-hover-muted) / var(--bg-hover-muted-alpha))',
              color: canSubmit ? '#fff' : 'rgb(var(--text-muted))',
              fontSize: 12,
              fontWeight: 500,
              cursor: canSubmit ? 'pointer' : 'default',
              transition: 'all 0.15s',
            }}
          >
            <Send size={12} />
            {t('askQuestion.confirm')}
          </button>
        </div>
      )}

      {submitted && (
        <div style={{
          padding: '6px 14px',
          borderTop: '1px solid rgb(var(--border-subtle))',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 11,
          color: 'rgb(var(--accent-green))',
        }}>
          <CheckCircle2 size={12} />
          {t('askQuestion.submitted')}
        </div>
      )}
    </div>
  )
}

export default AskUserQuestionCard
