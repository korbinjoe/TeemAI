export const CURRENT_WS_VERSION = 1

export interface ProtocolHello {
  version: number
  serverVersion: string
}

export interface ProtocolVersionMismatch {
  serverVersion: number
  clientVersion: number
  message: string
}
