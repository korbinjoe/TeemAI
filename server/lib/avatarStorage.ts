/**
 * Avatar Storage —  agent
 *
 *   ~/.teemai/avatars/<agentId>/<style>.png
 *
 * - saveAvatar
 * - deleteAgentAvatarsagent
 * - ensureAvatarDir
 * - resolveAvatarPath GET /api/avatars/custom/:id/:style
 */

import { promises as fs } from 'fs'
import { join, resolve } from 'path'
import { homedir } from 'os'
import { createLogger } from './logger'
import { AVATAR_STYLES, type AvatarStyle } from './geminiImage'

const log = createLogger('AvatarStorage')

export const AVATAR_ROOT = join(homedir(), '.teemai', 'avatars')

const AGENT_ID_REGEX = /^[a-z0-9][a-z0-9-]{0,63}$/
const STYLE_SET: ReadonlySet<string> = new Set<string>(AVATAR_STYLES)

const isValidAgentId = (id: string): boolean => AGENT_ID_REGEX.test(id)
const isValidStyle = (style: string): style is AvatarStyle => STYLE_SET.has(style)

export const ensureAvatarDir = async (): Promise<void> => {
  await fs.mkdir(AVATAR_ROOT, { recursive: true })
}

const agentDir = (agentId: string): string => join(AVATAR_ROOT, agentId)

export const saveAvatar = async (
  agentId: string,
  style: string,
  buffer: Buffer,
): Promise<string> => {
  if (!isValidAgentId(agentId)) {
    throw new Error(`invalid agentId: ${agentId}`)
  }
  if (!isValidStyle(style)) {
    throw new Error(`invalid style: ${style}`)
  }
  const dir = agentDir(agentId)
  await fs.mkdir(dir, { recursive: true })
  const file = join(dir, `${style}.png`)
  await fs.writeFile(file, buffer)
  return file
}

/**
 *  agent
 *
 * agent  log warn  DELETE agent
 */
export const deleteAgentAvatars = async (agentId: string): Promise<void> => {
  if (!isValidAgentId(agentId)) {
    log.warn('deleteAgentAvatars: invalid agentId', { agentId })
    return
  }
  try {
    await fs.rm(agentDir(agentId), { recursive: true, force: true })
  } catch (err) {
    log.warn('deleteAgentAvatars failed', {
      agentId,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

export const resolveAvatarPath = async (
  agentId: string,
  style: string,
): Promise<string | null> => {
  if (!isValidAgentId(agentId) || !isValidStyle(style)) return null

  const file = resolve(agentDir(agentId), `${style}.png`)
  if (!file.startsWith(resolve(AVATAR_ROOT) + '/')) return null

  try {
    const stat = await fs.stat(file)
    if (!stat.isFile()) return null
    return file
  } catch {
    return null
  }
}

export const listAvatarStyles = async (agentId: string): Promise<AvatarStyle[]> => {
  if (!isValidAgentId(agentId)) return []
  try {
    const files = await fs.readdir(agentDir(agentId))
    return files
      .filter((f) => f.endsWith('.png'))
      .map((f) => f.replace(/\.png$/, ''))
      .filter(isValidStyle)
  } catch {
    return []
  }
}
