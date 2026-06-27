import { mkdirSync } from 'fs'
import { join } from 'path'
import type { RenderPerfFixture } from './types'

interface SetupFixtureOptions {
  apiBase: string
  uiBase: string
  repoRoot: string
  runDir: string
}

interface WorkspaceResponse {
  workspace: { id: string }
  chat?: { id: string }
}

interface MissionResponse {
  id: string
}

export const createFixtureHome = (runDir: string): string => {
  const homeDir = join(runDir, 'home')
  mkdirSync(homeDir, { recursive: true })
  return homeDir
}

export const setupRenderPerfFixture = async (options: SetupFixtureOptions): Promise<RenderPerfFixture> => {
  const homeDir = join(options.runDir, 'home')
  const first = await postJson<WorkspaceResponse>(`${options.apiBase}/api/workspaces/quick-start`, {
    repoPath: options.repoRoot,
    title: 'Perf Mission 1',
  })
  const workspaceId = first.workspace.id
  const missionIds: string[] = []
  if (first.chat?.id) missionIds.push(first.chat.id)

  for (let i = missionIds.length + 1; i <= 4; i++) {
    const mission = await postJson<MissionResponse>(`${options.apiBase}/api/workspaces/${workspaceId}/chats`, {
      title: `Perf Mission ${i}`,
    })
    missionIds.push(mission.id)
  }

  return {
    apiBase: options.apiBase,
    uiBase: options.uiBase,
    repoRoot: options.repoRoot,
    runDir: options.runDir,
    homeDir,
    workspaceId,
    missionIds,
  }
}

const postJson = async <T>(url: string, body: unknown): Promise<T> => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(`${url} -> ${res.status}: ${await res.text()}`)
  }
  return res.json() as Promise<T>
}
