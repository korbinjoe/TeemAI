import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  readCodexConfig,
  extractCodexEnvKeys,
  resolveEnvKeyValues,
  resolveCodexProviderEnv,
} from '../lib/codexConfigEnv'

const TMP_ROOT = join(tmpdir(), `codex-env-test-${Date.now()}-${process.pid}`)

vi.mock('../lib/resolveCliCommand', () => ({
  getLoginShellEnvSubsetAsync: vi.fn(async (keys: string[]) => {
    const out: Record<string, string> = {}
    for (const key of keys) {
      if (key === 'SHELL_ONLY_KEY') out[key] = 'from-shell'
    }
    return out
  }),
}))

describe('codexConfigEnv', () => {
  const codexConfigPath = join(TMP_ROOT, 'config.toml')
  const teemaiConfigPath = join(TMP_ROOT, 'teemai.json')
  const claudeSettingsPath = join(TMP_ROOT, 'claude-settings.json')

  beforeEach(() => {
    mkdirSync(TMP_ROOT, { recursive: true })
    delete process.env.OPENCODE_GO_API_KEY
    delete process.env.SHELL_ONLY_KEY
  })

  afterEach(() => {
    rmSync(TMP_ROOT, { recursive: true, force: true })
  })

  it('extracts env_key from active model_provider', () => {
    writeFileSync(codexConfigPath, `
model_provider = "opencode"

[model_providers.opencode]
env_key = "OPENCODE_GO_API_KEY"
`)
    const config = readCodexConfig(codexConfigPath)
    expect(config).not.toBeNull()
    expect(extractCodexEnvKeys(config!, '/tmp/project')).toEqual(['OPENCODE_GO_API_KEY'])
  })

  it('prefers project-level model_provider override', () => {
    const projectCwd = join(TMP_ROOT, 'repo')
    writeFileSync(codexConfigPath, `
model_provider = "openai"

[model_providers.custom]
env_key = "CUSTOM_API_KEY"

[projects."${projectCwd}"]
model_provider = "custom"
`)
    const config = readCodexConfig(codexConfigPath)!
    expect(extractCodexEnvKeys(config, projectCwd)).toEqual(['CUSTOM_API_KEY'])
    expect(extractCodexEnvKeys(config, '/other')).toEqual([])
  })

  it('resolves from process.env first', async () => {
    process.env.OPENCODE_GO_API_KEY = 'from-process'
    const resolved = await resolveEnvKeyValues(['OPENCODE_GO_API_KEY'])
    expect(resolved.OPENCODE_GO_API_KEY).toBe('from-process')
  })

  it('falls back to teemai.json env block', async () => {
    writeFileSync(teemaiConfigPath, JSON.stringify({
      env: { OPENCODE_GO_API_KEY: 'from-teemai' },
    }))
    const resolved = await resolveEnvKeyValues(['OPENCODE_GO_API_KEY'], {
      teemaiConfigPath,
      claudeSettingsPath,
    })
    expect(resolved.OPENCODE_GO_API_KEY).toBe('from-teemai')
  })

  it('falls back to claude settings env block', async () => {
    writeFileSync(claudeSettingsPath, JSON.stringify({
      env: { OPENCODE_GO_API_KEY: 'from-claude' },
    }))
    const resolved = await resolveEnvKeyValues(['OPENCODE_GO_API_KEY'], {
      teemaiConfigPath,
      claudeSettingsPath,
    })
    expect(resolved.OPENCODE_GO_API_KEY).toBe('from-claude')
  })

  it('falls back to login shell env', async () => {
    const resolved = await resolveEnvKeyValues(['SHELL_ONLY_KEY'])
    expect(resolved.SHELL_ONLY_KEY).toBe('from-shell')
  })

  it('resolveCodexProviderEnv returns provider env_key value', async () => {
    writeFileSync(codexConfigPath, `
model_provider = "opencode"

[model_providers.opencode]
env_key = "OPENCODE_GO_API_KEY"
`)
    process.env.OPENCODE_GO_API_KEY = 'resolved-key'
    const resolved = await resolveCodexProviderEnv(undefined, codexConfigPath)
    expect(resolved).toEqual({ OPENCODE_GO_API_KEY: 'resolved-key' })
  })
})
