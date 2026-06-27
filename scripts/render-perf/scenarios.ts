import { execFileSync } from 'child_process'
import type { Page } from 'playwright'
import type { RenderPerfScenario, ScenarioContext } from './types'

const CORE_SMOKE = ['home.initial', 'workspace.initial', 'mission.initial', 'mission.switch.warm']

export const DEFAULT_SCENARIOS = [
  ...CORE_SMOKE,
  'mission.mode-toggle.loop',
  'mission.switch-with-terminal-active',
]

export const scenarios: RenderPerfScenario[] = [
  {
    id: 'home.initial',
    label: 'Workspace home initial render',
    tags: ['core', 'home', 'initial'],
    changedFileGlobs: ['web/components/home/**', 'web/components/workspace/**', 'web/App.tsx'],
    budgets: ['home.initial'],
    run: async (ctx) => {
      await ctx.page.goto(`${ctx.fixture.uiBase}/workspace/${ctx.fixture.workspaceId}`, { waitUntil: 'domcontentloaded' })
      await waitForSurface(ctx.page, 'workspace-layout')
      await waitForSurface(ctx.page, 'workspace-home')
      await ctx.waitForRenderIdle()
    },
  },
  {
    id: 'workspace.initial',
    label: 'Workspace shell initial render',
    tags: ['core', 'workspace', 'initial'],
    changedFileGlobs: ['web/components/workspace/**', 'web/layouts/WorkspaceLayout.tsx', 'web/App.tsx'],
    budgets: ['workspace.initial'],
    run: async (ctx) => {
      await ctx.page.goto(`${ctx.fixture.uiBase}/workspace/${ctx.fixture.workspaceId}`, { waitUntil: 'domcontentloaded' })
      await waitForSurface(ctx.page, 'workspace-layout')
      await waitForSurface(ctx.page, 'mission-sidebar')
      await ctx.waitForRenderIdle()
    },
  },
  {
    id: 'mission.initial',
    label: 'Mission direct route initial render',
    tags: ['core', 'mission', 'initial'],
    changedFileGlobs: ['web/components/chat/**', 'web/hooks/useChat*', 'web/hooks/useAgent*', 'web/components/workspace/**'],
    budgets: ['mission.initial'],
    run: async (ctx) => {
      const missionId = ctx.fixture.missionIds[0]
      await ctx.page.goto(missionUrl(ctx, missionId), { waitUntil: 'domcontentloaded' })
      await waitForChat(ctx.page, missionId)
      await ctx.waitForRenderIdle()
    },
  },
  {
    id: 'mission.switch.warm',
    label: 'Warm mission switching',
    tags: ['core', 'mission', 'switch'],
    changedFileGlobs: ['web/components/workspace/**', 'web/components/chat/**', 'web/hooks/useWorkspaceMissions.ts'],
    budgets: ['mission.switch.warm'],
    run: async (ctx) => {
      await warmMissions(ctx)
      for (const missionId of ctx.fixture.missionIds.slice(0, 4)) {
        await ctx.measureInteraction(`switch-${short(missionId)}`, async () => clickMission(ctx.page, ctx, missionId), async () => {
          await waitForChat(ctx.page, missionId)
        })
      }
      await ctx.waitForRenderIdle()
    },
  },
  {
    id: 'mission.multi-active.switch-loop',
    label: 'Multi-mission repeated switch loop',
    tags: ['mission', 'switch', 'loop', 'terminal'],
    changedFileGlobs: ['web/components/workspace/**', 'web/components/chat/**', 'web/hooks/useAgent*', 'web/hooks/useChat*'],
    budgets: ['mission.multi-active.switch-loop'],
    run: async (ctx) => {
      await warmMissions(ctx)
      const ids = ctx.fixture.missionIds.slice(0, 4)
      for (let round = 0; round < 5; round++) {
        for (const missionId of ids) {
          await ctx.measureInteraction(`loop-${round}-${short(missionId)}`, async () => clickMission(ctx.page, ctx, missionId), async () => {
            await waitForChat(ctx.page, missionId)
          })
        }
      }
      await ctx.waitForRenderIdle()
    },
  },
  {
    id: 'mission.mode-toggle.loop',
    label: 'Chat and terminal mode toggle loop',
    tags: ['mission', 'terminal', 'loop'],
    changedFileGlobs: ['web/components/terminal/**', 'web/components/chat/**', 'web/hooks/useChatViewMode.ts'],
    budgets: ['mission.mode-toggle.loop'],
    run: async (ctx) => {
      const missionId = ctx.fixture.missionIds[0]
      await ctx.page.goto(missionUrl(ctx, missionId), { waitUntil: 'domcontentloaded' })
      await waitForChat(ctx.page, missionId)
      for (let i = 0; i < 5; i++) {
        await ctx.measureInteraction(`terminal-on-${i}`, async () => toggleViewMode(ctx.page, 'terminal'), async () => waitForTerminal(ctx.page))
        await ctx.measureInteraction(`message-on-${i}`, async () => toggleViewMode(ctx.page, 'message'), async () => waitForMessageMode(ctx.page))
      }
      await ctx.waitForRenderIdle()
    },
  },
  {
    id: 'mission.switch-with-terminal-active',
    label: 'Switch away and back with terminal active',
    tags: ['mission', 'terminal', 'switch'],
    changedFileGlobs: ['web/components/terminal/**', 'web/components/chat/**', 'web/components/workspace/**'],
    budgets: ['mission.switch-with-terminal-active'],
    run: async (ctx) => {
      const [terminalMission, chatMission] = ctx.fixture.missionIds
      await ctx.page.goto(missionUrl(ctx, terminalMission), { waitUntil: 'domcontentloaded' })
      await waitForChat(ctx.page, terminalMission)
      await toggleViewMode(ctx.page, 'terminal')
      await waitForTerminal(ctx.page)
      await ctx.measureInteraction('switch-away-from-terminal', async () => clickMission(ctx.page, ctx, chatMission), async () => waitForChat(ctx.page, chatMission))
      await ctx.measureInteraction('restore-terminal-mission', async () => clickMission(ctx.page, ctx, terminalMission), async () => waitForTerminal(ctx.page))
      await ctx.waitForRenderIdle()
    },
  },
  {
    id: 'mission.message-stress',
    label: 'Mission message surface stress',
    tags: ['mission', 'stress'],
    changedFileGlobs: ['web/components/chat/**', 'web/hooks/useAgentMessages.ts', 'web/hooks/useAgentEvents.ts'],
    budgets: ['mission.message-stress'],
    run: async (ctx) => {
      const missionId = ctx.fixture.missionIds[0]
      await ctx.page.goto(missionUrl(ctx, missionId), { waitUntil: 'domcontentloaded' })
      await waitForChat(ctx.page, missionId)
      await ctx.page.mouse.wheel(0, 1200)
      await ctx.page.mouse.wheel(0, -1200)
      await ctx.waitForRenderIdle()
    },
  },
  {
    id: 'mission.filter-search',
    label: 'Mission sidebar search and filter',
    tags: ['mission', 'interaction'],
    changedFileGlobs: ['web/components/workspace/MissionSidebar.tsx', 'web/components/workspace/MissionSessionList.tsx'],
    budgets: ['mission.filter-search'],
    run: async (ctx) => {
      await ctx.page.goto(`${ctx.fixture.uiBase}/workspace/${ctx.fixture.workspaceId}`, { waitUntil: 'domcontentloaded' })
      await waitForSurface(ctx.page, 'mission-sidebar')
      await ctx.measureInteraction('search-missions', async () => {
        await ctx.page.getByRole('button', { name: 'Search missions' }).click()
        await ctx.page.getByRole('textbox', { name: 'Search missions' }).fill('Perf Mission')
      }, async () => ctx.page.locator('[data-mission-id]').first().waitFor({ state: 'visible', timeout: 10_000 }))
    },
  },
  {
    id: 'terminal.open',
    label: 'Terminal view opens',
    tags: ['terminal'],
    changedFileGlobs: ['web/components/terminal/**', 'web/components/chat/ChatViewModeToggle.tsx'],
    budgets: ['terminal.open'],
    run: async (ctx) => {
      const missionId = ctx.fixture.missionIds[0]
      await ctx.page.goto(missionUrl(ctx, missionId), { waitUntil: 'domcontentloaded' })
      await waitForChat(ctx.page, missionId)
      await ctx.measureInteraction('open-terminal', async () => toggleViewMode(ctx.page, 'terminal'), async () => waitForTerminal(ctx.page))
    },
  },
  {
    id: 'ide.open',
    label: 'IDE panel opens',
    tags: ['ide'],
    changedFileGlobs: ['web/components/ide/**', 'web/components/workspace/IDEPanel.tsx'],
    budgets: ['ide.open'],
    run: async (ctx) => {
      const missionId = ctx.fixture.missionIds[0]
      await ctx.page.goto(missionUrl(ctx, missionId), { waitUntil: 'domcontentloaded' })
      await waitForChat(ctx.page, missionId)
      await waitForSurface(ctx.page, 'ide-panel')
      await ctx.waitForRenderIdle()
    },
  },
  {
    id: 'settings.keys',
    label: 'Settings render',
    tags: ['settings'],
    changedFileGlobs: ['web/components/settings/**', 'web/pages/SettingsPage.tsx'],
    budgets: ['settings.keys'],
    run: async (ctx) => {
      await ctx.page.goto(`${ctx.fixture.uiBase}/settings`, { waitUntil: 'domcontentloaded' })
      await waitForSurface(ctx.page, 'settings-page')
      await ctx.waitForRenderIdle()
    },
  },
]

