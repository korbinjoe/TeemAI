/**
 * ConfigCompiler - Agent
 *  Agent  +  Claude CLI
 */

import { join, resolve, isAbsolute, dirname } from 'path'
import { readdirSync, statSync } from 'fs'
import { homedir } from 'os'
import { existsSync } from 'fs'
import { readFile, writeFile, unlink, mkdir } from 'fs/promises'
import { randomUUID } from 'crypto'
import type { Agent, AgentPersonality, AgentMemory, McpServerConfig, CliProvider, HooksConfig, HookEntry } from '../config/types'
import { isQoderVendor } from '../config/types'
import type { SkillManager } from '../config/SkillManager'
import type { MemoryStore } from '../stores/MemoryStore'
import type { SkillEvolutionStore } from '../stores/SkillEvolutionStore'
import type { EpisodicMemoryService } from '../services/agent-evolution/EpisodicMemoryService'
import type { EpisodeSearchResult } from '../stores/EpisodeStore'
import type { WhiteboardManager } from '../whiteboard/WhiteboardManager'
import { ContextBriefing } from '../whiteboard/ContextBriefing'
import { isWhiteboardOnDemandEnabled, isCodexAppServerEnabled } from './featureFlags'
import { HooksConfigManager } from './HooksConfigManager'
import { resolveCliCommandAsync } from '../lib/resolveCliCommand'
import { resolveCodexProviderEnv } from '../lib/codexConfigEnv'
import { createLogger } from '../lib/logger'
import { silentlyIgnore } from '../lib/silentlyIgnore'

const log = createLogger('ConfigCompiler')

export interface CompiledAgentConfig {
  command: string
  args: string[]
  env: Record<string, string>
  cwd: string
  settingsPath?: string
  presetSessionId?: string
  /** Codex app-server spawn config; present only when the app-server driver is selected. */
  codex?: import('../terminal/StreamDriver').CodexAppServerSpawnConfig
  cleanup: () => Promise<void>
}

export interface CompileContext {
  repositories: Array<{
    path: string
    worktreePath?: string
  }>
  serverPort: number
  availableExperts?: Array<{
    name: string
    description: string
  }>
  /**  session  Claude session ID */
  resumeSessionId?: string
  connectionId?: string
  skipPermissions?: boolean
  /** ~/.teemai/system/ Agent  */
  sharedWorkspaceDir?: string
  chatId?: string
  /**  Agent  ID fullstack-engineer#1 */
  instanceId?: string
  dispatchChain?: string[]
  previousContext?: {
    agentName: string
    lastMessage?: string
    jsonlPath?: string
  }
}

export class ConfigCompiler {
  private static codexFileLocks = new Map<string, Promise<void>>()
  private _projectRoot: string

  constructor(
    private skillManager: SkillManager,
    private hooksConfigManager: HooksConfigManager,
    private memoryStore?: MemoryStore,
    _unused?: unknown,
    projectRoot?: string,
    /**
     * WhiteboardManager  ——
     *  snapshot  system prompt  agentInstanceId  cursor
     *  latestSeq PostToolUse hook  diff
     *  ExpertLifecycle.briefing.maybeWrapTask
     */
    private whiteboardManager?: WhiteboardManager,
    private skillEvolutionStore?: SkillEvolutionStore,
    private episodicMemoryService?: EpisodicMemoryService,
  ) {
    this._projectRoot = projectRoot || process.cwd()
  }

  private get projectRoot(): string {
    return this._projectRoot
  }

