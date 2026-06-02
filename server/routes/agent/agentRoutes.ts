import { Router } from 'express'
import { exec, spawn } from 'child_process'
import { readFile } from 'fs/promises'
import { createReadStream } from 'fs'
import { createInterface } from 'readline'
import { dirname, resolve } from 'path'
import type { AgentRegistry } from '../../config/AgentRegistry'
import type { AgentStore } from '../../stores/AgentStore'
import type { SkillManager } from '../../config/SkillManager'
import type { SkillDefinition, Agent } from '../../config/types'
import { agentDefToAgent } from '../../config/types'
import { agentToMarkdown, markdownToAgent } from '../../utils/agentMarkdown'
import { syncAgentToWorkspace, removeAgentWorkspace } from '../../utils/agentWorkspaceSync'
import { resolveCliCommandAsync, resolveInterpreter } from '../../lib/resolveCliCommand'
import { buildFullSuitePrompt, type SenseiMode } from '../../lib/senseiPromptBuilder'
import {
  parseFullSuiteResponse,
  createStreamSplitter,
} from '../../lib/senseiResponseParser'
import {
  AVATAR_PROMPT_TEMPLATES,
  AVATAR_STYLES,
  generateImage,
  type AvatarStyle,
} from '../../lib/geminiImage'
import { saveAvatar, deleteAgentAvatars, resolveAvatarPath } from '../../lib/avatarStorage'
import { createLogger } from '../../lib/logger'

const log = createLogger('AgentRoutes')

/**
 *  sensei system prompt  YAML frontmatter
 *
 *  `server/index.ts`  `bundledAssetsDir`
 *  devPROJECT_ROOT/ai-assetsContents/Resources/ai-assets
 *  `process.cwd()` server /  cwd
 *
 * @param candidates
 * @returns sensei prompt
 */
const loadSenseiPrompt = async (candidates: string[]): Promise<string> => {
  for (const path of candidates) {
    try {
      const raw = await readFile(path, 'utf-8')
      return raw.replace(/^---\n[\s\S]*?\n---\n/, '').trim()
    } catch {
      // try next
    }
  }
  return ''
}

interface AgentRouteDeps {
  agentRegistry: AgentRegistry
  agentStore: AgentStore
  skillManager: SkillManager
  /**
   * Sensei system prompt
   *  `server/index.ts`  `bundledAssetsDir`  `SenseiUpgradeService`
   */
  senseiPromptPaths: string[]
}

