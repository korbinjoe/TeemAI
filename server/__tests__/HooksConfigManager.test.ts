import { describe, it, expect, afterAll } from 'vitest'
import { readFile, rm } from 'fs/promises'
import { HooksConfigManager } from '../runtime/HooksConfigManager'
import { TMP_HOOKS_DIR } from '../config/paths'

const cleanupKeys: string[] = []

const readSettings = async (path: string) => {
  const text = await readFile(path, 'utf-8')
  return JSON.parse(text) as Record<string, unknown>
}

describe('HooksConfigManager.writeConfig envOverrides', () => {
  const hcm = new HooksConfigManager()

  afterAll(async () => {
    for (const key of cleanupKeys) {
      await hcm.cleanup(key).catch(() => {})
    }
    await rm(TMP_HOOKS_DIR, { recursive: true, force: true }).catch(() => {})
  })

  it('no envOverrides passed → no env field in settings', async () => {
    const key = `test-no-env-${Date.now()}`
    cleanupKeys.push(key)
    const path = await hcm.writeConfig(key, undefined, undefined, undefined)
    const settings = await readSettings(path)
    expect(settings.env).toBeUndefined()
    expect(settings.permissions).toBeDefined()
  })

  it('envOverrides empty object → no env field in settings', async () => {
    const key = `test-empty-env-${Date.now()}`
    cleanupKeys.push(key)
    const path = await hcm.writeConfig(key, undefined, undefined, undefined, {})
    const settings = await readSettings(path)
    expect(settings.env).toBeUndefined()
  })

  it('envOverrides all empty strings → no env field after filtering', async () => {
    const key = `test-blank-env-${Date.now()}`
    cleanupKeys.push(key)
    const path = await hcm.writeConfig(key, undefined, undefined, undefined, {
      ANTHROPIC_AUTH_TOKEN: '',
      ANTHROPIC_BASE_URL: '',
    })
    const settings = await readSettings(path)
    expect(settings.env).toBeUndefined()
  })

  it('envOverrides with valid values → writes settings.env, filters empty values', async () => {
    const key = `test-with-env-${Date.now()}`
    cleanupKeys.push(key)
    const path = await hcm.writeConfig(key, undefined, undefined, undefined, {
      ANTHROPIC_MODEL: 'claude-opus-4-7',
      ANTHROPIC_AUTH_TOKEN: 'sk-test',
      ANTHROPIC_BASE_URL: '',
    })
    const settings = await readSettings(path)
    expect(settings.env).toEqual({
      ANTHROPIC_MODEL: 'claude-opus-4-7',
      ANTHROPIC_AUTH_TOKEN: 'sk-test',
    })
  })

  it('envOverrides coexists with hooks', async () => {
    const key = `test-env-and-hooks-${Date.now()}`
    cleanupKeys.push(key)
    const path = await hcm.writeConfig(
      key,
      { PreToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: 'echo user' }] }] },
      undefined,
      { PreToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: 'echo sys' }] }] },
      { ANTHROPIC_MODEL: 'claude-sonnet-4-6' },
    )
    const settings = await readSettings(path)
    expect((settings.env as Record<string, string>)?.ANTHROPIC_MODEL).toBe('claude-sonnet-4-6')
    expect(settings.hooks).toBeDefined()
  })
})
