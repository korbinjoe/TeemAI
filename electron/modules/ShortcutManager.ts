
import { globalShortcut } from 'electron'
import type { WindowManager } from './WindowManager'
import type { NotchManager } from './NotchManager'

export class ShortcutManager {
  private shortcuts: Map<string, () => void> = new Map()
  private notchManager: NotchManager | null = null

  constructor(private windowManager: WindowManager) {}

  setNotchManager(nm: NotchManager): void {
    this.notchManager = nm
  }

  register(): void {
    this.bind('CommandOrControl+Ctrl+N', () => {
      this.notchManager?.toggle()
    })
  }

  unregisterAll(): void {
    for (const [accelerator] of this.shortcuts) {
      globalShortcut.unregister(accelerator)
    }
    this.shortcuts.clear()
  }

  private bind(accelerator: string, handler: () => void): void {
    const success = globalShortcut.register(accelerator, handler)
    if (success) {
      this.shortcuts.set(accelerator, handler)
    } else {
      console.warn(`[ShortcutManager] Failed to register: ${accelerator}`)
    }
  }
}
