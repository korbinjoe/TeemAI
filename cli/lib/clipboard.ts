/**
 * clipboard —
 *
 * macOS / Linux
 *  execSyncCtrl+V
 */

import { execSync, spawnSync } from 'child_process'
import { existsSync, mkdirSync, statSync, writeFileSync } from 'fs'
import { join } from 'path'
import { TEEMAI_HOME } from '../../shared/teemai-home'

const platform = process.platform

export const readClipboardText = (): string | null => {
  try {
    if (platform === 'darwin') {
      const text = execSync('pbpaste', {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      return text || null
    }
    if (platform === 'linux') {
      const text = execSync('xclip -selection clipboard -o', {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      return text || null
    }
    return null
  } catch {
    return null
  }
}

export const saveClipboardImage = (): string | null => {
  try {
    const dir = join(TEEMAI_HOME, 'tmp', 'images')
    mkdirSync(dir, { recursive: true })
    const dest = join(dir, `paste_${Date.now()}.png`)

    if (platform === 'darwin') {
      execSync(
        `osascript -e 'set imgData to (the clipboard as «class PNGf»)' \
         -e 'set f to open for access POSIX file "${dest}" with write permission' \
         -e 'write imgData to f' \
         -e 'close access f'`,
        { stdio: 'pipe' },
      )
    } else if (platform === 'linux') {
      const result = spawnSync('xclip', ['-selection', 'clipboard', '-t', 'image/png', '-o'])
      if (result.status !== 0 || !result.stdout || result.stdout.length === 0) return null
      writeFileSync(dest, result.stdout)
    } else {
      return null
    }

    if (existsSync(dest) && statSync(dest).size > 0) return dest
    return null
  } catch {
    return null
  }
}
