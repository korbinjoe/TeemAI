import { writeFile, mkdir, unlink } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'
import type { McpServerConfig } from './types'
import { TMP_MCP_DIR } from './paths'
import { createLogger } from '../lib/logger'

const log = createLogger('McpConfigManager')

export class McpConfigManager {
  private configDir = TMP_MCP_DIR

  async writeConfig(
    sessionId: string,
    servers: Record<string, McpServerConfig>,
  ): Promise<string> {
    await mkdir(this.configDir, { recursive: true })

    const mcpJson: { mcpServers: Record<string, Record<string, unknown>> } = {
      mcpServers: {},
    }

    for (const [name, config] of Object.entries(servers)) {
      if (config.transport === 'stdio') {
        mcpJson.mcpServers[name] = {
          command: config.command,
          args: config.args ?? [],
          env: config.env ?? {},
        }
      } else {
        mcpJson.mcpServers[name] = { url: config.url }
      }
    }

    const filePath = join(this.configDir, `${sessionId}.mcp.json`)
    await writeFile(filePath, JSON.stringify(mcpJson, null, 2))
    log.info('Wrote config', { filePath })
    return filePath
  }

  async cleanup(sessionId: string): Promise<void> {
    const filePath = join(this.configDir, `${sessionId}.mcp.json`)
    if (existsSync(filePath)) {
      await unlink(filePath)
      log.info('Cleaned up config', { filePath })
    }
  }
}