export const getScenariosById = (ids: string[]): RenderPerfScenario[] => {
  const map = new Map(scenarios.map((scenario) => [scenario.id, scenario]))
  return ids.map((id) => {
    const scenario = map.get(id)
    if (!scenario) throw new Error(`Unknown render perf scenario: ${id}`)
    return scenario
  })
}

export const selectScenarioIds = (opts: { scenarios?: string[]; tags?: string[]; changed?: boolean }): string[] => {
  if (opts.scenarios?.length) return unique(opts.scenarios)
  if (opts.tags?.length) {
    return unique(scenarios.filter((s) => opts.tags!.some((tag) => s.tags.includes(tag))).map((s) => s.id))
  }
  if (opts.changed) return selectScenariosForChangedFiles(getChangedFiles())
  return DEFAULT_SCENARIOS
}

export const selectScenariosForChangedFiles = (files: string[]): string[] => {
  const frontend = files.filter((file) => file.startsWith('web/') || file === 'vite.config.ts' || file === 'package.json')
  if (frontend.length === 0) return CORE_SMOKE

  const selected = new Set<string>(CORE_SMOKE)
  for (const file of frontend) {
    for (const scenario of scenarios) {
      if (scenario.changedFileGlobs.some((glob) => matchesGlob(file, glob))) selected.add(scenario.id)
    }
  }

  if (frontend.some((file) => file.startsWith('web/components/terminal/'))) {
    selected.add('terminal.open')
    selected.add('mission.mode-toggle.loop')
    selected.add('mission.switch-with-terminal-active')
  }

  if (frontend.some((file) => file.startsWith('web/components/chat/') || file.startsWith('web/hooks/useAgent') || file.startsWith('web/hooks/useChat'))) {
    selected.add('mission.multi-active.switch-loop')
    selected.add('mission.mode-toggle.loop')
  }

  return [...selected]
}

