import { useCallback, useEffect, useState } from 'react'
import { API_BASE, authFetch } from '@/config/api'

export interface EvolutionReviewJob {
  id: string
  targetType: 'agent' | 'skill' | 'team'
  targetId: string
  triggerType: string
  status: 'queued' | 'running' | 'proposal_ready' | 'approved' | 'rejected' | 'applied' | 'failed'
  proposal?: {
    rootCause: string
    diff: string
    expectedImpact: string
    risk: string
    validationPlan: string
    rollbackPath: string
  }
  createdAt: string
}

const useEvolutionReviewJobs = (targetId: string | undefined) => {
  const [jobs, setJobs] = useState<EvolutionReviewJob[]>([])
  const [loading, setLoading] = useState(false)

  const fetch_ = useCallback(async () => {
    if (!targetId) return
    setLoading(true)
    try {
      const res = await authFetch(`${API_BASE}/api/evolution/review-jobs?status=proposal_ready`)
      if (!res.ok) return
      const all = await res.json() as EvolutionReviewJob[]
      setJobs(all.filter((job) => job.targetId === targetId || job.targetId === 'team'))
    } finally {
      setLoading(false)
    }
  }, [targetId])

  const act = useCallback(async (jobId: string, action: 'approve' | 'reject' | 'apply') => {
    const res = await authFetch(`${API_BASE}/api/evolution/review-jobs/${encodeURIComponent(jobId)}/${action}`, {
      method: 'POST',
    })
    if (res.ok) await fetch_()
    return res.ok
  }, [fetch_])

  useEffect(() => { void fetch_() }, [fetch_])

  return { jobs, loading, refetch: fetch_, act }
}

export default useEvolutionReviewJobs
