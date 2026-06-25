import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { cwdToCliProjectKey } from '../../shared/projectKey'
import { isQoderVendor, type CliProvider } from '../config/types'
import { codexOutputParser } from './CodexParser'
import { locateCodexRollout } from './CodexRolloutLocator'
import { claudeOutputParser, type OutputParser } from './OutputParser'

export interface SessionTranscript {
  filePath: string
  parser: OutputParser
}

export const resolveSessionTranscript = (
  cwd: string,
  cliSessionId: string,
  provider: CliProvider = 'claude',
): SessionTranscript | null => {
  if (!cwd || !cliSessionId) return null

  if (provider === 'codex') {
    const rollout = locateCodexRollout(cliSessionId)
    return rollout ? { filePath: rollout, parser: codexOutputParser } : null
  }

  const projectKey = cwdToCliProjectKey(cwd)
  const filePath = isQoderVendor(provider)
    ? join(homedir(), '.qoder', 'projects', projectKey, 'transcript', `${cliSessionId}.jsonl`)
    : join(homedir(), '.claude', 'projects', projectKey, `${cliSessionId}.jsonl`)

  if (!existsSync(filePath)) return null
  return { filePath, parser: claudeOutputParser }
}