const getChangedFiles = (): string[] => {
  const args = ['diff', '--name-only', 'HEAD']
  try {
    return execFileSync('git', args, { encoding: 'utf8' }).split('\n').map((x) => x.trim()).filter(Boolean)
  } catch {
    return []
  }
}

const matchesGlob = (file: string, glob: string): boolean => {
  if (glob.endsWith('/**')) return file.startsWith(glob.slice(0, -3))
  if (glob.includes('*')) {
    const escaped = glob.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*')
    return new RegExp(`^${escaped}$`).test(file)
  }
  return file === glob
}

const missionUrl = (ctx: ScenarioContext, missionId: string): string =>
  `${ctx.fixture.uiBase}/workspace/${ctx.fixture.workspaceId}/mission/${missionId}`

const warmMissions = async (ctx: ScenarioContext): Promise<void> => {
  await ctx.page.goto(missionUrl(ctx, ctx.fixture.missionIds[0]), { waitUntil: 'domcontentloaded' })
  await waitForChat(ctx.page, ctx.fixture.missionIds[0])
  for (const missionId of ctx.fixture.missionIds.slice(1, 4)) {
    await clickMission(ctx.page, ctx, missionId)
    await waitForChat(ctx.page, missionId)
  }
}

const clickMission = async (page: Page, ctx: ScenarioContext, missionId: string): Promise<void> => {
  const row = page.locator(`[data-mission-id="${missionId}"]`).first()
  if (await row.isVisible().catch(() => false)) {
    await row.scrollIntoViewIfNeeded()
    await row.click()
    await page.waitForURL(`**/mission/${missionId}**`, { timeout: 15_000 })
    return
  }
  await page.goto(missionUrl(ctx, missionId), { waitUntil: 'domcontentloaded' })
}

const toggleViewMode = async (page: Page, mode: 'message' | 'terminal'): Promise<void> => {
  const button = page.locator(`[data-render-action="chat-view-${mode}"]`).first()
  await button.waitFor({ state: 'visible', timeout: 15_000 })
  const pressed = await button.getAttribute('aria-pressed')
  if (pressed !== 'true') await button.click()
}

const waitForSurface = (page: Page, surface: string): Promise<void> =>
  page.locator(`[data-render-surface="${surface}"]`).first().waitFor({ state: 'visible', timeout: 20_000 })

const waitForChat = (page: Page, missionId: string): Promise<void> =>
  page.locator(`[data-render-surface="chat-instance"][data-chat-id="${missionId}"]`).first().waitFor({ state: 'visible', timeout: 20_000 })

const waitForMessageMode = async (page: Page): Promise<void> => {
  await page.locator('[data-render-surface="chat-body"]').first().waitFor({ state: 'visible', timeout: 20_000 })
}

const waitForTerminal = async (page: Page): Promise<void> => {
  const panel = page.locator('[data-render-surface="terminal-panel"]').first()
  await panel.waitFor({ state: 'visible', timeout: 20_000 })
  await page.waitForFunction(() => {
    const el = document.querySelector<HTMLElement>('[data-render-surface="terminal-panel"]')
    if (!el) return false
    const rect = el.getBoundingClientRect()
    return rect.width > 100 && rect.height > 100
  }, null, { timeout: 20_000 })
}

const unique = <T>(items: T[]): T[] => [...new Set(items)]
const short = (id: string): string => id.slice(0, 8)
