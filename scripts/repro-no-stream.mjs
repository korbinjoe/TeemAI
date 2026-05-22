import { chromium } from 'playwright'

const url = 'http://localhost:13000/workspace/default/chat/fv0ZK6BhLrkZ'
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
const ctx = await browser.newContext()
const page = await ctx.newPage()

const wsRecv = []
const wsSent = []
const consoleLogs = []

page.on('console', (msg) => {
  const t = msg.text()
  if (t.includes('DEBUG') || t.includes('expert:') || t.includes('error')) consoleLogs.push(`[${msg.type()}] ${t.slice(0, 300)}`)
})

page.on('websocket', (ws) => {
  console.log('WS opened:', ws.url())
  ws.on('framereceived', ({ payload }) => {
    try {
      const msg = JSON.parse(payload.toString())
      if (msg.type && (msg.type.startsWith('expert:') || msg.type === 'chat:activity' || msg.type === 'chat:status-changed')) {
        const p = msg.payload || {}
        wsRecv.push(`RECV ${msg.type} chat=${(p.chatId||'').slice(0,8)} agent=${p.agentId||'-'} type=${p.type||'-'} msgs=${(p.messages?.length)??'-'} text="${(p.text||'').slice(0,30)}" loc=${p.taskLocation||'-'}`)
      }
    } catch {}
  })
  ws.on('framesent', ({ payload }) => {
    try {
      const msg = JSON.parse(payload.toString())
      if (msg.type && msg.type !== 'ping' && msg.type !== 'pong') {
        wsSent.push(`SEND ${msg.type} ${JSON.stringify(msg.payload||{}).slice(0,150)}`)
      }
    } catch {}
  })
})

console.log('=== STEP 1: Open chat ===')
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 })
await page.waitForTimeout(2500)

console.log('=== STEP 2: Count initial messages ===')
const msgsBefore = await page.evaluate(() => document.querySelectorAll('[data-message-id], [class*="MessageItem"], [class*="message-item"]').length)
const bodyBefore = await page.evaluate(() => {
  const main = document.querySelector('main, [class*="chat-body"], [class*="ChatBody"]') || document.body
  return main.innerText.slice(0, 800)
})
console.log('msgsBefore=', msgsBefore)
console.log('bodyBefore=\n', bodyBefore)

console.log('\n=== STEP 3: Find input and send message "hi-test-' + Date.now() + '" ===')
const testMsg = 'hi-test-' + Date.now()
const ta = await page.$('textarea, [contenteditable="true"]')
if (!ta) { console.log('NO INPUT FOUND'); process.exit(1) }
await ta.click()
await ta.fill(testMsg)
await page.waitForTimeout(300)
await page.keyboard.press('Enter')
console.log('sent: ' + testMsg)

console.log('\n=== STEP 4: Wait 8s for ACP to finish ===')
await page.waitForTimeout(8000)

console.log('\n=== WS frames RECV (filtered) ===')
wsRecv.slice(0, 80).forEach(l => console.log(l))
console.log('\n=== WS frames SENT ===')
wsSent.slice(0, 30).forEach(l => console.log(l))
console.log('\n=== console logs ===')
consoleLogs.slice(-30).forEach(l => console.log(l))

const bodyAfter = await page.evaluate(() => {
  const main = document.querySelector('main, [class*="chat-body"], [class*="ChatBody"]') || document.body
  return main.innerText.slice(0, 1500)
})
console.log('\n=== body AFTER ===\n', bodyAfter)
const hasTestMsg = bodyAfter.includes(testMsg)
console.log('\nhasTestMsg=', hasTestMsg)

await browser.close()
