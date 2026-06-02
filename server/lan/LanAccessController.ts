import { networkInterfaces } from 'os'
import { randomBytes } from 'crypto'
import { existsSync } from 'fs'
import { join } from 'path'
import { setRuntimeAuthToken } from '../middleware/auth'
import { getServerPort } from '../lib/serverPort'
import { PORTS } from '../../shared/ports'

export interface LanAccessStatus {
  enabled: boolean
  lanIp: string
  port: number
  enabledAt: number | null
}

const PREFERRED_INTERFACES = ['en0', 'wlan0', 'eth0']

const detectLanIp = (): string => {
  const nets = networkInterfaces()
  for (const name of PREFERRED_INTERFACES) {
    const iface = nets[name]
    if (!iface) continue
    const v4 = iface.find(i => i.family === 'IPv4' && !i.internal)
    if (v4) return v4.address
  }
  for (const iface of Object.values(nets)) {
    const v4 = iface?.find(i => i.family === 'IPv4' && !i.internal)
    if (v4) return v4.address
  }
  return '127.0.0.1'
}

const getLanPort = (): number => {
  const serverPort = getServerPort()
  if (serverPort === PORTS.DEV_SERVER && !existsSync(join(process.cwd(), 'dist'))) {
    return PORTS.DEV_UI
  }
  return serverPort
}

export class LanAccessController {
  private token: string | null = null
  private enabledAt: number | null = null

  enable(): { token: string; lanUrl: string } {
    this.token = randomBytes(32).toString('hex')
    this.enabledAt = Date.now()
    setRuntimeAuthToken(this.token)
    const ip = detectLanIp()
    const port = getLanPort()
    return {
      token: this.token,
      lanUrl: `http://${ip}:${port}/mobile?token=${this.token}`,
    }
  }

  disable(): void {
    this.token = null
    this.enabledAt = null
    setRuntimeAuthToken(null)
  }

  isEnabled(): boolean {
    return this.token !== null
  }

  getStatus(): LanAccessStatus {
    return {
      enabled: this.isEnabled(),
      lanIp: detectLanIp(),
      port: getLanPort(),
      enabledAt: this.enabledAt,
    }
  }
}
