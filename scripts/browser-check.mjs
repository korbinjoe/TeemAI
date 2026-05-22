import { chromium } from 'playwright'
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext()
const page = await ctx.newPage()
const consoleLogs = []
page.on('console', (msg) => { consoleLogs.push(`[${msg.type()}] ${msg.text()}`) })
page.on('pageerror', (err) => { consoleLogs.push(`[error] ${err.message}`) })
await page.goto('http://localhost:13000/workspace/default/chat/fv0ZK6BhLrkZ', { waitUntil: 'domcontentloaded', timeout: 15000 })
// Wait 3s for ws + resume to complete
await page.waitForTimeout(3000)
const messageCount = await page.evaluate(() => {
  const all = document.querySelectorAll('[class*="message"]')
  return all.length
}).catch(() => -1)
const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 600)).catch(() => 'ERROR')
console.log('=== console logs ===')
consoleLogs.slice(-30).forEach(l => console.log(l))
console.log('=== body text ===')
console.log(bodyText)
console.log('=== messageCount =', messageCount)
await browser.close()
