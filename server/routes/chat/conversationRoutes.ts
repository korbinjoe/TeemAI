import { Router } from 'express'
import { join } from 'path'
import { existsSync, readdirSync } from 'fs'
import { homedir } from 'os'
import { parseConversationFile } from '../../terminal/ConversationParser'
import { createLogger } from '../../lib/logger'

const log = createLogger('ConversationRoutes')
const router = Router()

router.get('/api/conversation/:claudeSessionId', (req, res) => {
  const { claudeSessionId } = req.params
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(claudeSessionId)) {
    return res.status(400).json({ error: 'Invalid session ID format' })
  }

  const claudeProjectsDir = join(homedir(), '.claude', 'projects')
  if (!existsSync(claudeProjectsDir)) {
    return res.status(404).json({ error: 'Claude projects directory not found' })
  }

  const fileName = `${claudeSessionId}.jsonl`
  let filePath: string | null = null
  try {
    for (const dir of readdirSync(claudeProjectsDir)) {
      const candidate = join(claudeProjectsDir, dir, fileName)
      if (existsSync(candidate)) { filePath = candidate; break }
    }
  } catch { /* ignore */ }

  if (!filePath) {
    return res.status(404).json({ error: 'Conversation not found' })
  }

  try {
    const messages = parseConversationFile(filePath)
    res.json({ messages })
  } catch (err) {
    log.error('Failed to parse conversation', { error: err instanceof Error ? err.message : String(err), claudeSessionId })
    res.status(500).json({ error: 'Failed to parse conversation' })
  }
})

export default router
