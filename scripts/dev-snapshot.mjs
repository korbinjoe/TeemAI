import WebSocket from 'ws'
const ws = new WebSocket('ws://localhost:13001/ws')
ws.on('open', () => ws.send(JSON.stringify({ type: 'dev:subscribe', payload: { chatId: 'fv0ZK6BhLrkZ' } })) || ws.send(JSON.stringify({ type: 'dev:snapshot', payload: { chatId: 'fv0ZK6BhLrkZ' } })))
ws.on('message', (data) => {
  const msg = JSON.parse(data.toString())
  if (msg.type === 'dev:snapshot') {
    const p = msg.payload
    console.log(`mode=${p.mode} sessions=${p.sessions.length} sandbox.tasks=${p.sandbox.tasks.length}`)
    p.sessions.forEach(s => console.log(`  session: id=${s.sessionId.slice(0,12)} agent=${s.agentId} status=${s.status} cliSid=${s.cliSessionId?.slice(0,12)} alive=${s.streamJson?.alive} cwd...`))
    process.exit(0)
  }
})
setTimeout(() => process.exit(1), 5000)
