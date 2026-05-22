/**
 * Gemini Image Helper — TypeScript
 *
 *  GEMINI_API_KEY  Gemini  API
 *  server/routes/agent/agentRoutes.ts
 *
 * AVATAR_PROMPT_TEMPLATES  6  AvatarStyleMode Palette
 */

import { createLogger } from './logger'

const log = createLogger('GeminiImage')

const DEFAULT_API_URL =
  process.env.GEMINI_API_URL || 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'

export type AvatarStyle = 'default' | 'brush'

export const AVATAR_STYLES: readonly AvatarStyle[] = [
  'default',
  'brush',
] as const

export interface AvatarPromptParams {
  name: string
  animal: string
}

export type AvatarPromptBuilder = (params: AvatarPromptParams) => string

const COMMON_TAIL =
  'centered composition, transparent background, 1024x1024, high detail, no text, no watermark.'

export const AVATAR_PROMPT_TEMPLATES: Record<AvatarStyle, AvatarPromptBuilder> = {
  default: ({ name, animal }) =>
    `Minimalist circular emblem representing "${name}", abstract geometric icon symbolizing a ${animal}, monochrome with one accent color, flat design, no facial features, suitable as a universal default avatar. ${COMMON_TAIL}`,

  brush: ({ name, animal }) =>
    `Chinese ink brush painting of a ${animal}, representing "${name}", minimal strokes, monochrome, traditional aesthetic, sumi-e style. ${COMMON_TAIL}`,
}

export interface GenerateImageOptions {
  timeoutMs?: number
}

interface GeminiInlineDataPart {
  inlineData?: {
    mimeType?: string
    data?: string
  }
}

interface GeminiCandidatesResponse {
  candidates?: Array<{
    content?: {
      parts?: GeminiInlineDataPart[]
    }
  }>
  error?: { message?: string }
}

/**
 *  Gemini  Buffer
 *  Error
 */
export const generateImage = async (
  prompt: string,
  options: GenerateImageOptions = {},
): Promise<Buffer> => {
  const { timeoutMs = 60000 } = options

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not set')
  }

  const apiUrl = `${DEFAULT_API_URL}?key=${apiKey}`

  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status} ${res.statusText}${body ? `: ${body.slice(0, 200)}` : ''}`)
  }

  const json = (await res.json()) as GeminiCandidatesResponse
  if (json.error?.message) {
    throw new Error(`API error: ${json.error.message}`)
  }

  const parts = json.candidates?.[0]?.content?.parts ?? []
  const imagePart = parts.find((p) => p.inlineData?.data)
  if (!imagePart?.inlineData?.data) {
    throw new Error('no inline image in response')
  }

  return Buffer.from(imagePart.inlineData.data, 'base64')
}

export const __resetGeminiCache = (): void => {
  // no-op: API key is now read directly from env on each call
}
