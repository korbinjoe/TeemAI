/**
 * PlanApprovalCard — stream-json  ExitPlanMode  UI
 *
 *  Agent  ExitPlanMode  Approve / Reject
 *  onSubmit  Agent stdin
 */

import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, XCircle, FileText, Send } from 'lucide-react'

interface PlanApprovalCardProps {
  answered: boolean
  onSubmit?: (answer: string) => void
}

const PlanApprovalCard = ({ answered, onSubmit }: PlanApprovalCardProps) => {
  const { t } = useTranslation('chat')
  const [submitted, setSubmitted] = useState(false)
  const [choice, setChoice] = useState<'approve' | 'reject' | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  const isDisabled = answered || submitted

  const handleApprove = useCallback(() => {
    if (isDisabled || !onSubmit) return
    setChoice('approve')
    setSubmitted(true)
    onSubmit('Yes, proceed with the plan.')
  }, [isDisabled, onSubmit])

  const handleReject = useCallback(() => {
    if (isDisabled) return
    if (choice === 'reject') {
      if (!onSubmit) return
      setSubmitted(true)
      onSubmit(rejectReason.trim() || 'Please revise the plan.')
    } else {
      setChoice('reject')
    }
  }, [isDisabled, choice, rejectReason, onSubmit])

  return (
    <div style={{
      margin: '6px 4px 6px 17px',
      borderRadius: 8,
      border: '1px solid rgb(var(--accent-brand) / 0.3)',
      background: 'rgb(var(--bg-elevated))',
      overflow: 'hidden',
    }}>
      {/* Title */}
      <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <FileText size={14} style={{ color: 'rgb(var(--accent-brand))', flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 500, color: 'rgb(var(--text-emphasis))' }}>
          {t('planApproval.title')}
        </span>
      </div>

      {choice === 'reject' && !submitted && (
        <div style={{ padding: '0 14px 10px' }}>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder={t('planApproval.rejectPlaceholder')}
            style={{
              width: '100%',
              minHeight: 50,
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

      {!isDisabled && (
        <div style={{
          padding: '8px 14px',
          borderTop: '1px solid rgb(var(--border-subtle))',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 8,
        }}>
          {choice !== 'reject' && (
            <button
              onClick={handleReject}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '5px 12px',
                borderRadius: 6,
                border: '1px solid rgb(var(--border-subtle))',
                background: 'transparent',
                color: 'rgb(var(--text-muted))',
                fontSize: 12,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              <XCircle size={12} />
              {t('planApproval.revise')}
            </button>
          )}
          <button
            onClick={choice === 'reject' ? handleReject : handleApprove}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '5px 14px',
              borderRadius: 6,
              border: 'none',
              background: 'rgb(var(--accent-brand))',
              color: '#fff',
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {choice === 'reject' ? <Send size={12} /> : <CheckCircle2 size={12} />}
            {choice === 'reject' ? t('planApproval.submitFeedback') : t('planApproval.approve')}
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
          color: choice === 'approve' ? 'rgb(var(--accent-green))' : 'rgb(var(--accent-brand))',
        }}>
          {choice === 'approve'
            ? <><CheckCircle2 size={12} />{t('planApproval.approved')}</>
            : <><Send size={12} />{t('planApproval.feedbackSubmitted')}</>
          }
        </div>
      )}
    </div>
  )
}

export default PlanApprovalCard
