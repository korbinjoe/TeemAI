/**
 * IDETerminal — WebIDE  shell
 *
 *  WS shell:*  node-pty TerminalInstance  xterm
 *  mount  hidden prop
 */

import { useRef, useEffect, useCallback } from 'react'
import '@xterm/xterm/css/xterm.css'
import { getWebSocketClient } from '@/services/WebSocketClient'
import { TerminalInstance } from '@/components/terminal/TerminalInstance'
import { useTheme } from '@/contexts/ThemeContext'
import { TERMINAL_THEME_LIGHT, estimateSize } from '@/components/terminal/constants'

interface IDETerminalProps {
  cwd: string
  hidden?: boolean
  onExit?: () => void
}

const IDETerminal = ({ cwd, hidden = false, onExit }: IDETerminalProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<TerminalInstance | null>(null)
  const shellIdRef = useRef<string | null>(null)
  const nonceRef = useRef<string>('')
  const cwdRef = useRef(cwd)
  cwdRef.current = cwd
  const hiddenRef = useRef(hidden)
  hiddenRef.current = hidden
  const onExitRef = useRef(onExit)
  onExitRef.current = onExit
  const { theme } = useTheme()

  const wsClient = getWebSocketClient()

  const initTerminal = useCallback(async () => {
    if (!containerRef.current || terminalRef.current) return

    const inst = new TerminalInstance()
    terminalRef.current = inst

    inst.onData((data) => {
      if (shellIdRef.current && wsClient.isConnected()) {
        wsClient.send('shell:input', { shellId: shellIdRef.current, data })
      }
    })

    inst.onResize(({ cols, rows }) => {
      if (hiddenRef.current) return
      if (shellIdRef.current && wsClient.isConnected()) {
        wsClient.send('shell:resize', { shellId: shellIdRef.current, cols, rows })
      }
    })

    inst.attach(containerRef.current)
    const size = estimateSize(containerRef.current)

    const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    nonceRef.current = nonce
    wsClient.send('shell:create', { cwd: cwdRef.current, cols: size.cols, rows: size.rows, nonce })

    await inst.open(size.cols, size.rows)

    if (theme === 'light') inst.setTheme(TERMINAL_THEME_LIGHT)
  }, [wsClient, theme])

  useEffect(() => {
    const handleCreated = ({ shellId, bufferedOutput, nonce }: { shellId: string; bufferedOutput?: string; nonce?: string }) => {
      if (nonce && nonce !== nonceRef.current) return
      shellIdRef.current = shellId
      if (bufferedOutput) {
        terminalRef.current?.write(bufferedOutput)
      }
    }

    // shell:output → Write xterm
    const handleOutput = ({ shellId, data }: { shellId: string; data: string }) => {
      if (shellId === shellIdRef.current) {
        terminalRef.current?.write(data)
      }
    }

    const handleExit = ({ shellId, exitCode }: { shellId: string; exitCode: number }) => {
      if (shellId === shellIdRef.current) {
        terminalRef.current?.write(`\r\n\x1b[90m[Process exited with code ${exitCode}]\x1b[0m\r\n`)
        shellIdRef.current = null
        onExitRef.current?.()
      }
    }

    wsClient.on('shell:created', handleCreated)
    wsClient.on('shell:output', handleOutput)
    wsClient.on('shell:exit', handleExit)

    if (wsClient.isConnected()) {
      initTerminal()
    } else {
      const onConnected = () => {
        initTerminal()
        wsClient.off('connected', onConnected)
        wsClient.off('reconnected', onConnected)
      }
      wsClient.on('connected', onConnected)
      wsClient.on('reconnected', onConnected)
    }

    return () => {
      wsClient.off('shell:created', handleCreated)
      wsClient.off('shell:output', handleOutput)
      wsClient.off('shell:exit', handleExit)
      if (shellIdRef.current && wsClient.isConnected()) {
        wsClient.send('shell:destroy', { shellId: shellIdRef.current })
      }
      shellIdRef.current = null

      terminalRef.current?.dispose()
      terminalRef.current = null
    }
  }, [wsClient, initTerminal])

  useEffect(() => {
    if (!hidden && terminalRef.current?.isOpened) {
      terminalRef.current.reactivate()
    }
  }, [hidden])

  useEffect(() => {
    if (!terminalRef.current?.isOpened) return
    if (theme === 'light') {
      terminalRef.current.setTheme(TERMINAL_THEME_LIGHT)
    } else {
      terminalRef.current.setTheme({
        background: '#141414',
        foreground: '#d4d4d4',
        cursor: '#ffffff',
        cursorAccent: '#000000',
        selectionBackground: 'rgba(255, 255, 255, 0.3)',
      })
    }
  }, [theme])

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      style={{ minHeight: 0 }}
    />
  )
}

export default IDETerminal
