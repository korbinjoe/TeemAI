import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  generateImage,
  AVATAR_PROMPT_TEMPLATES,
  AVATAR_STYLES,
  __resetGeminiCache,
} from '../lib/geminiImage'

describe('AVATAR_PROMPT_TEMPLATES', () => {
  it('covers exactly 2 styles including default', () => {
    const keys = Object.keys(AVATAR_PROMPT_TEMPLATES).sort()
    expect(keys).toEqual(['brush', 'default'])
    expect(AVATAR_STYLES.length).toBe(2)
  })

  it('embeds name and animal in every style', () => {
    for (const style of AVATAR_STYLES) {
      const prompt = AVATAR_PROMPT_TEMPLATES[style]({ name: 'Data analyst', animal: 'owl' })
      expect(prompt).toContain('Data analyst')
      expect(prompt).toContain('owl')
      expect(prompt).toContain('1024x1024')
      expect(prompt).toContain('no text')
    }
  })

  it('default style explicitly mentions emblem / no facial features', () => {
    const out = AVATAR_PROMPT_TEMPLATES.default({ name: 'Quartz', animal: 'owl' })
    expect(out).toMatch(/emblem/i)
    expect(out).toMatch(/no facial features/i)
  })
})

describe('generateImage', () => {
  const fetchMock = vi.fn()
  const ORIGINAL_FETCH = globalThis.fetch

  beforeEach(() => {
    fetchMock.mockReset()
    __resetGeminiCache()
    globalThis.fetch = fetchMock as unknown as typeof fetch
    process.env.GEMINI_API_KEY = 'test-key'
  })

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH
    delete process.env.GEMINI_API_KEY
  })

  it('throws when GEMINI_API_KEY is not set', async () => {
    delete process.env.GEMINI_API_KEY
    await expect(generateImage('hello')).rejects.toThrow('GEMINI_API_KEY')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('throws when API returns HTTP error', async () => {
    fetchMock.mockResolvedValueOnce(new Response('server error', { status: 500, statusText: 'Internal Server Error' }))
    await expect(generateImage('hello')).rejects.toThrow('HTTP 500')
  })

  it('throws when API returns error.message in JSON', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: 'rate limited' } }), { status: 200 }),
    )
    await expect(generateImage('hello')).rejects.toThrow('rate limited')
  })

  it('throws when API returns no inlineData', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ candidates: [{ content: { parts: [{ text: 'just text' }] } }] }),
        { status: 200 },
      ),
    )
    await expect(generateImage('hello')).rejects.toThrow('no inline image')
  })

  it('returns Buffer when image generation succeeds', async () => {
    const base64 = Buffer.from('fakeimage').toString('base64')
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: base64 } }] } }],
        }),
        { status: 200 },
      ),
    )

    const out = await generateImage('hi')
    expect(out).not.toBeNull()
    expect(out.toString()).toBe('fakeimage')
  })

  it('passes prompt in request body', async () => {
    const base64 = Buffer.from('img').toString('base64')
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ inlineData: { data: base64 } }] } }],
        }),
        { status: 200 },
      ),
    )

    await generateImage('my cool prompt')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.contents[0].parts[0].text).toBe('my cool prompt')
  })
})