  /**
   * @param llmEnv  agent.model
   *    settings.json  env  teemai UI  model/
   *    ~/.claude/settings.jsonCodex provider  settings.json
   */
  async compile(
    agent: Agent,
    context: CompileContext,
    provider?: CliProvider,
    llmEnv?: Record<string, string>,
  ): Promise<CompiledAgentConfig> {
    const effectiveProvider: CliProvider = provider || 'claude'
    switch (effectiveProvider) {
      case 'codex':
        return this.compileForCodex(agent, context)
      case 'claude':
      case 'acp':
      case 'qoder':
      case 'qodercli':
        break
      default: {
        const _exhaustive: never = effectiveProvider
        throw new Error(`Unknown CLI provider: ${_exhaustive}`)
      }
    }

    const args: string[] = []
    const env: Record<string, string> = {}
    const cleanupFns: Array<() => Promise<void>> = []

    const cwd = this.resolveCwd(context)

    const systemHooks = this.collectSkillHooks(agent)

    const envOverrides: Record<string, string> = { ...(llmEnv || {}) }
    if (agent.model) {
      envOverrides.ANTHROPIC_MODEL = agent.model
    }

    // ── Step 0: Resume Mode ──
    if (context.resumeSessionId) {
      args.push('--resume', context.resumeSessionId)
      args.push('--print', '--verbose')
      args.push('--output-format', 'stream-json')
      args.push('--input-format', 'stream-json')
      args.push('--include-partial-messages')
      args.push('--replay-user-messages')

      const envSkipPerms = process.env.TEEMAI_SKIP_PERMISSIONS === 'true'
      if (context.skipPermissions === true || envSkipPerms) {
        args.push('--dangerously-skip-permissions')
      }
      const resumeSessionKey = `resume-${Date.now()}`
      const resumeSettingsPath = await this.hooksConfigManager.writeConfig(
        resumeSessionKey,
        agent.hooks,
        [cwd, this.projectRoot],
        systemHooks,
        envOverrides,
      )
      args.push('--settings', resumeSettingsPath)

      const resumeEnv: Record<string, string> = {}
      if (context.chatId) resumeEnv.TEEMAI_CHAT_ID = context.chatId
      if (context.instanceId) resumeEnv.TEEMAI_INSTANCE_ID = context.instanceId
      resumeEnv.AGENT_API_BASE = `http://localhost:${context.serverPort}`
      resumeEnv.EXPERT_CONNECTION_ID = context.connectionId || ''

      await this.writeEnvFile(context, resumeEnv)

      return {
        command: isQoderVendor(effectiveProvider) ? 'qodercli' : 'claude',
        args,
        env: resumeEnv,
        cwd,
        cleanup: async () => {
          await silentlyIgnore(() => this.hooksConfigManager.cleanup(resumeSessionKey), 'hooks cleanup for resume session')
        },
      }
    }

    args.push('--dangerously-skip-permissions')

    for (const repo of context.repositories) {
      const dir = repo.worktreePath || repo.path
      args.push('--add-dir', dir)
    }

    const promptContent = this.buildPromptContent(agent, context)

    if (promptContent.trim()) {
      if (agent.systemPrompt.mode === 'replace') {
        args.push('--system-prompt', promptContent)
      } else {
        args.push('--append-system-prompt', promptContent)
      }
    }

    if (agent.allowedTools?.length) {
      for (const tool of agent.allowedTools) {
        if (tool.startsWith('mcp__handoff__')) continue
        args.push('--allowedTools', tool)
      }
      if (!agent.allowedTools.includes('AskUserQuestion')) {
        args.push('--allowedTools', 'AskUserQuestion')
      }
      if (agent.mcpServers?.playwright) {
        const playwrightTools = [
          'mcp__playwright__browser_navigate',
          'mcp__playwright__browser_snapshot',
          'mcp__playwright__browser_click',
          'mcp__playwright__browser_type',
          'mcp__playwright__browser_go_back',
          'mcp__playwright__browser_wait',
          'mcp__playwright__browser_close',
          'mcp__playwright__browser_screenshot',
          'mcp__playwright__browser_tab_list',
          'mcp__playwright__browser_tab_new',
          'mcp__playwright__browser_tab_close',
        ]
        for (const tool of playwrightTools) {
          if (!agent.allowedTools.includes(tool)) {
            args.push('--allowedTools', tool)
          }
        }
      }
    }
    if (agent.disallowedTools?.length) {
      for (const tool of agent.disallowedTools) {
        args.push('--disallowedTools', tool)
      }
    }
    for (const tool of ['EnterPlanMode', 'ExitPlanMode']) {
      args.push('--disallowedTools', tool)
    }
    if (agent.model) {
      args.push('--model', agent.model)
    }
    if (agent.maxTurns) {
      args.push('--max-turns', String(agent.maxTurns))
    }

    const presetSessionId = randomUUID()

    if (context.chatId) {
      env.TEEMAI_CHAT_ID = context.chatId
    }
    if (context.instanceId) {
      env.TEEMAI_INSTANCE_ID = context.instanceId
    }
    if (context.dispatchChain?.length) {
      env.TEEMAI_DISPATCH_CHAIN = JSON.stringify(context.dispatchChain)
    }

    const mcpServers: Record<string, McpServerConfig> = {
      ...(agent.mcpServers || {}),
    }

    env.AGENT_API_BASE = `http://localhost:${context.serverPort}`
    env.EXPERT_CONNECTION_ID = context.connectionId || ''
    if (context.availableExperts?.length) {
      env.AVAILABLE_EXPERTS = JSON.stringify(context.availableExperts)
    }

    for (const srv of Object.values(mcpServers)) {
      if (srv.args?.length) {
        srv.args = srv.args.map(a => (!isAbsolute(a) && a.includes('/') && !a.includes('://') && !a.startsWith('@')) ? resolve(this.projectRoot, a) : a)
      }
    }

    for (const srv of Object.values(mcpServers)) {
      if (srv.command === 'npx' && srv.args?.[0] === 'tsx') {
        const tsxDist = join(this.projectRoot, 'node_modules', 'tsx', 'dist')
        const preflight = join(tsxDist, 'preflight.cjs')
        const loader = join(tsxDist, 'esm', 'index.mjs')
        const scriptArgs = srv.args.slice(1)
        const resolvedNode = await resolveCliCommandAsync('node') || process.execPath
        srv.command = resolvedNode
        if (existsSync(preflight) && existsSync(loader)) {
          srv.args = ['--require', preflight, '--import', `file://${loader}`, ...scriptArgs]
        } else {
          srv.args = ['--experimental-strip-types', ...scriptArgs]
        }
      }
    }

    if (Object.keys(mcpServers).length > 0) {
      const mcpConfig = JSON.stringify({ mcpServers })
      args.push('--mcp-config', mcpConfig)
    }

    // ── Step 5: Hooks + env Override ──
    const sessionKey = `${agent.name}-${Date.now()}`
    const settingsPath = await this.hooksConfigManager.writeConfig(
      sessionKey,
      agent.hooks,
      [cwd, this.projectRoot],
      systemHooks,
      envOverrides,
    )
    args.push('--settings', settingsPath)
    cleanupFns.push(() => this.hooksConfigManager.cleanup(sessionKey))

    // ── Step 6: stream-json ModeParameters（Claude provider DefaultEnable） ──
    args.push('--print', '--verbose')
    args.push('--output-format', 'stream-json')
    args.push('--input-format', 'stream-json')
    args.push('--include-partial-messages')
    args.push('--replay-user-messages')

    await this.writeEnvFile(context, env)

    return {
      command: isQoderVendor(effectiveProvider) ? 'qodercli' : 'claude',
      args,
      env,
      cwd,
      settingsPath,
      presetSessionId,
      cleanup: async () => {
        for (const fn of cleanupFns) {
          await silentlyIgnore(fn, 'config compile cleanup')
        }
      },
    }
  }

