import { chromium } from 'playwright'

const url = 'http://localhost:13000/workspace/default/chat/fv0ZK6BhLrkZ'
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
const ctx = await browser.newContext()
const page = await ctx.newPage()

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 })
await page.waitForTimeout(2500)

const testMsg = 'qq-' + Date.now()
const ta = await page.$('textarea, [contenteditable="true"]')
await ta.click()
await ta.fill(testMsg)
await page.keyboard.press('Enter')
await page.waitForTimeout(8000)

// Grab all divs to see the page structure
const html = await page.evaluate(() => {
  const main = document.querySelector('main') || document.body
  return main.innerHTML.length
})
console.log('main HTML length=', html)

// Find all elements containing the test message text
const found = await page.evaluate((q) => {
  const all = []
  document.querySelectorAll('*').forEach(el => {
    if (el.children.length === 0 && el.textContent.includes(q)) {
      let parent = el
      let path = []
      for (let i = 0; i < 6 && parent; i++) {
        path.push(parent.tagName + (parent.className ? '.' + parent.className.toString().slice(0, 40) : ''))
        parent = parent.parentElement
      }
      all.push({ text: el.textContent.slice(0, 100), path })
    }
  })
  return all
}, testMsg)
console.log('=== element with', testMsg, '===')
found.forEach(f => console.log(JSON.stringify(f, null, 2)))

// Find all direct children of chat body
const chatBodyChildren = await page.evaluate(() => {
  const all = []
  // Find all possible chat/message containers
  const candidates = ['main', 'div[class*="chat"]', 'div[class*="Chat"]', 'div[class*="message"]', 'div[class*="Message"]']
  for (const sel of candidates) {
    const els = document.querySelectorAll(sel)
    if (els.length > 0 && els.length < 30) {
      els.forEach((el, i) => {
        if (el.textContent.length > 50 && el.textContent.length < 500) {
          all.push({ sel: sel + '[' + i + ']', cls: el.className.toString().slice(0, 80), text: el.textContent.slice(0, 200).replace(/\s+/g, ' ') })
        }
      })
    }
  }
  return all.slice(0, 20)
})
console.log('=== chat body candidates ===')
chatBodyChildren.forEach(c => console.log(c.sel, '|', c.text))

await browser.close()
