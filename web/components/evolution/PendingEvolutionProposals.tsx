import { useState } from 'react'
import { Check, ChevronDown, ChevronRight, Play, RotateCcw, X } from 'lucide-react'
import type { EvolutionReviewJob } from '@/hooks/useEvolutionReviewJobs'

interface PendingEvolutionProposalsProps {
  jobs: EvolutionReviewJob[]
  onAction: (jobId: string, action: 'approve' | 'reject' | 'apply') => void
}

const PendingEvolutionProposals = ({ jobs, onAction }: PendingEvolutionProposalsProps) => {
  const [open, setOpen] = useState<string | null>(null)
  if (jobs.length === 0) return null

  return (
    <div>
      <div className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">
        Pending Evolution
      </div>
      <div className="space-y-2">
        {jobs.map((job) => (
          <div key={job.id} className="rounded-md border border-border-subtle bg-white/[0.01] px-3 py-2.5">
            <div className="flex items-start gap-2">
              <button
                type="button"
                aria-label="Toggle proposal details"
                onClick={() => setOpen(open === job.id ? null : job.id)}
                className="mt-0.5 h-6 w-6 inline-flex items-center justify-center rounded text-text-secondary hover:bg-bg-hover-muted"
              >
                {open === job.id ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="text-xs font-medium text-text-emphasis truncate">
                    {job.triggerType}
                  </div>
                  <span className="shrink-0 rounded border border-border-subtle px-1.5 py-0.5 text-[10px] uppercase text-text-muted">
                    {job.status}
                  </span>
                </div>
                <div className="text-xs text-text-secondary mt-1 leading-[1.45] line-clamp-3">
                  {job.proposal?.rootCause || 'Proposal waiting for review.'}
                </div>
                {job.proposal?.risk && (
                  <div className="text-xs text-text-muted mt-1 truncate">
                    Risk: {job.proposal.risk}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {job.status === 'proposal_ready' && (
                  <>
                    <button
                      type="button"
                      aria-label="Approve proposal"
                      onClick={() => onAction(job.id, 'approve')}
                      className="h-7 w-7 inline-flex items-center justify-center rounded border border-border-subtle text-accent-green hover:bg-accent-green/10"
                    >
                      <Check size={13} />
                    </button>
                    <button
                      type="button"
                      aria-label="Reject proposal"
                      onClick={() => onAction(job.id, 'reject')}
                      className="h-7 w-7 inline-flex items-center justify-center rounded border border-border-subtle text-text-secondary hover:bg-bg-hover-muted"
                    >
                      <X size={13} />
                    </button>
                  </>
                )}
                {job.status === 'approved' && (
                  <button
                    type="button"
                    aria-label="Apply proposal"
                    onClick={() => onAction(job.id, 'apply')}
                    className="h-7 w-7 inline-flex items-center justify-center rounded border border-border-subtle text-accent-brand hover:bg-accent-brand/10"
                  >
                    <Play size={13} />
                  </button>
                )}
                {job.status === 'applied' && (
                  <div className="h-7 w-7 inline-flex items-center justify-center rounded border border-border-subtle text-text-muted" title="Applied">
                    <RotateCcw size={13} />
                  </div>
                )}
              </div>
            </div>
            {open === job.id && (
              <div className="mt-3 space-y-2 border-t border-border-subtle pt-3 text-xs text-text-secondary">
                <Detail label="Diff" value={job.proposal?.diff} />
                <Detail label="Actions" value={job.proposal?.actions} />
                <Detail label="Metrics" value={job.proposal?.metrics} />
                <Detail label="Evidence" value={job.proposal?.evidence ?? job.evidence} />
                <Detail label="Validation" value={job.proposal?.validationPlan} />
                <Detail label="Rollback" value={job.appliedActions?.[0]?.rollbackRef ?? job.proposal?.rollbackPath} />
                {job.error && <Detail label="Error" value={job.error} />}
                {job.appliedActions?.length ? <Detail label="Applied" value={job.appliedActions} /> : null}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

const Detail = ({ label, value }: { label: string; value: unknown }) => {
  if (value === undefined || value === null || value === '') return null
  const display = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase text-text-muted">{label}</div>
      <pre className="max-h-44 overflow-auto whitespace-pre-wrap rounded border border-border-subtle bg-black/10 p-2 text-[11px] leading-relaxed text-text-secondary">
        {display}
      </pre>
    </div>
  )
}

export default PendingEvolutionProposals
