/**
 * NotchManager —
 *
 *  macOS  BrowserWindow
 * - compact / expanded / hidden
 * - display-metrics-changed +
 */

import { BrowserWindow, screen, ipcMain } from 'electron'
import { createRequire } from 'module'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import type { WindowManager } from './WindowManager'
import { PORTS } from '../../shared/ports'

interface NotchHelperAddon {
  setNotchLevel: (handle: Buffer) => boolean
  resetPosition: (handle: Buffer, x: number, y: number) => boolean
}

const loadNotchHelper = (): NotchHelperAddon | null => {
  try {
    const require = createRequire(import.meta.url)
    const baseDir = dirname(fileURLToPath(import.meta.url))
    const addonPath = join(baseDir, '..', '..', 'electron', 'native', 'build', 'Release', 'notch_helper.node')
    return require(addonPath)
  } catch (err) {
    console.warn('[NotchManager] Native addon not available, window will be at y=38:', err)
    return null
  }
}

const notchHelper = loadNotchHelper()

interface NotchGeometry {
  hasNotch: boolean
  notchX: number
  notchY: number
  notchWidth: number
  notchHeight: number
  screenWidth: number
}

type NotchState = 'hidden' | 'compact' | 'expanded'

const MAX_CRASH_COUNT = 3
const CRASH_RESET_INTERVAL = 60_000

export class NotchManager {
  private notchWindow: BrowserWindow | null = null
  private state: NotchState = 'hidden'
  private geometry: NotchGeometry | null = null
  private isFullscreenHidden = false

  private crashCount = 0
  private lastCrashAt = 0

  private displayDebounceTimer: ReturnType<typeof setTimeout> | null = null

  private onStateChangeCallback: ((state: NotchState) => void) | null = null

  constructor(
    private windowManager: WindowManager,
    private serverPort: number,
    private isDev: boolean,
    private preloadPath: string,
  ) {}

  init(): void {
    this.geometry = this.detectNotch()
    if (!this.geometry.hasNotch) {
      console.log('[NotchManager] No notch detected, skipping')
      return
    }
    this.createNotchWindow()
    this.listenDisplayChanges()
    this.setupIPC()
    console.log('[NotchManager] Initialized')
  }

  onStateChange(cb: (state: NotchState) => void): void {
    this.onStateChangeCallback = cb
  }

  private detectNotch(): NotchGeometry {
    const display = screen.getPrimaryDisplay()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const safeInsets = (display as any).safeAreaInsets
    const hasNotch = safeInsets?.top > 0 || display.workArea.y > 30

    const screenWidth = display.size.width
    const notchWidth = 180
    const notchHeight = 32

    console.log(`[NotchManager] Display: ${screenWidth}x${display.size.height} @${display.scaleFactor}x, workArea.y=${display.workArea.y}, hasNotch=${hasNotch}`)

    return {
      hasNotch,
      notchX: (screenWidth - notchWidth) / 2,
      notchY: 0,
      notchWidth,
      notchHeight,
      screenWidth,
    }
  }

  private createNotchWindow(): void {
    if (!this.geometry?.hasNotch) return

    const windowWidth = 380
    const notchCenterX = this.geometry.notchX + this.geometry.notchWidth / 2
    const windowX = Math.round(notchCenterX - windowWidth / 2)

    console.log(`[NotchManager] Window: x=${windowX}, width=${windowWidth}, notchCenter=${notchCenterX}`)

    this.notchWindow = new BrowserWindow({
      x: windowX,
      y: 0,
      width: windowWidth,
      height: 400,
      frame: false,
      transparent: true,
      hasShadow: false,
      resizable: false,
      movable: false,
      skipTaskbar: true,
      focusable: false,
      show: false,
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
      },
    })

    this.notchWindow.setAlwaysOnTop(true, 'status')
    this.notchWindow.setIgnoreMouseEvents(true, { forward: true })

    if (notchHelper) {
      try {
        const handle = this.notchWindow.getNativeWindowHandle()
        notchHelper.setNotchLevel(handle)
        console.log('[NotchManager] Native addon applied — window at y=0')
      } catch (err) {
        console.warn('[NotchManager] Native addon failed:', err)
      }
    }

    this.watchHealth()

    const url = this.isDev
      ? `http://localhost:${PORTS.DEV_UI}/web/notch-panel/index.html`
      : `http://localhost:${this.serverPort}/notch-panel/index.html`
    this.notchWindow.loadURL(url)

    this.notchWindow.once('ready-to-show', () => {
      this.notchWindow?.show()
      this.setState('compact')
    })

