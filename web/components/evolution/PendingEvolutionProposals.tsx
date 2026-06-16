import { Check, X } from 'lucide-react'
import type { EvolutionReviewJob } from '@/hooks/useEvolutionReviewJobs'

interface PendingEvolutionProposalsProps {
  jobs: EvolutionReviewJob[]
  onAction: (jobId: string, action: 'approve' | 'reject' | 'apply') => void
}

const PendingEvolutionProposals = ({ jobs, onAction }: PendingEvolutionProposalsProps) => {
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
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium text-text-emphasis truncate">
                  {job.triggerType}
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
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default PendingEvolutionProposals
