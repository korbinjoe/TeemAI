/**
 * WS  —  WS
 *
 * /api/health
 */

let lastWsMessageAt: number | null = null

export const markWsMessageReceived = (): void => {
  lastWsMessageAt = Date.now()
}

export const getLastWsMessageAt = (): number | null => lastWsMessageAt
