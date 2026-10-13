const r = await fetch('http://localhost:3001/api/chat/stream', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'research how solid-state batteries work and when they will be in cars', sessionId: 'rtest' }) })
const reader = r.body.getReader()
const dec = new TextDecoder()
let buf = ''
let shown = 0
const t0 = Date.now()
while (Date.now() - t0 < 25000) {
  const x = await reader.read()
  if (x.done) break
  buf += dec.decode(x.value, { stream: true })
  const parts = buf.split('\n\n')
  buf = parts.pop()
  for (const p of parts) {
    if (p.indexOf('data: ') !== 0) continue
    try {
      const o = JSON.parse(p.slice(6))
      if (o.event === 'thinking') console.log('thinking: ' + o.text)
      else if (o.event === 'token') { if (shown++ < 1) console.log('first text: ' + String(o.text).slice(0, 70)) }
      else console.log('event: ' + o.event)
    } catch (e) {}
  }
}
process.exit(0)