  private async compileForCodex(agent: Agent, context: CompileContext): Promise<CompiledAgentConfig> {
    const args: string[] = []
    const cleanupFns: Array<() => Promise<void>> = []
    const appServer = isCodexAppServerEnabled()

    if (appServer) {
      // Long-lived stdio JSON-RPC server: spawn params (model, resume, sandbox)
      // are passed at the protocol layer (CodexAppServerManager), not as argv.
      args.push('app-server', '--stdio')
      args.push('-c', 'skills.include_instructions=false')
    } else {
      if (context.resumeSessionId) {
        args.push('exec', 'resume', context.resumeSessionId, '-')
      } else {
        args.push('exec')
      }
      args.push('--json')
      args.push('--dangerously-bypass-approvals-and-sandbox')
      args.push('-c', 'skills.include_instructions=false')

      if (agent.model) {
        args.push('--model', agent.model)
      }
    }

    const promptContent = this.buildPromptContent(agent, context)

    const cwd = this.resolveCwd(context)

    if (promptContent.trim()) {
      const codexHome = resolve(homedir(), '.codex')
      await mkdir(codexHome, { recursive: true })
      const overridePath = join(codexHome, 'AGENTS.override.md')

      let userOriginal: string | null = null
      await this.withCodexFileLock(overridePath, async () => {
        let fileContent: string | null = null
        try {
          fileContent = await readFile(overridePath, 'utf-8')
        } catch {
        }

        const TEEMAI_MARKER = '<!-- TeemAI Agent Instructions -->'
        userOriginal = fileContent !== null
          ? fileContent.split(TEEMAI_MARKER)[0].trimEnd()
          : null

        const newContent = userOriginal
          ? `${userOriginal}\n\n${TEEMAI_MARKER}\n${promptContent}`
          : promptContent

        await writeFile(overridePath, newContent, 'utf-8')
      })
      log.info('Wrote ~/.codex/AGENTS.override.md', { agentName: agent.name })

      cleanupFns.push(async () => {
        try {
          await this.withCodexFileLock(overridePath, async () => {
            if (userOriginal) {
              await writeFile(overridePath, userOriginal, 'utf-8')
            } else {
              await unlink(overridePath)
            }
          })
          log.info('Cleaned up ~/.codex/AGENTS.override.md', { agentName: agent.name })
        } catch {
        }
      })
    }

    const codexHooks = this.buildCodexHooksJson(agent)
    if (codexHooks) {
      const codexDir = join(cwd, '.codex')
      await mkdir(codexDir, { recursive: true })
      const codexHooksPath = join(codexDir, 'hooks.json')

      let existingContent: string | null = null
      await this.withCodexFileLock(codexHooksPath, async () => {
        try {
          existingContent = await readFile(codexHooksPath, 'utf-8')
        } catch { /* Filedoes not exist */ }

        const merged = this.mergeCodexHooks(existingContent, codexHooks)

        await writeFile(codexHooksPath, JSON.stringify(merged, null, 2), 'utf-8')
      })
      log.info('Wrote .codex/hooks.json', { agentName: agent.name })
      const ownedCommandKeys = this.codexHookCommandKeys(codexHooks.hooks.Stop)
      cleanupFns.push(async () => {
        try {
          await this.withCodexFileLock(codexHooksPath, async () => {
            let currentContent: string | null = null
            try {
              currentContent = await readFile(codexHooksPath, 'utf-8')
            } catch {
            }
            if (!currentContent) return

            const cleaned = this.removeCodexHooksByCommandKeys(currentContent, ownedCommandKeys)
            if (cleaned) {
              await writeFile(codexHooksPath, cleaned, 'utf-8')
            } else {
              await unlink(codexHooksPath)
            }
          })
        } catch { /* cleanup best-effort */ }
      })
    }

    // --session-id, --allowedTools, --mcp-config, --settings, --resume

    const env: Record<string, string> = {}
    env.AGENT_API_BASE = `http://localhost:${context.serverPort}`
    if (context.chatId) env.TEEMAI_CHAT_ID = context.chatId
    if (context.instanceId) env.TEEMAI_INSTANCE_ID = context.instanceId
    if (context.connectionId) env.EXPERT_CONNECTION_ID = context.connectionId

    const codexProviderEnv = await resolveCodexProviderEnv(cwd)
    Object.assign(env, codexProviderEnv)

    return {
      command: 'codex',
      args,
      env,
      cwd,
      ...(appServer ? { codex: { model: agent.model } } : {}),
      cleanup: async () => {
        for (const fn of cleanupFns) {
          await silentlyIgnore(fn, 'config compile cleanup')
        }
      },
    }
  }

