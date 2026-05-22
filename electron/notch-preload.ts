/**
 * Notch Preload — Notch  contextBridge API
 *
 *  preload.ts  notch  API
 *  WS  Express ServerIPC
 */

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

const onIpc = (channel: string, callback: (data: unknown) => void): (() => void) => {
  const handler = (_event: IpcRendererEvent, data: unknown) => callback(data)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

contextBridge.exposeInMainWorld('notchBridge', {
  // ─── Main → Renderer StatusListen（Back unsubscribe） ───
  onStateChange: (cb: (state: 'compact' | 'expanded' | 'hidden') => void) =>
    onIpc('notch:state-change', cb as (data: unknown) => void),
  onNotification: (cb: (data: { agentName: string; message: string }) => void) =>
    onIpc('notch:notification', cb as (data: unknown) => void),

  setIgnoreMouseEvents: (ignore: boolean, opts?: { forward: boolean }) => {
    ipcRenderer.send('notch:set-ignore-mouse', ignore, opts)
  },
  notchAction: (action: 'expand' | 'compact' | 'hide') => {
    ipcRenderer.send('notch:action', action)
  },
  sendQuickCommand: (message: string) => {
    ipcRenderer.send('notch:send-command', message)
  },
  openWorkbench: () => {
    ipcRenderer.send('companion:open-workbench')
  },
})
