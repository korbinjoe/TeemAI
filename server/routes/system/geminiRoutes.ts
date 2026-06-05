/**
 * Gemini Image Routes
 *
 *  URL  Gemini
 *  ~/.teemai/images/  gemini-
 */

import { Router } from 'express'
import { join } from 'path'
import { existsSync } from 'fs'
import { TEEMAI_HOME } from '../../config/paths'

const IMAGE_DIR = join(TEEMAI_HOME, 'images')

const router = Router()

/**
 * GET /api/gemini/image/:filename
 *  Gemini
 */
router.get('/api/gemini/image/:filename', (req, res) => {
  const { filename } = req.params

  if (!filename.startsWith('gemini-') || filename.includes('..') || filename.includes('/')) {
    res.status(403).json({ error: 'Forbidden' })
    return
  }

  const filePath = join(IMAGE_DIR, filename)
  if (!existsSync(filePath)) {
    res.status(404).json({ error: 'Image not found' })
    return
  }

  const ext = filename.split('.').pop()?.toLowerCase()
  const mimeMap: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
  }
  res.setHeader('Content-Type', mimeMap[ext || ''] || 'image/png')
  res.setHeader('Cache-Control', 'public, max-age=86400')
  res.sendFile(filePath)
})

export default router
