/**
 * EventTracker -
 *
 *  SQLite
 *  initEventTracker(store)  EventStore
 */

import type { EventStore } from '../stores/EventStore'
import { createLogger } from './logger'

const log = createLogger('EventTracker')

let _store: EventStore | null = null

export const initEventTracker = (store: EventStore): void => {
  _store = store
}

const getClientSource = (): 'cli' | 'electron' | 'server' => {
  if (process.env.TEEMAI_CLI) return 'cli'
  if (process.env.ELECTRON) return 'electron'
  return 'server'
}

/** fire-and-forget source  cli/electron/server */
export const trackEvent = (
  category: string,
  event: string,
  properties?: Record<string, unknown>,
): void => {
  if (!_store) return
  try {
    _store.track(category, event, { source: getClientSource(), ...properties })
  } catch (err) {
    log.warn('Failed to track event', { event, error: err instanceof Error ? err.message : String(err) })
  }
}
