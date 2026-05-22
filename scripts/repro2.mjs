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
        const ms = (p.messages || []).map(m => `[role=${m.role} type=${m.type} agentId=${m.agentId} id=${m.id?.slice(0,12)} ts=${m.timestamp} apiCallId=${m.apiCallId??'none'} content="${(m.content||'').slice(0,40)}"]`)
        recv.push(`STRUCT ${p.type} agent=${p.agentId}\n  ` + ms.join('\n  '))
      } else if (msg.type === 'expert:partial-text') {
        const p = msg.payload || {}
        recv.push(`PARTIAL agent=${p.agentId} text="${p.text}"`)
      }
    } catch {}
  })
})

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 })
await page.waitForTimeout(2500)

const testMsg = 'hi-' + Date.now()
const ta = await page.$('textarea, [contenteditable="true"]')
await ta.click()
await ta.fill(testMsg)
await page.keyboard.press('Enter')

await page.waitForTimeout(8000)

console.log('=== WS RECV ===')
recv.forEach(l => console.log(l))

// Dump rendered message DOM directly
const renderedMessages = await page.evaluate(() => {
  const result = []
  // Find all possible message containers
  document.querySelectorAll('[data-testid*="message"], [class*="message-item"], [class*="MessageItem"], [class*="ChatMessage"], div[role="article"]').forEach(el => {
    result.push({ class: el.className.slice(0, 60), text: el.innerText.slice(0, 100) })
  })
  return result
})
console.log('\n=== Rendered message DOM ===')
renderedMessages.forEach(m => console.log(`[${m.class}] ${m.text}`))

await browser.close()
