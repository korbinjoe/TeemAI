import { chromium } from 'playwright'

const url = 'http://localhost:13000/workspace/default/chat/fv0ZK6BhLrkZ'
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
const ctx = await browser.newContext()
const page = await ctx.newPage()

const recv = []
const apiCalls = []
const consoleLogs = []

page.on('console', (msg) => { if (msg.type() === 'warn' || msg.type() === 'error') consoleLogs.push(`[${msg.type()}] ${msg.text().slice(0,200)}`) })
page.on('request', (req) => { if (req.url().includes('/api/sandbox/')) apiCalls.push(`HTTP ${req.method()} ${req.url()}`) })

page.on('websocket', (ws) => {
  ws.on('framereceived', ({ payload }) => {
    try {
      const msg = JSON.parse(payload.toString())
      if (msg.type === 'expert:partial-text') {
        const p = msg.payload || {}
        recv.push(`PARTIAL agent=${p.agentId} text="${(p.text||'').slice(0,30)}"`)
      } else if (msg.type === 'expert:structured-message') {
        const p = msg.payload || {}
        const ats = (p.messages||[]).filter(m=>m.role==='agent'&&m.type==='text').map(m=>`apiId=${m.apiCallId??'-'} content="${(m.content||'').slice(0,30)}"`)
        if (ats.length > 0) recv.push(`STRUCT type=${p.type} agents=${ats.length}: ${ats.join(' || ')}`)
      } else if (msg.type === 'expert:error') {
        const p = msg.payload || {}
        recv.push(`!!! expert:error error=${p.error} message=${p.message}`)
      } else if (msg.type === 'sandbox:task-result') {
        recv.push(`task-result taskId=${msg.payload?.taskId}`)
      }
    } catch {}
  })
})

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 })
await page.waitForTimeout(3500)

const testMsg = 'verify-' + Date.now()
const ta = await page.$('textarea, [contenteditable="true"]')
await ta.click()
await ta.fill(testMsg)
await page.keyboard.press('Enter')
await page.waitForTimeout(15000)

console.log('=== HTTP /api/sandbox ===')
apiCalls.forEach(c => console.log(c))
console.log('\n=== WS RECV (filtered) ===')
recv.forEach(r => console.log(r))
console.log('\n=== Console (warn/error) ===')
consoleLogs.slice(-5).forEach(l => console.log(l))

// Collect all apiCallIds to see how many ACP API call rounds
const apiIds = new Set()
recv.forEach(r => {
  const m = r.match(/apiId=msg_vrtx_(\w+)/)
  if (m) apiIds.add(m[1])
})
console.log('\n=== Unique apiCallIds ===', apiIds.size, [...apiIds])

await browser.close()
