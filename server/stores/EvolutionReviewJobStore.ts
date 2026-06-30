import { randomUUID } from 'crypto'
import { getDatabase } from './Database'

export type EvolutionReviewStatus = 'queued' | 'running' | 'proposal_ready' | 'approved' | 'rejected' | 'applied' | 'failed'
export type EvolutionReviewTargetType = 'agent' | 'skill' | 'team'

export type AgentPromptFile = 'IDENTITY.md' | 'AGENTS.md' | 'SOUL.md'

export interface AgentPromptPatchAction {
  type: 'agent_prompt_patch'
  agentId: string
  filePath: AgentPromptFile
  find: string
  replace: string
}

export interface SkillPatchAction {
  type: 'skill_patch'
  skillName: string
  filePath?: string
  find: string
  replace: string
}

export interface SkillCreateAction {
  type: 'skill_create'
  skillName: string
  description: string
  body: string
  createdBy?: string
}

export interface SkillWriteFileAction {
  type: 'skill_write_file'
  skillName: string
  filePath: string
  content: string
}

export interface SkillArchiveAction {
  type: 'skill_archive'
  skillName: string
}

export interface SkillRestoreAction {
  type: 'skill_restore'
  skillName: string
  archivePath: string
}

export interface SkillPinAction {
  type: 'skill_pin'
  skillName: string
  pinned: boolean
}

export interface MemoryUpsertAction {
  type: 'memory_upsert'
  agentId: string
  content: string
  category?: string
  importance?: number
  source?: string
}

export type EvolutionAction =
  | AgentPromptPatchAction
  | SkillPatchAction
  | SkillCreateAction
  | SkillWriteFileAction
  | SkillArchiveAction
  | SkillRestoreAction
  | SkillPinAction
  | MemoryUpsertAction

export interface EvolutionMetrics {
  baselineScore?: number
  candidateScore?: number
  holdoutScore?: number
  datasetSource?: string
  sizeChange?: number
  gates?: Array<{ name: string; passed: boolean; message?: string }>
  [key: string]: unknown
}

export interface EvolutionProposal {
  evidence: unknown
  rootCause: string
  diff: string
  expectedImpact: string
  risk: string
  validationPlan: string
  rollbackPath: string
  actions: EvolutionAction[]
  metrics?: EvolutionMetrics
}

export interface AppliedEvolutionAction {
  action: EvolutionAction
  status: 'applied' | 'failed'
  changedFile?: string
  rollbackRef?: string
  result?: unknown
  error?: string
}

export interface EvolutionReviewJob {
  id: string
  targetType: EvolutionReviewTargetType
  targetId: string
  triggerType: string
  evidence: unknown
  status: EvolutionReviewStatus
  proposal?: EvolutionProposal
  appliedActions?: AppliedEvolutionAction[]
  error?: string
  createdAt: string
  updatedAt: string
  approvedAt?: string
  rejectedAt?: string
  appliedAt?: string
}

export class EvolutionReviewJobStore {
  private db = getDatabase()

  create(params: {
    targetType: EvolutionReviewTargetType
    targetId: string
    triggerType: string
    evidence: unknown
  }): EvolutionReviewJob {
    const now = new Date().toISOString()
    const job: EvolutionReviewJob = {
      id: randomUUID(),
      targetType: params.targetType,
      targetId: params.targetId,
      triggerType: params.triggerType,
      evidence: params.evidence,
      status: 'queued',
      createdAt: now,
      updatedAt: now,
    }
    this.db.prepare(`
      INSERT INTO evolution_review_jobs (
        id, target_type, target_id, trigger_type, evidence_json, status, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(job.id, job.targetType, job.targetId, job.triggerType, JSON.stringify(job.evidence), job.status, now, now)
    return job
  }

  get(id: string): EvolutionReviewJob | undefined {
    const row = this.db.prepare('SELECT * FROM evolution_review_jobs WHERE id = ?').get(id)
    return row ? this.rowToJob(row as Record<string, unknown>) : undefined
  }

  list(params: { status?: EvolutionReviewStatus; limit?: number } = {}): EvolutionReviewJob[] {
    const limit = params.limit ?? 100
    const rows = params.status
      ? this.db.prepare('SELECT * FROM evolution_review_jobs WHERE status = ? ORDER BY created_at DESC LIMIT ?').all(params.status, limit)
      : this.db.prepare('SELECT * FROM evolution_review_jobs ORDER BY created_at DESC LIMIT ?').all(limit)
    return rows.map((row) => this.rowToJob(row as Record<string, unknown>))
  }

  nextQueued(): EvolutionReviewJob | undefined {
    const row = this.db.prepare(`
      SELECT * FROM evolution_review_jobs
      WHERE status = 'queued'
      ORDER BY created_at ASC
      LIMIT 1
    `).get()
    return row ? this.rowToJob(row as Record<string, unknown>) : undefined
  }

  latestForTarget(targetType: EvolutionReviewTargetType, targetId: string): EvolutionReviewJob | undefined {
    const row = this.db.prepare(`
      SELECT * FROM evolution_review_jobs
      WHERE target_type = ? AND target_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(targetType, targetId)
    return row ? this.rowToJob(row as Record<string, unknown>) : undefined
  }

  updateStatus(id: string, status: EvolutionReviewStatus, error?: string): void {
    const now = new Date().toISOString()
    const timestampColumn = status === 'approved'
      ? 'approved_at'
      : status === 'rejected'
        ? 'rejected_at'
        : status === 'applied'
          ? 'applied_at'
          : null
    const timestampSql = timestampColumn ? `, ${timestampColumn} = ?` : ''
    const values = timestampColumn
      ? [status, error ?? null, now, now, id]
      : [status, error ?? null, now, id]
    this.db.prepare(`
      UPDATE evolution_review_jobs
      SET status = ?, error = ?, updated_at = ?${timestampSql}
      WHERE id = ?
    `).run(...values)
  }

  setProposal(id: string, proposal: EvolutionProposal): void {
    this.db.prepare(`
      UPDATE evolution_review_jobs
      SET proposal_json = ?, status = 'proposal_ready', updated_at = ?
      WHERE id = ?
    `).run(JSON.stringify(proposal), new Date().toISOString(), id)
  }

  setAppliedActions(id: string, actions: AppliedEvolutionAction[]): void {
    this.db.prepare(`
      UPDATE evolution_review_jobs
      SET applied_actions_json = ?, updated_at = ?
      WHERE id = ?
    `).run(JSON.stringify(actions), new Date().toISOString(), id)
  }

  private rowToJob(row: Record<string, unknown>): EvolutionReviewJob {
    return {
      id: row.id as string,
      targetType: row.target_type as EvolutionReviewTargetType,
      targetId: row.target_id as string,
      triggerType: row.trigger_type as string,
      evidence: JSON.parse(row.evidence_json as string),
      status: row.status as EvolutionReviewStatus,
      proposal: row.proposal_json ? JSON.parse(row.proposal_json as string) as EvolutionProposal : undefined,
      appliedActions: row.applied_actions_json ? JSON.parse(row.applied_actions_json as string) as AppliedEvolutionAction[] : undefined,
      error: row.error as string | undefined,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      approvedAt: row.approved_at as string | undefined,
      rejectedAt: row.rejected_at as string | undefined,
      appliedAt: row.applied_at as string | undefined,
    }
  }
}
