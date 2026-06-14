import type { WebSocket } from 'ws'

/**
 * Minimal WS frame serializer. The server emits canonical channel names
 * (`agent:*`, `mission.*`, `mission:*`) directly — there is no dual-emit /
 * dual-accept compatibility layer (single bundled app, no client/server skew).
 */

export interface WireMessage {
  type: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any
}

/** Serialize an outbound message into a single JSON frame. */
export const outboundFrames = (msg: WireMessage): string[] => [JSON.stringify(msg)]

/** Send an outbound message to a single client. */
export const sendFrame = (ws: WebSocket, msg: WireMessage): void => {
  ws.send(JSON.stringify(msg))
}