  private buildCodexHooksJson(agent: Agent): { hooks: { Stop: unknown[] } } | null {
    const systemHooks = this.collectSkillHooks(agent)
    if (!systemHooks?.Stop?.length) return null

    const stopEntries = systemHooks.Stop.map((entry) => ({
      hooks: entry.hooks.map((h) => ({
        type: h.type,
        command: h.command,
        ...(h.timeout ? { timeout: h.timeout } : {}),
      })),
    }))

    return { hooks: { Stop: stopEntries } }
  }

  private mergeCodexHooks(
    existingContent: string | null,
    codexHooks: { hooks: { Stop: unknown[] } },
  ): { hooks: Record<string, unknown[]> } {
    const existingHooks = this.parseCodexHooks(existingContent)
    const ownedCommandKeys = this.codexHookCommandKeys(codexHooks.hooks.Stop)
    const existingStop = existingHooks.Stop ?? []
    const stopWithoutOwned = this.filterCodexHookEntries(existingStop, ownedCommandKeys)

    return {
      hooks: {
        ...existingHooks,
        Stop: this.dedupeCodexHookEntries([...stopWithoutOwned, ...codexHooks.hooks.Stop]),
      },
    }
  }

  private parseCodexHooks(content: string | null): Record<string, unknown[]> {
    if (!content) return {}

    try {
      const parsed = JSON.parse(content) as { hooks?: unknown }
      if (!parsed.hooks || typeof parsed.hooks !== 'object' || Array.isArray(parsed.hooks)) {
        return {}
      }

      const hooks: Record<string, unknown[]> = {}
      for (const [event, entries] of Object.entries(parsed.hooks)) {
        if (Array.isArray(entries)) hooks[event] = entries
      }
      return hooks
    } catch {
      return {}
    }
  }

