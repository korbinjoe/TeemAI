// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PendingEvolutionProposals from '../../components/evolution/PendingEvolutionProposals'
import type { EvolutionReviewJob } from '../../hooks/useEvolutionReviewJobs'

const makeJob = (status: EvolutionReviewJob['status']): EvolutionReviewJob => ({
  id: `job-${status}`,
  targetType: 'agent',
  targetId: 'lead',
  triggerType: 'low_satisfaction',
  status,
  evidence: { avgMss: -5 },
  proposal: {
    evidence: { avgMss: -5 },
    rootCause: 'Repeated corrections.',
    diff: '- old\n+ new',
    expectedImpact: 'Better future behavior.',
    risk: 'Low',
    validationPlan: 'Run a targeted mission.',
    rollbackPath: 'Use snapshot.',
    actions: [{ type: 'memory_upsert', agentId: 'lead', content: 'lesson' }],
    metrics: { holdoutScore: 0.8 },
  },
  appliedActions: status === 'applied'
    ? [{ status: 'applied', changedFile: '/tmp/SOUL.md', rollbackRef: '/tmp/snapshot' }]
    : undefined,
  error: status === 'failed' ? 'apply failed' : undefined,
  createdAt: new Date().toISOString(),
})

describe('PendingEvolutionProposals', () => {
  const onAction = vi.fn()

  afterEach(() => {
    cleanup()
    onAction.mockReset()
  })

  it('shows approve and reject for proposal_ready jobs', () => {
    render(<PendingEvolutionProposals jobs={[makeJob('proposal_ready')]} onAction={onAction} />)

    fireEvent.click(screen.getByRole('button', { name: 'Approve proposal' }))
    expect(onAction).toHaveBeenCalledWith('job-proposal_ready', 'approve')

    fireEvent.click(screen.getByRole('button', { name: 'Reject proposal' }))
    expect(onAction).toHaveBeenCalledWith('job-proposal_ready', 'reject')
  })

  it('shows apply for approved jobs', () => {
    render(<PendingEvolutionProposals jobs={[makeJob('approved')]} onAction={onAction} />)

    fireEvent.click(screen.getByRole('button', { name: 'Apply proposal' }))
    expect(onAction).toHaveBeenCalledWith('job-approved', 'apply')
  })

  it('expands details for applied and failed jobs', () => {
    render(<PendingEvolutionProposals jobs={[makeJob('applied'), makeJob('failed')]} onAction={onAction} />)

    fireEvent.click(screen.getAllByRole('button', { name: 'Toggle proposal details' })[0])
    expect(screen.getByText('Rollback')).toBeTruthy()
    expect(screen.getAllByText(/snapshot/).length).toBeGreaterThan(0)

    fireEvent.click(screen.getAllByRole('button', { name: 'Toggle proposal details' })[1])
    expect(screen.getByText(/apply failed/)).toBeTruthy()
  })
})
