import { chromium } from 'playwright'

const url = 'http://localhost:13000/workspace/default/chat/fv0ZK6BhLrkZ'
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
const ctx = await browser.newContext()
const page = await ctx.newPage()

const replies = []
page.on('websocket', (ws) => {
  ws.on('framereceived', ({ payload }) => {
    try {
      const msg = JSON.parse(payload.toString())
      if (msg.type === 'expert:structured-message') {
        const p = msg.payload || {}
        ;(p.messages||[]).forEach(m => {
          if (m.role === 'agent' && m.type === 'text' && m.content) replies.push(`AGENT-TEXT [apiId=${m.apiCallId}] "${m.content.slice(0,300)}"`)
          if (m.role === 'agent' && m.type === 'toolUse' && m.toolUse) replies.push(`AGENT-TOOL ${m.toolUse.toolName} input="${JSON.stringify(m.toolUse.input).slice(0,200)}"`)
          if (m.role === 'agent' && m.type === 'toolResult' && m.toolResult) replies.push(`AGENT-TOOL-RESULT "${m.toolResult.content.slice(0,200)}"`)
        })
      }
    } catch {}
  })
})

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 })
await page.waitForTimeout(3500)

const ts = Date.now()
const testMsg = `pwdcheck${ts}: No explanation needed. Run bash command \`pwd\` and paste the output verbatim. Also tell me your cli session id and machine hostname (use the hostname command).`
const ta = await page.$('textarea, [contenteditable="true"]')
await ta.click()
await ta.fill(testMsg)
await page.keyboard.press('Enter')

await page.waitForTimeout(20000)

console.log('=== AGENT REPLIES (latest turn only) ===')
// Only show pwdcheck-related entries from the latest turn (last 20)
replies.slice(-20).forEach(r => console.log(r))

await browser.close()
