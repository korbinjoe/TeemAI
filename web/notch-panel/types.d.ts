/** Notch  Bridge API electron/notch-preload.ts  */
interface NotchBridge {
  onStateChange: (cb: (state: 'compact' | 'expanded' | 'hidden') => void) => () => void
  onNotification: (cb: (data: { agentName: string; message: string }) => void) => () => void
  setIgnoreMouseEvents: (ignore: boolean, opts?: { forward: boolean }) => void
  notchAction: (action: 'expand' | 'compact' | 'hide') => void
  sendQuickCommand: (message: string) => void
  openWorkbench: () => void
}

declare global {
  interface Window {
    notchBridge?: NotchBridge
  }
}

export {}
