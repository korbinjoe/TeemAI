/**
 * ReleaseStrategy —
 *
 *  canary / gradual / full / pinned
 */

import { createHash } from 'crypto'
import { createLogger } from '../../lib/logger'
import type { ReleaseStrategy as StrategyConfig } from './UpdateManager'

const log = createLogger('ReleaseStrategy')

export class ReleaseStrategyEngine {
  shouldReceive(deviceId: string, strategy: StrategyConfig): boolean {
    switch (strategy.type) {
      case 'full':
        return true

      case 'canary':
        return strategy.targetGroup.includes(deviceId)

      case 'pinned':
        return strategy.targetGroup.includes(deviceId)

      case 'gradual':
        return this.gradualCheck(deviceId, strategy.rolloutPercent)

      default:
        log.warn('Unknown strategy type', { type: strategy.type })
        return false
    }
  }

  /**
   *  deviceId hash
   *  deviceId
   */
  private gradualCheck(deviceId: string, rolloutPercent: number): boolean {
    const hash = createHash('md5').update(deviceId).digest()
    const bucket = hash.readUInt16BE(0) % 100
    return bucket < rolloutPercent
  }

  static defaultFull(): StrategyConfig {
    return {
      type: 'full',
      rolloutPercent: 100,
      targetGroup: [],
      autoRollback: {
        enabled: false,
        errorThreshold: 0,
        windowMinutes: 0,
      },
    }
  }

  static canary(targetDeviceIds: string[]): StrategyConfig {
    return {
      type: 'canary',
      rolloutPercent: 0,
      targetGroup: targetDeviceIds,
      autoRollback: {
        enabled: true,
        errorThreshold: 1,
        windowMinutes: 60,
      },
    }
  }

  static gradual(percent: number, autoRollback = true): StrategyConfig {
    return {
      type: 'gradual',
      rolloutPercent: Math.min(100, Math.max(0, percent)),
      targetGroup: [],
      autoRollback: {
        enabled: autoRollback,
        errorThreshold: 5,
        windowMinutes: 30,
      },
    }
  }

  static pinned(targetDeviceIds: string[]): StrategyConfig {
    return {
      type: 'pinned',
      rolloutPercent: 0,
      targetGroup: targetDeviceIds,
      autoRollback: {
        enabled: false,
        errorThreshold: 0,
        windowMinutes: 0,
      },
    }
  }

  static validate(strategy: Partial<StrategyConfig>): string | null {
    if (!strategy.type) return 'Strategy type cannot be empty'
    if (!['canary', 'gradual', 'full', 'pinned'].includes(strategy.type)) {
      return `Unsupported strategy type: ${strategy.type}`
    }
    if (strategy.type === 'gradual') {
      if (strategy.rolloutPercent === undefined || strategy.rolloutPercent < 0 || strategy.rolloutPercent > 100) {
        return 'gradual strategy rolloutPercent must be between 0-100'
      }
    }
    if ((strategy.type === 'canary' || strategy.type === 'pinned') && (!strategy.targetGroup || strategy.targetGroup.length === 0)) {
      return `${strategy.type} strategy must specify targetGroup`
    }
    return null
  }
}
