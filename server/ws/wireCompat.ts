import type { WebSocket } from 'ws'

/**
 * WS dual-emit / dual-accept compatibility layer (WS-1 + WS-2c).
 *
 * The server's internal canonical channel names are still the legacy
 * `expert:*` / `chat:*` strings. To let both old and new clients work during
 * the one-release migration window we:
 *   - OUTBOUND: twin every frame onto the new-name channels (`agent:*`,
 *     `mission.*`) so new clients receive events; old clients keep the legacy
 *     channel. Payload `experts` fields are mirrored to `agents` on the twin.
 *   - INBOUND: canonicalize new-name client messages back to the legacy
 *     strings the routers branch on.
 *
 * Removed in PR-F when the legacy names are dropped.
 */

export interface WireMessage {
  type: string
  payload?: any
}

/** Outbound prefix twinning: legacy canonical -> new-name channel. */
const OUTBOUND_PREFIX: ReadonlyArray<readonly [string, string]> = [
  ['expert:', 'agent:'],
  ['chat:', 'mission.'], // CHAT_TO_MISSION: dot namespace for mission events (plan WS-1)
]

/** Inbound canonicalization: new-name channel -> legacy canonical. */
const MISSION_TO_CHAT_INBOUND: ReadonlyArray<readonly [string, string]> = [
  ['agent:', 'expert:'],
  ['mission.', 'chat:'],
  ['mission:', 'chat:'],
]

const twinType = (type: string): string | null => {
  for (const [from, to] of OUTBOUND_PREFIX) {
    if (type.startsWith(from)) return to + type.slice(from.length)
  }
  return null
}

const hasExpertsField = (payload: unknown): payload is Record<string, unknown> =>
  !!payload && typeof payload === 'object' && !Array.isArray(payload) && 'experts' in payload

/**
 * Expand an outbound message into the original plus any twinned copies so old
 * and new clients both work. De-duplicated by type — the same channel is never
 * emitted twice. The original message is always included.
 */
export const expandOutbound = (msg: WireMessage): WireMessage[] => {
  const frames: WireMessage[] = []
  const seen = new Set<string>()
  const push = (m: WireMessage): void => {
    if (seen.has(m.type)) return
    seen.add(m.type)
    frames.push(m)
  }

  push(msg)

  const twin = twinType(msg.type)
  if (twin) {
    const twinMsg: WireMessage = { type: twin }
    if ('payload' in msg) {
      twinMsg.payload = hasExpertsField(msg.payload)
        ? { ...msg.payload, agents: msg.payload.experts }
        : msg.payload
    }
    push(twinMsg)
  }

  return frames
}

/** Serialize an outbound message into one JSON frame per channel. */
export const outboundFrames = (msg: WireMessage): string[] =>
  expandOutbound(msg).map((m) => JSON.stringify(m))

/** Send an outbound message on every compat channel. */
export const sendFrame = (ws: WebSocket, msg: WireMessage): void => {
  for (const frame of outboundFrames(msg)) ws.send(frame)
}

/**
 * Normalize an inbound client message type to the server's canonical internal
 * name. Unknown types pass through unchanged.
 */
export const canonicalizeInbound = (type: string): string => {
  for (const [from, to] of MISSION_TO_CHAT_INBOUND) {
    if (type.startsWith(from)) return to + type.slice(from.length)
  }
  return type
}
