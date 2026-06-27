import { describe, it, expect, afterEach } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { HooksConfigManager } from '../runtime/HooksConfigManager'
import { ConfigCompiler } from '../runtime/ConfigCompiler'
import type { Agent } from '../config/types'
import type { SkillManager } from '../config/SkillManager'

const ROOT = join(__dirname, '..', '..')

const makeAgent = (): Agent => ({
  id: 'test-agent',
  name: 'Test Agent',
  description: 'test',
  icon: 'T',
  systemPrompt: { mode: 'append', content: '' },
  tags: [],
  source: 'builtin',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  skills: ['whiteboard'],
})

const makeAgentWithRenderPerf = (): Agent => ({
  ...makeAgent(),
  skills: ['whiteboard', 'render-performance-verification'],
})

const makeSkillManager = (): SkillManager => ({
  listSkills: () => [],
  getSkill: (name: string) => name === 'whiteboard'
    ? {
        name: 'whiteboard',
        description: 'test',
        content: '',
        hooks: {
          Stop: [
            { command: 'bash /tmp/teemai/hooks/wb-auto-extract.sh', timeout: 5 },
            { command: 'bash /tmp/teemai/hooks/satisfaction-score.sh', timeout: 5 },
          ],
        },
      }
    : name === 'render-performance-verification'
      ? {
          name: 'render-performance-verification',
          description: 'test',
          content: '',
          hooks: {
            Stop: [
              { command: 'bash /tmp/teemai/hooks/render-perf-auto.sh --hook', timeout: 1200 },
            ],
          },
        }
    : undefined,
  getSkillDir: () => undefined,
} as unknown as SkillManager)

const countHookCommand = (hooksJson: { hooks?: { Stop?: Array<{ hooks?: Array<{ command?: string }> }> } }, scriptName: string): number => {
  const stop = hooksJson.hooks?.Stop ?? []
  return stop.flatMap((entry) => entry.hooks ?? [])
    .filter((hook) => hook.command?.includes(scriptName))
    .length
}

describe('ConfigCompiler Codex hook idempotency', () => {
  const tempRoots: string[] = []

  afterEach(() => {
    for (const dir of tempRoots.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('keeps one wb-auto-extract and one satisfaction-score hook across three compile cycles', async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'teemai-codex-hooks-'))
    tempRoots.push(tempRoot)
    const repoDir = join(tempRoot, 'repo')
    mkdirSync(join(repoDir, '.codex'), { recursive: true })

    const hooksPath = join(repoDir, '.codex', 'hooks.json')
    writeFileSync(hooksPath, JSON.stringify({
      hooks: {
        Stop: [
          { hooks: [{ type: 'command', command: 'bash /Users/example/.teemai/hooks/wb-auto-extract.sh', timeout: 5 }] },
          { hooks: [{ type: 'command', command: 'bash /Users/example/.teemai/hooks/satisfaction-score.sh', timeout: 5 }] },
        ],
      },
    }, null, 2))

    const compiler = new ConfigCompiler(makeSkillManager(), new HooksConfigManager(), undefined, undefined, ROOT)
    const cleanups: Array<() => Promise<void>> = []

    for (let i = 0; i < 3; i++) {
      const compiled = await compiler.compile(
        makeAgent(),
        { repositories: [{ path: repoDir }], serverPort: 1234 },
        'codex',
      )
      cleanups.push(compiled.cleanup)
    }

    const hooksJson = JSON.parse(readFileSync(hooksPath, 'utf-8'))
    expect(countHookCommand(hooksJson, 'wb-auto-extract.sh')).toBe(1)
    expect(countHookCommand(hooksJson, 'satisfaction-score.sh')).toBe(1)

    for (const cleanup of cleanups.reverse()) {
      await cleanup()
    }

    if (existsSync(hooksPath)) {
      const cleaned = JSON.parse(readFileSync(hooksPath, 'utf-8'))
      expect(countHookCommand(cleaned, 'wb-auto-extract.sh')).toBe(0)
      expect(countHookCommand(cleaned, 'satisfaction-score.sh')).toBe(0)
    }
  })

  it('keeps one render-perf-auto hook across compile cycles', async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'teemai-codex-render-hooks-'))
    tempRoots.push(tempRoot)
    const repoDir = join(tempRoot, 'repo')
    mkdirSync(join(repoDir, '.codex'), { recursive: true })

    const hooksPath = join(repoDir, '.codex', 'hooks.json')
    writeFileSync(hooksPath, JSON.stringify({
      hooks: {
        Stop: [
          { hooks: [{ type: 'command', command: 'bash /Users/example/.teemai/hooks/render-perf-auto.sh --hook', timeout: 1200 }] },
        ],
      },
    }, null, 2))

    const compiler = new ConfigCompiler(makeSkillManager(), new HooksConfigManager(), undefined, undefined, ROOT)
    const cleanups: Array<() => Promise<void>> = []

    for (let i = 0; i < 3; i++) {
      const compiled = await compiler.compile(
        makeAgentWithRenderPerf(),
        { repositories: [{ path: repoDir }], serverPort: 1234 },
        'codex',
      )
      cleanups.push(compiled.cleanup)
    }

    const hooksJson = JSON.parse(readFileSync(hooksPath, 'utf-8'))
    expect(countHookCommand(hooksJson, 'render-perf-auto.sh')).toBe(1)

    for (const cleanup of cleanups.reverse()) {
      await cleanup()
    }

    if (existsSync(hooksPath)) {
      const cleaned = JSON.parse(readFileSync(hooksPath, 'utf-8'))
      expect(countHookCommand(cleaned, 'render-perf-auto.sh')).toBe(0)
    }
  })
})
