import { getDatabase } from './Database'
import { readSkillManifest, type SkillLifecycleSource, type SkillManifest } from '../services/skillManifest'

export interface SkillEvolutionRecord {
  skillName: string
  source: SkillLifecycleSource
  path: string
  sourceHash?: string
  createdBy?: string
  updatedBy?: string
  createdAt: string
  updatedAt: string
  lastUsedAt?: string
  lastViewedAt?: string
  lastPatchedAt?: string
  useCount: number
  viewCount: number
  patchCount: number
  pinned: boolean
  archivedAt?: string
  supersededBy?: string
}

export class SkillEvolutionStore {
  private db = getDatabase()

  list(): SkillEvolutionRecord[] {
    const rows = this.db.prepare(
      'SELECT * FROM skill_evolution ORDER BY source ASC, skill_name ASC'
    ).all()
    return rows.map((row) => this.rowToRecord(row as Record<string, unknown>))
  }

  get(skillName: string): SkillEvolutionRecord | undefined {
    const row = this.db.prepare(
      'SELECT * FROM skill_evolution WHERE skill_name = ?'
    ).get(skillName)
    return row ? this.rowToRecord(row as Record<string, unknown>) : undefined
  }

  syncFromManifest(manifest: SkillManifest): void {
    const syncEntries = (source: SkillLifecycleSource, entries: SkillManifest[SkillLifecycleSource]) => {
      for (const [skillName, entry] of Object.entries(entries)) {
        this.upsert({
          skillName,
          source,
          path: entry.runtimePath,
          sourceHash: entry.hash,
        })
      }
    }

    syncEntries('bundled', manifest.bundled)
    syncEntries('user', manifest.user)
    syncEntries('agent', manifest.agent)
  }

  async syncFromManifestPath(skillsDir: string): Promise<void> {
    const manifest = await readSkillManifest(skillsDir)
    if (manifest) this.syncFromManifest(manifest)
  }

  upsert(params: {
    skillName: string
    source: SkillLifecycleSource
    path: string
    sourceHash?: string
    createdBy?: string
    updatedBy?: string
  }): void {
    const now = new Date().toISOString()
    this.db.prepare(`
      INSERT INTO skill_evolution (
        skill_name, source, path, source_hash, created_by, updated_by,
        created_at, updated_at, use_count, view_count, patch_count, pinned
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0)
      ON CONFLICT(skill_name) DO UPDATE SET
        source = excluded.source,
        path = excluded.path,
        source_hash = excluded.source_hash,
        updated_by = COALESCE(excluded.updated_by, skill_evolution.updated_by),
        updated_at = excluded.updated_at
    `).run(
      params.skillName,
      params.source,
      params.path,
      params.sourceHash ?? null,
      params.createdBy ?? null,
      params.updatedBy ?? null,
      now,
      now,
    )
  }

  bumpUse(skillName: string): void {
    this.bumpCounter(skillName, 'use_count', 'last_used_at')
  }

  bumpView(skillName: string): void {
    this.bumpCounter(skillName, 'view_count', 'last_viewed_at')
  }

  bumpPatch(skillName: string): void {
    this.bumpCounter(skillName, 'patch_count', 'last_patched_at')
  }

  setArchived(skillName: string, archived: boolean): void {
    const now = new Date().toISOString()
    this.db.prepare(`
      UPDATE skill_evolution
      SET archived_at = ?,
          updated_at = ?
      WHERE skill_name = ?
    `).run(archived ? now : null, now, skillName)
  }

  setPinned(skillName: string, pinned: boolean): void {
    this.db.prepare(`
      UPDATE skill_evolution
      SET pinned = ?,
          updated_at = ?
      WHERE skill_name = ?
    `).run(pinned ? 1 : 0, new Date().toISOString(), skillName)
  }

  private bumpCounter(skillName: string, countColumn: string, timeColumn: string): void {
    this.db.prepare(`
      UPDATE skill_evolution
      SET ${countColumn} = ${countColumn} + 1,
          ${timeColumn} = ?,
          updated_at = ?
      WHERE skill_name = ?
    `).run(new Date().toISOString(), new Date().toISOString(), skillName)
  }

  private rowToRecord(row: Record<string, unknown>): SkillEvolutionRecord {
    return {
      skillName: row.skill_name as string,
      source: row.source as SkillLifecycleSource,
      path: row.path as string,
      sourceHash: row.source_hash as string | undefined,
      createdBy: row.created_by as string | undefined,
      updatedBy: row.updated_by as string | undefined,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      lastUsedAt: row.last_used_at as string | undefined,
      lastViewedAt: row.last_viewed_at as string | undefined,
      lastPatchedAt: row.last_patched_at as string | undefined,
      useCount: row.use_count as number,
      viewCount: row.view_count as number,
      patchCount: row.patch_count as number,
      pinned: !!row.pinned,
      archivedAt: row.archived_at as string | undefined,
      supersededBy: row.superseded_by as string | undefined,
    }
  }
}