export const createAgentRoutes = (deps: AgentRouteDeps): Router => {
  const router = Router()
  const { agentRegistry, agentStore, skillManager, senseiPromptPaths } = deps

  router.get('/api/agents', (_req, res) => {
    res.json(agentStore.list())
  })

  router.get('/api/agents/team-stats', async (_req, res) => {
    const agents = agentStore.list()
    const dnaDir = resolve(process.cwd(), 'ai-assets/evolution/dna')
    const stats: Record<string, { totalTasks: number; successRate: number }> = {}

    await Promise.all(agents.map(async (agent) => {
      const dnaPath = resolve(dnaDir, `${agent.name}.json`)
      try {
        const raw = await readFile(dnaPath, 'utf-8')
        const data = JSON.parse(raw)
        const metrics = data.metrics || {}
        if (metrics.totalTasks > 0) {
          stats[agent.id] = {
            totalTasks: metrics.totalTasks || 0,
            successRate: metrics.successRate || 0,
          }
        }
      } catch { /* no DNA file — skip */ }
    }))

    res.json(stats)
  })

  router.get('/api/agents/:id', (req, res) => {
    const agent = agentStore.get(req.params.id)
    if (agent) return res.json(agent)
    const def = agentRegistry.get(req.params.id)
    if (def) return res.json(agentDefToAgent(def))
    res.status(404).json({ error: 'Agent not found' })
  })

  router.post('/api/agents', async (req, res) => {
    try {
      const agent: Agent = req.body
      if (!agent.name) {
        return res.status(400).json({ error: 'name is required' })
      }
      await agentStore.upsert(agent)
      await syncAgentToWorkspace(agent)
      res.json({ success: true, agent })
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to save agent' })
    }
  })

  router.post('/api/agents/markdown', async (req, res) => {
    const { markdown } = req.body as { markdown: string }
    if (!markdown) return res.status(400).json({ error: 'markdown is required' })

    try {
      const base: Agent = {
        id: '',
        name: '',
        description: '',
        icon: '',
        systemPrompt: { mode: 'append', content: '' },
        tags: [],
        source: 'user',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      const agent = markdownToAgent(markdown, base)
      if (!agent.name.trim()) {
        return res.status(400).json({ error: 'Frontmatter name is required' })
      }
      await agentStore.upsert(agent)
      const saved = agentStore.getByName(agent.name)
      if (saved) await syncAgentToWorkspace(saved)
      res.status(201).json({ success: true, agent: saved || agent })
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid markdown' })
    }
  })

  router.put('/api/agents/:id', async (req, res) => {
    try {
      const agent: Agent = { ...req.body, id: req.params.id }
      if (agent.avatarId !== undefined && agent.avatarId !== null) {
        const v = String(agent.avatarId)
        if (!/^[a-z0-9._-]{1,128}$/.test(v)) {
          return res.status(400).json({
            error: 'Invalid avatarId: must match /^[a-z0-9._-]{1,128}$/',
          })
        }
      }
      await agentStore.upsert(agent)
      await syncAgentToWorkspace(agent)
      res.json({ success: true, agent })
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to update agent' })
    }
  })

  router.delete('/api/agents/:id', async (req, res) => {
    const deleted = await agentStore.remove(req.params.id)
    if (!deleted) return res.status(404).json({ error: 'Agent not found' })
    await removeAgentWorkspace(req.params.id)
    await deleteAgentAvatars(req.params.id)
    res.json({ success: true })
  })

  router.post('/api/agents/:id/clone', async (req, res) => {
    const stored = agentStore.get(req.params.id)
    const regDef = !stored ? agentRegistry.get(req.params.id) : undefined
    const source: Agent | undefined = stored || (regDef ? agentDefToAgent(regDef) : undefined)
    if (!source) return res.status(404).json({ error: 'Source agent not found' })

    const newName = req.body.name
    if (!newName) return res.status(400).json({ error: 'New name is required' })

    const now = new Date().toISOString()
    const cloned: Agent = {
      ...source,
      id: '',
      name: newName,
      source: 'user',
      createdAt: now,
      updatedAt: now,
    }
    await agentStore.upsert(cloned)
    res.status(201).json(cloned)
  })

  router.post('/api/agents/import', async (req, res) => {
    try {
      const agents: Agent[] = req.body.agents
      if (!Array.isArray(agents)) {
        return res.status(400).json({ error: 'agents array is required' })
      }
      for (const agent of agents) {
        await agentStore.upsert(agent)
      }
      res.json({ success: true, count: agents.length })
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to import agents' })
    }
  })

  router.get('/api/agents/:id/export', (req, res) => {
    const agent = agentStore.get(req.params.id)
    const def = !agent ? agentRegistry.get(req.params.id) : undefined
    const result = agent || (def ? agentDefToAgent(def) : undefined)
    if (!result) return res.status(404).json({ error: 'Agent not found' })
    res.setHeader('Content-Disposition', `attachment; filename="${result.name}.json"`)
    res.json(result)
  })

  router.get('/api/agents/:id/markdown', async (req, res) => {
    const agentId = req.params.id
    const mdPath = resolve(process.cwd(), 'ai-assets/agents', `${agentId}.md`)
    try {
      const raw = await readFile(mdPath, 'utf-8')
      return res.json({ markdown: raw })
    } catch {
    }
    const agent = agentStore.get(agentId)
    if (!agent) return res.status(404).json({ error: 'Agent not found' })
    res.json({ markdown: agentToMarkdown(agent) })
  })

  router.put('/api/agents/:id/markdown', async (req, res) => {
    const agentId = req.params.id
    const { markdown } = req.body as { markdown: string }
    if (!markdown) return res.status(400).json({ error: 'markdown is required' })

    const existing = agentStore.get(agentId)
    if (!existing) return res.status(404).json({ error: 'Agent not found' })
    if (existing.source === 'builtin') {
      return res.status(403).json({ error: 'Cannot edit builtin agent via markdown' })
    }

    try {
      const updated = markdownToAgent(markdown, existing)
      await agentStore.upsert(updated)
      await syncAgentToWorkspace(updated)
      res.json({ success: true, agent: updated })
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid markdown' })
    }
  })

  router.get('/api/agents/:id/dna', async (req, res) => {
    const agent = agentStore.get(req.params.id)
    const regDef = !agent ? agentRegistry.get(req.params.id) : undefined
    const source = agent || (regDef ? agentDefToAgent(regDef) : undefined)
    if (!source) return res.status(404).json({ error: 'Agent not found' })

    const dnaPath = resolve(process.cwd(), 'ai-assets/evolution/dna', `${source.name}.json`)
    try {
      const raw = await readFile(dnaPath, 'utf-8')
      res.json(JSON.parse(raw))
    } catch {
      res.json({
        agentName: source.name,
        skills: [],
        metrics: {
          successRate: 0,
          firstPassRate: 0,
          avgDurationMs: 0,
          totalTasks: 0,
          qualityScore: '-',
        },
        evolutionLog: [],
      })
    }
  })

  // ── Skill APIs ──

  router.get('/api/skills', (_req, res) => {
    res.json(skillManager.listSkills())
  })

  router.get('/api/skills/:name/content', async (req, res) => {
    const skill = skillManager.getSkill(req.params.name)
    if (!skill) return res.status(404).json({ error: 'Skill not found' })
    if (!skill.filePath) return res.json({ content: skill.content })
    try {
      const raw = await readFile(skill.filePath, 'utf-8')
      res.json({ content: raw, filePath: skill.filePath })
    } catch {
      res.json({ content: skill.content, filePath: skill.filePath })
    }
  })

  router.post('/api/skills/:name/reveal', (req, res) => {
    const skill = skillManager.getSkill(req.params.name)
    if (!skill?.filePath) return res.status(404).json({ error: 'Skill file path not found' })
    const dir = dirname(skill.filePath)
    const cmd = process.platform === 'darwin' ? `open "${dir}"` : `xdg-open "${dir}"`
    exec(cmd, (err) => {
      if (err) return res.status(500).json({ error: 'Failed to open directory' })
      res.json({ success: true, dir })
    })
  })

  router.post('/api/skills', (req, res) => {
    try {
      const skill: SkillDefinition = req.body
      if (!skill.name || !skill.description) {
        return res.status(400).json({ error: 'name and description are required' })
      }
      skillManager.registerCustomSkill(skill)
      res.json({ success: true, skill })
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to register skill' })
    }
  })

  router.delete('/api/skills/:name', (req, res) => {
    const deleted = skillManager.removeSkill(req.params.name)
    res.json({ success: deleted })
  })

  router.post('/api/agents/generate-prompt', async (req, res) => {
    const { description, mode: rawMode } = req.body as { description?: string; mode?: string }
    if (!description?.trim()) {
      return res.status(400).json({ error: 'description is required' })
    }

    const mode: SenseiMode = rawMode === 'full-suite' ? 'full-suite' : 'agents-only'
    const isFullSuite = mode === 'full-suite'

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()

    const send = (data: object) => {
      if (!res.destroyed) res.write(`data: ${JSON.stringify(data)}\n\n`)
    }

    send({ type: 'stage', text: 'Preparing to generate...' })

    const senseiBody = await loadSenseiPrompt(senseiPromptPaths)
    if (!senseiBody) {
      log.warn('Sensei prompt not found at any candidate path', { candidates: senseiPromptPaths })
    }
    const userMessage = buildFullSuitePrompt(description, mode)

    const resolvedClaude = await resolveCliCommandAsync('claude')
    if (!resolvedClaude) {
      send({ type: 'error', error: 'claude CLI not found. Please install Claude Code CLI.' })
      return res.end()
    }

    const args = [
      '--print',
      '--verbose',
      '--output-format', 'stream-json',
      ...(senseiBody ? ['--append-system-prompt', senseiBody] : []),
      '--dangerously-skip-permissions',
      '--max-turns', '1',
      '-p', userMessage,
    ]

    send({ type: 'stage', text: 'Starting Claude CLI...' })

    const { command: spawnCmd, prependArgs } = resolveInterpreter(resolvedClaude)
    const child = spawn(spawnCmd, [...prependArgs, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    })

    send({ type: 'stage', text: 'Process started, waiting for response...' })

    const rl = createInterface({ input: child.stdout! })
    let resultContent = ''
    let hasContent = false
    let accumulated = ''
    const splitter = isFullSuite ? createStreamSplitter() : null

    const handleStreamText = (text: string) => {
      if (!hasContent) {
        hasContent = true
        send({ type: 'stage', text: 'Starting content generation...' })
      }
      accumulated += text
      if (splitter) {
        splitter.feed(text, (section, content) => {
          send({ type: `delta:${section}`, content })
        })
      } else {
        send({ type: 'content', text })
      }
    }

    rl.on('line', (line) => {
      try {
        const p = JSON.parse(line) as {
          type: string; subtype?: string; model?: string
          delta?: { type: string; text?: string }
          message?: { content: Array<{ type: string; text?: string }> }
          result?: string; duration_ms?: number; total_cost_usd?: number
        }

        if (p.type === 'system' && p.subtype === 'init') {
          send({ type: 'stage', text: `SessionInitialized${p.model ? ` | Model: ${p.model}` : ''}` })
        }
        if (p.type === 'content_block_delta' && p.delta?.type === 'text_delta' && p.delta.text) {
          handleStreamText(p.delta.text)
        }
        if (p.type === 'assistant' && p.message?.content) {
          const text = p.message.content.filter((c) => c.type === 'text' && c.text).map((c) => c.text).join('')
          if (text) handleStreamText(text)
        }
        if (p.type === 'result') {
          const raw = p.result ?? ''
          if (isFullSuite) {
            resultContent = raw.trim() || accumulated.trim()
          } else {
            const match = raw.match(/```(?:markdown|md)?\n([\s\S]*?)```/)
            resultContent = match ? match[1].trim() : raw.trim()
          }
          const elapsed = p.duration_ms ? ` (${(p.duration_ms / 1000).toFixed(1)}s)` : ''
          send({ type: 'stage', text: `GenerateDone${elapsed}` })
        }
      } catch { /* skip non-JSON */ }
    })

    let stderr = ''
    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      stderr += text
      const lines = text.split('\n').filter((l: string) => l.trim())
      for (const line of lines) {
        send({ type: 'stage', text: `[CLI] ${line.trim()}` })
      }
    })

    child.on('close', (code) => {
      const finalRaw = resultContent || accumulated.trim()

      log.warn('finalRaw', {
        finalRaw,
      })

      if (isFullSuite) {
        if (!finalRaw) {
          if (code === 0) {
            send({ type: 'error', error: 'Generation completed but no content extracted. Please retry.' })
          } else {
            send({ type: 'error', error: stderr.trim() || `CLI exited with code ${code}` })
          }
          return res.end()
        }
        const parsed = parseFullSuiteResponse(finalRaw)
        log.warn('parsed', {
          parsed,
        })
        if (!parsed.agents) {
          send({
            type: 'error',
            error: 'Failed to parse AGENTS section. Please retry.' + (stderr.trim() ? ` [CLI: ${stderr.trim().slice(0, 200)}]` : ''),
          })
          return res.end()
        }
        send({
          type: 'complete',
          payload: {
            identity: parsed.identity,
            agents: parsed.agents,
            soul: parsed.soul,
            partialError: parsed.partialError,
          },
        })
        return res.end()
      }

      if (resultContent) {
        send({ type: 'complete', content: resultContent })
      } else if (code === 0) {
        send({ type: 'error', error: 'Generation completed but no content extracted. Please retry.' })
      } else {
        send({ type: 'error', error: stderr.trim() || `CLI exited with code ${code}` })
      }
      res.end()
    })

    child.on('error', (err) => {
      send({ type: 'error', error: err.message })
      res.end()
    })

    req.on('close', () => { child.kill('SIGTERM') })
  })

  router.post('/api/agents/generate-avatar', async (req, res) => {
    const { agentId, name, animal } = req.body as {
      agentId?: string
      name?: string
      animal?: string
    }
    if (!agentId || !name || !animal) {
      return res.status(400).json({ error: 'agentId, name and animal are required' })
    }
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(agentId)) {
      return res.status(400).json({ error: 'invalid agentId format' })
    }

    if (!process.env.GEMINI_API_KEY) {
      log.warn('generate-avatar: GEMINI_API_KEY not set', { agentId })
      return res.status(200).json({ ok: false, succeeded: 0, failed: AVATAR_STYLES.length, reason: 'no_api_key' })
    }

    const MAX_RETRIES = 2
    const DELAY_MS = 1500
    let succeeded = 0
    let failed = 0
    const errors: Array<{ style: string; reason: string }> = []

    for (const style of AVATAR_STYLES) {
      const prompt = AVATAR_PROMPT_TEMPLATES[style]({ name, animal })
      let lastError = ''
      let ok = false

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          const buffer = await generateImage(prompt, { timeoutMs: 60000 })
          await saveAvatar(agentId, style, buffer)
          ok = true
          break
        } catch (err) {
          lastError = err instanceof Error ? err.message : String(err)
          log.warn('avatar attempt failed', { agentId, style, attempt, reason: lastError })
          if (attempt < MAX_RETRIES) {
            await new Promise((r) => setTimeout(r, DELAY_MS * (attempt + 1)))
          }
        }
      }

      if (ok) {
        succeeded += 1
      } else {
        failed += 1
        errors.push({ style, reason: lastError })
      }

      if (style !== AVATAR_STYLES[AVATAR_STYLES.length - 1]) {
        await new Promise((r) => setTimeout(r, DELAY_MS))
      }
    }

    res.status(200).json({ ok: true, succeeded, failed, errors })
  })

  router.get('/api/avatars/custom/:agentId/:style', async (req, res) => {
    const { agentId, style } = req.params
    const filePath = await resolveAvatarPath(agentId, style)
    if (!filePath) {
      return res.status(404).json({ error: 'avatar not found' })
    }
    res.setHeader('Content-Type', 'image/png')
    res.setHeader('Cache-Control', 'public, max-age=86400')
    createReadStream(filePath).pipe(res)
  })

  return router
}