    this.notchWindow.on('blur', () => {
      if (this.state === 'expanded') {
        this.compact()
      }
    })
  }

  private watchHealth(): void {
    if (!this.notchWindow) return
    const wc = this.notchWindow.webContents

    wc.on('crashed', (_event, killed) => {
      console.error(`[NotchManager] Renderer crashed (killed=${killed})`)
      this.handleCrashRecovery()
    })

    wc.on('unresponsive', () => {
      console.warn('[NotchManager] Renderer unresponsive')
      this.handleCrashRecovery()
    })

    wc.on('did-fail-load', (_e, code, desc) => {
      if (code !== -3) {
        console.error(`[NotchManager] Load failed: ${code} ${desc}`)
        this.handleCrashRecovery()
      }
    })
  }

  private handleCrashRecovery(): void {
    const now = Date.now()
    if (now - this.lastCrashAt > CRASH_RESET_INTERVAL) this.crashCount = 0
    this.crashCount++
    this.lastCrashAt = now

    if (this.crashCount > MAX_CRASH_COUNT) {
      console.error(`[NotchManager] ${MAX_CRASH_COUNT} crashes, giving up`)
      this.destroyWindow()
      return
    }

    const delay = 1000 * Math.pow(2, this.crashCount - 1)
    console.log(`[NotchManager] Recovering in ${delay}ms (${this.crashCount}/${MAX_CRASH_COUNT})`)
    this.destroyWindow()
    setTimeout(() => this.createNotchWindow(), delay)
  }

  expand(): void {
    if (this.state === 'expanded' || this.isFullscreenHidden) return
    this.notchWindow?.setFocusable(true)
    this.notchWindow?.webContents.send('notch:state-change', 'expanded')
    this.notchWindow?.setIgnoreMouseEvents(false)
    this.setState('expanded')
  }

  compact(): void {
    if (this.state === 'compact') return
    this.notchWindow?.setFocusable(false)
    this.notchWindow?.webContents.send('notch:state-change', 'compact')
    this.notchWindow?.setIgnoreMouseEvents(true, { forward: true })
    this.setState('compact')
  }

  toggle(): void {
    if (this.state === 'compact') this.expand()
    else if (this.state === 'expanded') this.compact()
  }

  hide(): void {
    this.isFullscreenHidden = true
    this.notchWindow?.hide()
  }

  show(): void {
    this.isFullscreenHidden = false
    this.notchWindow?.show()
  }

  playNotification(data: { agentName: string; message: string }): void {
    if (this.isFullscreenHidden) return
    this.notchWindow?.webContents.send('notch:notification', data)
  }

  private setupIPC(): void {
    ipcMain.on('notch:set-ignore-mouse', (_e, ignore: boolean, opts?: { forward: boolean }) => {
      this.notchWindow?.setIgnoreMouseEvents(ignore, ignore ? opts : undefined)
    })

    ipcMain.on('notch:action', (_e, action: 'expand' | 'compact' | 'hide') => {
      if (action === 'expand') this.expand()
      else if (action === 'compact') this.compact()
      else if (action === 'hide') this.hide()
    })

    ipcMain.on('notch:send-command', (_e, message: string) => {
      this.windowManager.sendToAll('notch:quick-command', { message })
    })

    ipcMain.on('companion:open-workbench', () => {
      this.windowManager.focusMain()
    })
  }

  private listenDisplayChanges(): void {
    const debouncedUpdate = () => {
      if (this.displayDebounceTimer) clearTimeout(this.displayDebounceTimer)
      this.displayDebounceTimer = setTimeout(() => {
        const display = screen.getPrimaryDisplay()
        const menuBarHidden = display.workArea.y === 0

        if (menuBarHidden && !this.isFullscreenHidden) {
          this.hide()
          return
        }
        if (!menuBarHidden && this.isFullscreenHidden) {
          this.show()
        }

        const newGeo = this.detectNotch()
        if (!newGeo.hasNotch && this.notchWindow) {
          this.destroyWindow()
        } else if (newGeo.hasNotch && !this.notchWindow) {
          this.geometry = newGeo
          this.createNotchWindow()
        }
      }, 300)
    }

    screen.on('display-added', debouncedUpdate)
    screen.on('display-removed', debouncedUpdate)
    screen.on('display-metrics-changed', debouncedUpdate)
  }

  private setState(state: NotchState): void {
    this.state = state
    this.onStateChangeCallback?.(state)
  }

  private destroyWindow(): void {
    this.notchWindow?.destroy()
    this.notchWindow = null
    this.setState('hidden')
  }

  destroy(): void {
    if (this.displayDebounceTimer) clearTimeout(this.displayDebounceTimer)
    ipcMain.removeAllListeners('notch:set-ignore-mouse')
    ipcMain.removeAllListeners('notch:action')
    ipcMain.removeAllListeners('notch:send-command')
    ipcMain.removeAllListeners('companion:open-workbench')
    this.destroyWindow()
  }
}
