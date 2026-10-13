require('dotenv').config()
const fs = require('fs')
const path = require('path')
const key = process.env.GROQ_API_KEY
console.log('GROQ key present: ' + !!key)
async function call(model, content, max) {
  const t0 = Date.now()
  const ctl = new AbortController()
  const to = setTimeout(function () { ctl.abort() }, 60000)
  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({ model: model, max_tokens: max, messages: [{ role: 'user', content: content }] })
    })
    const j = await r.json().catch(function () { return {} })
    const sec = ((Date.now() - t0) / 1000).toFixed(1)
    if (r.ok) console.log('OK   ' + model + ' ' + sec + 's')
    else console.log('FAIL ' + model + ' status=' + r.status + ' ' + sec + 's ' + String((j.error && j.error.message) || '').slice(0, 140))
    return r.ok
  } catch (e) {
    console.log('FAIL ' + model + ' ' + e.name + ' after ' + ((Date.now() - t0) / 1000).toFixed(1) + 's')
    return false
  } finally { clearTimeout(to) }
}
async function main() {
  const lr = await fetch('https://api.groq.com/openai/v1/models', { headers: { Authorization: 'Bearer ' + key } })
  const lj = await lr.json().catch(function () { return {} })
  const ids = (lj.data || []).map(function (m) { return m.id })
  console.log('models status=' + lr.status + ' count=' + ids.length)
  console.log(ids.join(', '))
  console.log('--- text models (same ones threeAI uses) ---')
  await call('openai/gpt-oss-120b', 'Say hi', 50)
  await call('qwen/qwen3.8-27b', 'Say hi', 50)
  console.log('--- vision ---')
  const up = path.join(__dirname, 'uploads')
  let f = null
  try {
    const fl = fs.readdirSync(up).filter(function (x) { return /\.(png|jpe?g|webp)$/i.test(x) }).map(function (x) { return { x: x, t: fs.statSync(path.join(up, x)).mtimeMs } }).sort(function (a, b) { return b.t - a.t })
    if (fl[0]) f = fl[0].x
  } catch (e) {}
  if (!f) { console.log('no photo in uploads folder'); return }
  const ext = path.extname(f).toLowerCase()
  const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg'
  const url = 'data:' + mime + ';base64,' + fs.readFileSync(path.join(up, f)).toString('base64')
  const cand = ids.filter(function (id) { return /scout|maverick|vision|-vl|llama-4|pixtral/i.test(id) })
  console.log('vision candidates: ' + (cand.join(', ') || 'NONE'))
  console.log('current fallback: meta-llama/llama-4-scout-17b-16e-instruct')
  for (const id of cand) {
    const ok = await call(id, [{ type: 'text', text: 'Describe this image in 10 words.' }, { type: 'image_url', image_url: { url: url } }], 60)
    if (ok) { fs.writeFileSync(path.join(__dirname, 'lib', 'vision-model.txt'), id, 'utf8'); console.log('saved vision model: ' + id); break }
  }
}
main()