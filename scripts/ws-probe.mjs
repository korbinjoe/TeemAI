import WebSocket from 'ws'
const url = process.argv[2] || 'ws://localhost:13001'
const chatId = process.argv[3] || 'fv0ZK6BhLrkZ'
console.log('connecting', url)
const ws = new WebSocket(url)
ws.on('open', () => {
  console.log('OPEN, subscribing to chat', chatId)
  ws.send(JSON.stringify({ type: 'chat:resume-experts', payload: { chatId } }))
  ws.send(JSON.stringify({ type: 'dev:subscribe', payload: { chatId } }))
  ws.send(JSON.stringify({ type: 'dev:snapshot', payload: { chatId } }))
})
ws.on('message', (data) => {
  try {
    const msg = JSON.parse(data.toString())
    if (['expert:partial-text', 'expert:structured-message', 'expert:started', 'expert:stopped', 'expert:exit', 'expert:activity', 'chat:activity', 'expert:list-updated'].includes(msg.type)) {
      const p = msg.payload || {}
      console.log(`[${new Date().toISOString().slice(11,19)}] ${msg.type} chatId=${p.chatId} agentId=${p.agentId} type=${p.type} msgCount=${(p.messages?.length)??'-'} taskLoc=${p.taskLocation}${msg.type==='expert:partial-text'?' textLen='+(p.text?.length??0):''}${msg.type==='chat:activity'?' phase='+p.activity?.phase:''}`)
    }
  } catch {}
})
ws.on('error', (e) => console.error('ERR', e.message))
ws.on('close', (c, r) => { console.log('CLOSE', c, r?.toString()); process.exit(0) })
setTimeout(() => { console.log('--- 30s timeout, closing ---'); ws.close() }, 30000)
