import { chromium } from 'playwright'

const url = 'http://localhost:13000/workspace/default/chat/fv0ZK6BhLrkZ'
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
const ctx = await browser.newContext()
const page = await ctx.newPage()

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 })
await page.waitForTimeout(2500)

const testMsg = 'rr-' + Date.now()
const ta = await page.$('textarea, [contenteditable="true"]')
await ta.click()
await ta.fill(testMsg)
await page.keyboard.press('Enter')
await page.waitForTimeout(8000)

const fullText = await page.evaluate(() => {
  const main = document.querySelector('main') || document.body
  return main.innerText
})

const lines = fullText.split('\n')
console.log('=== full lines (last 40) ===')
lines.slice(-40).forEach((l, i) => console.log(`[${lines.length - 40 + i}]`, l))

const idx = lines.findIndex(l => l.includes(testMsg))
console.log('\n=== context around testMsg (idx=' + idx + ') ===')
if (idx >= 0) {
  for (let i = Math.max(0, idx - 2); i < Math.min(lines.length, idx + 15); i++) {
    console.log(`[${i}] ${lines[i]}`)
  }
}

await browser.close()
