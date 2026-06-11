/**
 *  cwd  Claude Code  projectKey~/.claude/projects/<projectKey>/
 *  `/`  `.`  `-` Claude Code
 *
 * ⚠  Claude providerCodex  ~/.codex/sessions/YYYY/MM/DD/
 *  codex
 */
export const cwdToClaudeProjectKey = (cwd: string): string => cwd.replace(/[/.]/g, '-')

export const cwdToQoderProjectKey = (cwd: string): string => cwd.replace(/[/.]/g, '-')
