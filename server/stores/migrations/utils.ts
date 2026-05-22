import type BetterSqlite3 from 'better-sqlite3'

export function getSchemaVersion(db: BetterSqlite3.Database): number {
  const row = db.prepare("SELECT value FROM _meta WHERE key = 'schema_version'").get() as { value: string } | undefined
  return row ? Number(row.value) : 1
}
