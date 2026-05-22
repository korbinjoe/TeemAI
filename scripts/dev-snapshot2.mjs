import WebSocket from 'ws'
const ws = new WebSocket('ws://localhost:13001/ws')
ws.on('open', () => {
  ws.send(JSON.stringify({ type: 'dev:subscribe', payload: { chatId: 'fv0ZK6BhLrkZ' } }))
  ws.send(JSON.stringify({ type: 'dev:snapshot', payload: { chatId: 'fv0ZK6BhLrkZ' } }))
})
ws.on('message', (data) => {
  const msg = JSON.parse(data.toString())
  if (msg.type === 'dev:snapshot') {
    const p = msg.payload
    console.log(`mode=${p.mode} sessions.local=${p.sessions.filter(s=>s.origin!=='cloud').length} sessions.cloud=${p.sessions.filter(s=>s.origin==='cloud').length}`)
    console.log(`chat.taskStatus=${p.chat?.taskStatus} expertSessions=${JSON.stringify(p.chat?.expertSessions).slice(0,200)}`)
    p.sessions.forEach(s => console.log(`  origin=${s.origin} status=${s.status} alive=${s.streamJson?.alive} cliSid=${s.cliSessionId} cwd=${s.cwd?? 'unknown'} session=${s.sessionId.slice(0,12)}`))
    process.exit(0)
  }
})
setTimeout(() => process.exit(1), 5000)
