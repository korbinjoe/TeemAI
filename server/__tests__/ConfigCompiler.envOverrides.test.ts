import { describe, it, expect, beforeAll } from 'vitest'
import { readFile, writeFile, mkdir, rm } from 'fs/promises'
import { join } from 'path'
import { homedir } from 'os'
import { SkillManager } from '../config/SkillManager'
import { HooksConfigManager } from '../runtime/HooksConfigManager'
import { ConfigCompiler } from '../runtime/ConfigCompiler'
import type { Agent } from '../config/types'

const ROOT = join(__dirname, '..', '..')
const BUILTIN_SKILLS_DIR = join(ROOT, 'ai-assets', 'skills')

const makeAgent = (overrides: Partial<Agent> = {}): Agent => ({
  id: `test-agent-${Math.random().toString(36).slice(2, 8)}`,
  name: `test-agent-${Math.random().toString(36).slice(2, 8)}`,
  description: 'test',
  icon: '🤖',
  systemPrompt: { mode: 'append', content: 'Basic tips' },
  tags: [],
  source: 'builtin',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
})

const readSettingsFromArgs = async (args: string[]) => {
  const idx = args.indexOf('--settings')
  expect(idx).toBeGreaterThanOrEqual(0)
  const path = args[idx + 1]
  const text = await readFile(path, 'utf-8')
  return JSON.parse(text) as Record<string, unknown>
}

describe('ConfigCompiler envOverrides flow into --settings', () => {
  let compiler: ConfigCompiler

  beforeAll(async () => {
    const sm = new SkillManager(BUILTIN_SKILLS_DIR)
    await sm.loadBuiltinSkills()
    compiler = new ConfigCompiler(sm, new HooksConfigManager(), undefined, undefined, ROOT)
  })

  it('agent.model writes settings.env.ANTHROPIC_MODEL (double insurance)', async () => {
    const compiled = await compiler.compile(
      makeAgent({ model: 'claude-opus-4-7' }),
      { repositories: [{ path: ROOT }], serverPort: 3210 },
      'claude',
    )
    const settings = await readSettingsFromArgs(compiled.args)
    expect((settings.env as Record<string, string>)?.ANTHROPIC_MODEL).toBe('claude-opus-4-7')
    const modelIdx = compiled.args.indexOf('--model')
    expect(compiled.args[modelIdx + 1]).toBe('claude-opus-4-7')
    await compiled.cleanup()
  })

  it('llmEnv (credentials) writes settings.env, overrides user-level settings.json', async () => {
    const compiled = await compiler.compile(
      makeAgent({ model: 'claude-opus-4-7' }),
      { repositories: [{ path: ROOT }], serverPort: 3210 },
      'claude',
      { ANTHROPIC_AUTH_TOKEN: 'sk-teemai-token', ANTHROPIC_BASE_URL: 'https://teemai-proxy.example.com' },
    )
    const settings = await readSettingsFromArgs(compiled.args)
    const env = settings.env as Record<string, string>
    expect(env.ANTHROPIC_AUTH_TOKEN).toBe('sk-teemai-token')
    expect(env.ANTHROPIC_BASE_URL).toBe('https://teemai-proxy.example.com')
    expect(env.ANTHROPIC_MODEL).toBe('claude-opus-4-7')
    await compiled.cleanup()
  })

  it('no model no credentials → settings does not write env field', async () => {
    const compiled = await compiler.compile(
      makeAgent(),
      { repositories: [{ path: ROOT }], serverPort: 3210 },
      'claude',
    )
    const settings = await readSettingsFromArgs(compiled.args)
    expect(settings.env).toBeUndefined()
    await compiled.cleanup()
  })

  it('resume path also injects envOverrides', async () => {
    const compiled = await compiler.compile(
      makeAgent({ model: 'claude-sonnet-4-6' }),
      { repositories: [{ path: ROOT }], serverPort: 3210, resumeSessionId: 'old-sid' },
      'claude',
      { ANTHROPIC_AUTH_TOKEN: 'sk-resume' },
    )
    const settings = await readSettingsFromArgs(compiled.args)
    const env = settings.env as Record<string, string>
    expect(env.ANTHROPIC_MODEL).toBe('claude-sonnet-4-6')
    expect(env.ANTHROPIC_AUTH_TOKEN).toBe('sk-resume')
    expect(compiled.args).toContain('--resume')
    await compiled.cleanup()
  })

  it('llmEnv with empty strings → filtered out, not written', async () => {
    const compiled = await compiler.compile(
      makeAgent({ model: 'claude-opus-4-7' }),
      { repositories: [{ path: ROOT }], serverPort: 3210 },
      'claude',
      { ANTHROPIC_AUTH_TOKEN: '', ANTHROPIC_BASE_URL: 'https://valid.example.com' },
    )
    const settings = await readSettingsFromArgs(compiled.args)
    const env = settings.env as Record<string, string>
    expect(env.ANTHROPIC_AUTH_TOKEN).toBeUndefined()
    expect(env.ANTHROPIC_BASE_URL).toBe('https://valid.example.com')
    expect(env.ANTHROPIC_MODEL).toBe('claude-opus-4-7')
    await compiled.cleanup()
  })

  it('codex compile injects provider env_key from ~/.codex/config.toml', async () => {
    const codexDir = join(homedir(), '.codex')
    const codexConfigPath = join(codexDir, 'config.toml')
    let originalConfig: string | null = null
    try {
      originalConfig = await readFile(codexConfigPath, 'utf-8')
    } catch {
      await mkdir(codexDir, { recursive: true })
    }

    await writeFile(codexConfigPath, `
model_provider = "opencode"

[model_providers.opencode]
env_key = "OPENCODE_GO_API_KEY"
`)
    process.env.OPENCODE_GO_API_KEY = 'codex-test-key'

    const compiled = await compiler.compile(
      makeAgent({ model: 'gpt-5-codex' }),
      { repositories: [{ path: ROOT }], serverPort: 3210 },
      'codex',
    )
    expect(compiled.env.OPENCODE_GO_API_KEY).toBe('codex-test-key')
    const skillConfigIdx = compiled.args.indexOf('skills.include_instructions=false')
    expect(skillConfigIdx).toBeGreaterThan(0)
    expect(compiled.args[skillConfigIdx - 1]).toBe('-c')
    await compiled.cleanup()

    if (originalConfig !== null) {
      await writeFile(codexConfigPath, originalConfig)
    } else {
      await rm(codexConfigPath, { force: true })
    }
    delete process.env.OPENCODE_GO_API_KEY
  })

  it('codex exec resume passes stdin marker for multi-turn', async () => {
    const compiled = await compiler.compile(
      makeAgent({ model: 'gpt-5-codex' }),
      { repositories: [{ path: ROOT }], serverPort: 3210, resumeSessionId: 'codex-thread-1' },
      'codex',
    )
    expect(compiled.command).toBe('codex')
    expect(compiled.args).toContain('exec')
    expect(compiled.args).toContain('resume')
    expect(compiled.args).toContain('codex-thread-1')
    expect(compiled.args).toContain('-')
    expect(compiled.args).not.toContain('--resume')
    const skillConfigIdx = compiled.args.indexOf('skills.include_instructions=false')
    expect(skillConfigIdx).toBeGreaterThan(0)
    expect(compiled.args[skillConfigIdx - 1]).toBe('-c')
    await compiled.cleanup()
  })
})
