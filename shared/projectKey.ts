/**
 * Derive a CLI provider's projectKey from a cwd, e.g. ~/.claude/projects/<projectKey>/.
 * Replaces every `/` and `.` with `-`. Shared by Claude and Qoder, whose
 * project-key derivation is identical.
 *
 * ⚠ Only applies to providers that key sessions by cwd (Claude, Qoder).
 * Codex keys sessions by date (~/.codex/sessions/YYYY/MM/DD/), not projectKey.
 */
export const cwdToCliProjectKey = (cwd: string): string => cwd.replace(/[/.]/g, '-')