  private removeCodexHooksByCommandKeys(content: string, commandKeys: Set<string>): string | null {
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(content) as Record<string, unknown>
    } catch {
      return content
    }

    const existingHooks = this.parseCodexHooks(content)
    const cleanedHooks: Record<string, unknown[]> = { ...existingHooks }
    cleanedHooks.Stop = this.filterCodexHookEntries(cleanedHooks.Stop ?? [], commandKeys)
    if (cleanedHooks.Stop.length === 0) delete cleanedHooks.Stop

    if (Object.keys(cleanedHooks).length === 0) {
      delete parsed.hooks
    } else {
      parsed.hooks = cleanedHooks
    }

    if (Object.keys(parsed).length === 0) return null
    return JSON.stringify(parsed, null, 2)
  }

  private filterCodexHookEntries(entries: unknown[], commandKeys: Set<string>): unknown[] {
    const filtered: unknown[] = []

    for (const entry of entries) {
      if (!this.isRecord(entry) || !Array.isArray(entry.hooks)) {
        filtered.push(entry)
        continue
      }

      const hooks = entry.hooks.filter((hook) => {
        if (!this.isRecord(hook)) return true
        const key = this.codexHookCommandKey(hook.command)
        return !key || !commandKeys.has(key)
      })
      if (hooks.length > 0) filtered.push({ ...entry, hooks })
    }

    return filtered
  }

  private dedupeCodexHookEntries(entries: unknown[]): unknown[] {
    const deduped: unknown[] = []
    const seen = new Set<string>()

    for (const entry of entries) {
      if (!this.isRecord(entry) || !Array.isArray(entry.hooks)) {
        deduped.push(entry)
        continue
      }

      const hooks = entry.hooks.filter((hook) => {
        if (!this.isRecord(hook)) return true
        const key = this.codexHookCommandKey(hook.command)
        if (!key) return true
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      if (hooks.length > 0) deduped.push({ ...entry, hooks })
    }

    return deduped
  }

  private codexHookCommandKeys(entries: unknown[]): Set<string> {
    const keys = new Set<string>()
    for (const entry of entries) {
      if (!this.isRecord(entry) || !Array.isArray(entry.hooks)) continue
      for (const hook of entry.hooks) {
        if (!this.isRecord(hook)) continue
        const key = this.codexHookCommandKey(hook.command)
        if (key) keys.add(key)
      }
    }
    return keys
  }

  private codexHookCommandKey(command: unknown): string | null {
    if (typeof command !== 'string') return null
    const normalized = command.trim()
    const teemaiHook = normalized.match(/(?:^|[\s/])(wb-auto-extract\.sh|satisfaction-score\.sh|render-perf-auto\.sh)(?:\s|$)/)
    return teemaiHook ? `teemai:${teemaiHook[1]}` : normalized
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value)
  }

  private async withCodexFileLock<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
    const prev = ConfigCompiler.codexFileLocks.get(filePath) ?? Promise.resolve()
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const currentLock = prev.then(() => gate)
    ConfigCompiler.codexFileLocks.set(filePath, currentLock)

    await prev
    try {
      return await fn()
    } finally {
      release()
      if (ConfigCompiler.codexFileLocks.get(filePath) === currentLock) {
        ConfigCompiler.codexFileLocks.delete(filePath)
      }
    }
  }

  /** base prompt + skills + personality + memory +  */
  private buildPromptContent(agent: Agent, context?: CompileContext): string {
    let content = agent.systemPrompt?.content || ''

    const allSkillDirs = this.skillManager.listSkills()
      .map((s) => this.skillManager.getSkillDir(s.name))
      .filter((d): d is string => !!d)
    const scriptToDir = new Map<string, string>()
    for (const dir of allSkillDirs) {
      const scriptsDir = join(dir, 'scripts')
      try {
        for (const entry of readdirSync(scriptsDir)) {
          if (statSync(join(scriptsDir, entry)).isFile()) {
            if (scriptToDir.has(entry)) {
              log.warn('Duplicate skill script name', { script: entry, kept: scriptToDir.get(entry), skipped: dir })
              continue
            }
            scriptToDir.set(entry, dir)
          }
        }
      } catch { /* scripts dir may not exist */ }
    }

    content = this.substituteSkillDirInAgentPrompt(content, scriptToDir)

    const skillNames = Array.from(new Set([...(agent.skills ?? []), 'whiteboard']))
    const skillContents: string[] = []
    for (const name of skillNames) {
      const skill = this.skillManager.getSkill(name)
      const dir = this.skillManager.getSkillDir(name)
      if (!skill || !dir) continue
      this.skillEvolutionStore?.bumpUse(name)
      skillContents.push(skill.content.replaceAll('{SKILL_DIR}', dir))
    }
    if (skillContents.length > 0) {
      content += '\n\n' + skillContents.join('\n\n')
    }

    if (agent.personality) {
      content += this.buildPersonalityPrompt(agent.personality)
    }

    if (this.memoryStore) {
      const memoryPrompt = this.buildMemoryPrompt(agent.id, agent.name)
      if (memoryPrompt) content += memoryPrompt
    }

    const episodePrompt = this.buildPriorEpisodesPrompt(agent, context)
    if (episodePrompt) content += episodePrompt

    if (agent.workspaceDir) {
      const today = this.formatToday()
      content += `\n\n## Workspace Path\n\nYour workspace absolute path：\`${agent.workspaceDir}\`\nWhen writing memory files, use absolute paths：\n- Today's log → \`${agent.workspaceDir}/memory/${today}.md\`\n- Long-term memory → \`${agent.workspaceDir}/MEMORY.md\``
    }

    if (context?.chatId && context?.instanceId) {
      const isDispatcher = !!(agent.subAgentNames && agent.subAgentNames.length > 0)
      content += this.buildMailboxProtocolPrompt(context.chatId, context.instanceId, isDispatcher)
    }

    if (context?.previousContext) {
      const { agentName, lastMessage, jsonlPath } = context.previousContext
      let block = `\n\n## Previous Agent Context\n\nThe previous colleague ${agentName} just worked in this session.\n`
      if (lastMessage) {
        block += `\nTheir last message：\n---\n${lastMessage}\n---\n`
      }
      if (jsonlPath) {
        block += `\nIf you need more context, you can read the full conversation record file：\`${jsonlPath}\`\n`
      }
      content += block
    }

    if (
      this.whiteboardManager
      && context?.chatId
      && isWhiteboardOnDemandEnabled()
    ) {
      try {
        const briefing = new ContextBriefing(this.whiteboardManager)
        const brief = briefing.buildForAgent({
          chatId: context.chatId,
          agentId: agent.id,
          agentName: agent.name,
          agentTags: agent.tags,
        })
        if (brief.trim()) {
          content += `\n\n---\n\n${brief}`
        }
        if (context.instanceId) {
          this.whiteboardManager.setCursor(
            context.chatId,
            context.instanceId,
            this.whiteboardManager.getLatestSeq(context.chatId),
          )
        }
      } catch (err) {
        log.warn('whiteboard briefing injection failed', {
          chatId: context.chatId,
          agentId: agent.id,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    return content
  }

  /**
   *  agent prompt  `{SKILL_DIR}/scripts/<scriptName>`  skill
   *  scriptName
   */
  private async writeEnvFile(context: CompileContext, env: Record<string, string>): Promise<void> {
    if (!context.chatId || !context.instanceId) return
    const envDir = join(homedir(), '.teemai', 'tmp', 'env')
    await mkdir(envDir, { recursive: true })
    const envPath = join(envDir, `${context.chatId}-${context.instanceId}.env`)
    const keys = ['AGENT_API_BASE', 'TEEMAI_CHAT_ID', 'TEEMAI_INSTANCE_ID', 'EXPERT_CONNECTION_ID']
    const lines = keys
      .filter(k => env[k] !== undefined)
      .map(k => `export ${k}="${env[k]}"`)
    await writeFile(envPath, lines.join('\n') + '\n', 'utf-8')
  }

  private substituteSkillDirInAgentPrompt(
    content: string,
    scriptToDir: Map<string, string>,
  ): string {
    return content.replace(/\{SKILL_DIR\}\/scripts\/([\w.\-]+)/g, (match, scriptName) => {
      const dir = scriptToDir.get(scriptName)
      if (!dir) {
        log.warn('Unresolved {SKILL_DIR} placeholder in agent prompt', { scriptName })
        return match
      }
      return `${dir}/scripts/${scriptName}`
    })
  }

  private formatToday(): string {
    const d = new Date()
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  private resolveCwd(context: CompileContext): string {
    const primary = context.repositories[0]
    if (!primary) return process.cwd()
    return primary.worktreePath || primary.path
  }

  /**
   *  agent  skills  hooksSKILL.md frontmatter hooks
   * whiteboard  agent prompt
   */
  private collectSkillHooks(agent: Agent): HooksConfig | undefined {
    const skillNames = Array.from(new Set([...(agent.skills ?? []), 'whiteboard']))
    const merged: HooksConfig = {}
    const events = ['PreToolUse', 'PostToolUse', 'Notification', 'Stop'] as const

    for (const name of skillNames) {
      const skill = this.skillManager.getSkill(name)
      if (!skill?.hooks) continue
      for (const event of events) {
        const cmds = skill.hooks[event]
        if (!cmds?.length) continue
        const entries: HookEntry[] = cmds.map((c) => ({
          ...(c.matcher ? { matcher: c.matcher } : {}),
          hooks: [{ type: 'command' as const, command: c.command, ...(c.timeout ? { timeout: c.timeout } : {}) }],
        }))
        merged[event] = [...(merged[event] ?? []), ...entries]
      }
    }

    return Object.keys(merged).length ? merged : undefined
  }

  private buildMemoryPrompt(agentId: string, legacyAgentName?: string): string | null {
    if (!this.memoryStore) return null
    const memories = this.getPromptMemories(agentId, legacyAgentName, 20)
    if (memories.length === 0) return null

    const grouped = memories.reduce<Record<string, AgentMemory[]>>((acc, m) => {
      if (!acc[m.category]) acc[m.category] = []
      acc[m.category].push(m)
      return acc
    }, {})

    let prompt = '\n\n## Cross-Session Memory\n\nBelow are memories accumulated from your past interactions. Use them as reference：\n'
    for (const [category, items] of Object.entries(grouped)) {
      prompt += `\n### ${category}\n`
      for (const m of items) {
        prompt += `- ${m.content}\n`
      }
    }
    return prompt
  }

  private getPromptMemories(agentId: string, legacyAgentName?: string, limit = 20): AgentMemory[] {
    if (!this.memoryStore) return []

    const memories: AgentMemory[] = []
    const seen = new Set<string>()
    const add = (items: AgentMemory[]) => {
      for (const item of items) {
        const dedupKey = item.source ? `source:${item.source}` : `id:${item.id}`
        if (seen.has(dedupKey)) continue
        seen.add(dedupKey)
        memories.push(item)
        if (memories.length >= limit) return
      }
    }

    add(this.memoryStore.getForPromptInjection(agentId, limit))
    if (memories.length < limit && legacyAgentName && legacyAgentName !== agentId) {
      add(this.memoryStore.getForPromptInjection(legacyAgentName, limit))
    }

    return memories
  }

  private buildPriorEpisodesPrompt(agent: Agent, context?: CompileContext): string | null {
    if (!this.episodicMemoryService) return null
    const query = [
      context?.previousContext?.lastMessage,
      agent.description,
      agent.systemPrompt?.content?.slice(0, 500),
    ].filter(Boolean).join('\n')
    if (!query.trim()) return null

    const episodes = this.episodicMemoryService.search(agent.id, query, 3)
      .filter((episode) => episode.outcome !== 'failed' && episode.outcome !== 'blocked' || !!episode.hasLesson)
    if (episodes.length === 0) return null
    return this.formatPriorEpisodes(episodes)
  }

  private formatPriorEpisodes(episodes: EpisodeSearchResult[]): string {
    let prompt = '\n\n## Prior Similar Episodes\n\n'
    for (const [idx, episode] of episodes.entries()) {
      const files = episode.files.length > 0 ? `, files: ${episode.files.slice(0, 3).join(', ')}` : ''
      const completedAt = episode.completedAt ?? episode.startedAt
      prompt += `${idx + 1}. [${episode.outcome}] ${episode.title}\n`
      prompt += `   Source: mission ${episode.missionId}, ${completedAt}${files}\n`
      prompt += `   Lesson: ${episode.summary}\n`
    }
    return prompt.length > 1200 ? `${prompt.slice(0, 1190).trimEnd()}\n...` : prompt
  }

  private buildMailboxProtocolPrompt(chatId: string, instanceId: string, isDispatcher = false): string {
    return `

## Task Communication Protocol

### Execution Plan（plan.md）
After accepting a task, create an execution plan at \`~/.teemai/tasks/{taskId}/plan.md\` ：
- After each sub-step, update plan.md to check it off
- After context compression, re-read plan.md to restore progress
- When blocked, record the reason in plan.md's 'Blockers' section
- When task is done, generate final result from plan.md`
  }

  private buildPersonalityPrompt(p: AgentPersonality): string {
    const toneGuide = {
      formal: 'Use a formal, professional tone, list key points clearly',
      casual: 'Communicate in a relaxed natural tone, like chatting with a colleague',
      playful: 'Communicate with a lively and fun tone, add light-hearted expressions',
    }
    const verbosityGuide = {
      concise: 'Report results in the shortest sentences, omit process details',
      moderate: 'Describe key steps and results adequately without over-expanding',
      detailed: 'Explain thought process and decision rationale for each step in detail',
    }

    return `

## Communication Style

Your short name is"${p.nickname}"（${p.emoji}），${p.persona}。
Follow this communication style：
- ${toneGuide[p.tone]}
- ${verbosityGuide[p.verbosity]}
- Briefly describe what was done and key outputs when completing tasks
- When collaborating with other agents, use their short names
- When encountering decisions that need user input, give your recommendation then ask`
  }
}
