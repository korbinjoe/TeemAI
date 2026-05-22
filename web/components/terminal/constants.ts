import type { ITerminalOptions } from '@xterm/xterm'

const ANSI_COLORS_DARK = {
  red: '#ef4444',
  green: '#34d399',
  yellow: '#fbbf24',
  blue: '#60a5fa',
  magenta: '#a78bfa',
  cyan: '#22d3ee',
  brightRed: '#f87171',
  brightGreen: '#4ade80',
  brightYellow: '#fcd34d',
  brightBlue: '#3b82f6',
  brightMagenta: '#c084fc',
  brightCyan: '#06b6d4',
}

export const TERMINAL_THEME = {
  background: '#141414',
  foreground: '#d4d4d4',
  cursor: '#ffffff',
  cursorAccent: '#000000',
  selectionBackground: 'rgba(255, 255, 255, 0.3)',
  black: '#000000',
  white: '#d4d4d4',
  brightBlack: '#5a5a5a',
  brightWhite: '#ffffff',
  ...ANSI_COLORS_DARK,
}

export const TERMINAL_THEME_LIGHT = {
  ...TERMINAL_THEME,
  background: '#262626',
}

export const TERMINAL_OPTIONS: ITerminalOptions = {
  cursorBlink: true,
  fontSize: 12,
  fontFamily: 'JetBrains Mono, Menlo, Monaco, "PingFang SC", "Noto Sans CJK SC", "Microsoft YaHei", Courier New, monospace',
  theme: TERMINAL_THEME,
  convertEol: false,
  scrollback: 5000,
  allowProposedApi: true,
}

export const estimateSize = (el: HTMLElement | null): { cols: number; rows: number } => {
  if (!el || el.offsetWidth === 0 || el.offsetHeight === 0) {
    return { cols: 80, rows: 24 }
  }
  const fontSize = TERMINAL_OPTIONS.fontSize ?? 13
  const charWidth = fontSize * 0.6
  const lineHeight = fontSize * 1.4
  const cols = Math.max(40, Math.floor(el.offsetWidth / charWidth))
  const rows = Math.max(10, Math.floor(el.offsetHeight / lineHeight))
  return { cols, rows }
}
