import { createLogger } from './logger'

const log = createLogger('SilentIgnore')

export const silentlyIgnore = async <T>(fn: () => Promise<T>, reason: string): Promise<T | void> => {
  try {
    return await fn()
  } catch (err) {
    log.warn(reason, { error: err instanceof Error ? err.message : String(err) })
  }
}
