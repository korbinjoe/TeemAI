import { chromium } from 'playwright'

const url = 'http://localhost:13000/workspace/default/chat/fv0ZK6BhLrkZ'
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
const ctx = await browser.newContext()
const page = await ctx.newPage()

const recv = []
page.on('websocket', (ws) => {
  ws.on('framereceived', ({ payload }) => {
    try {
      const msg = JSON.parse(payload.toString())
      if (msg.type === 'expert:structured-message') {
        const p = msg.payload || {}
        const ms = (p.messages || []).map(m => `id=${m.id} type=${m.type} apiCallId=${m.apiCallId??'-'} turnIndex=${m.turnIndex??'-'}`)
        recv.push(`STRUCT ${p.type} count=${ms.length}\n  ` + ms.join('\n  '))
      }
    } catch {}
  })
})

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 })
await page.waitForTimeout(2500)

const testMsg = 'ss-' + Date.now()
const ta = await page.$('textarea, [contenteditable="true"]')
await ta.click()
await ta.fill(testMsg)
await page.keyboard.press('Enter')
await page.waitForTimeout(8000)

console.log('=== STRUCT (full id, type, apiCallId, turnIndex) ===')
recv.forEach(r => console.log(r))

await browser.close()
