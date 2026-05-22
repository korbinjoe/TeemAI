import WebSocket from 'ws'
// No admin API available — use a different chatId to check if dev:snapshot lists cross-chat sessions
const chatIds = ['fv0ZK6BhLrkZ']
let done = 0
for (const chatId of chatIds) {
  const ws = new WebSocket('ws://localhost:13001/ws')
  ws.on('open', () => {
    ws.send(JSON.stringify({ type: 'dev:subscribe', payload: { chatId } }))
    ws.send(JSON.stringify({ type: 'dev:snapshot', payload: { chatId } }))
  })
  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString())
    if (msg.type === 'dev:snapshot') {
      const p = msg.payload
      console.log(`[chatId=${chatId}] sessions=${p.sessions.length}`)
      p.sessions.forEach(s => console.log(`  origin=${s.origin} sessionId=${s.sessionId.slice(0,12)} cliSid=${s.cliSessionId} alive=${s.streamJson?.alive} pid=${s.streamJson?.pid}`))
      ws.close()
      done++
      if (done === chatIds.length) process.exit(0)
    }
  })
}
setTimeout(() => process.exit(1), 5000)
