require('dotenv').config()
const fs = require('fs')
const path = require('path')
const key = process.env.GROQ_API_KEY
const model = process.env.VISION_MODEL || 'qwen/qwen3.8-27b'
async function main() {
  const up = path.join(__dirname, 'uploads')
  const fl = fs.readdirSync(up).filter(function (x) { return /\.(png|jpe?g|webp)$/i.test(x) }).map(function (x) { const st = fs.statSync(path.join(up, x)); return { x: x, t: st.mtimeMs, s: st.size } }).sort(function (a, b) { return b.t - a.t })
  if (!fl[0]) { console.log('no photo in uploads folder - attach one in the app once, then rerun'); process.exit(2) }
  const f = fl[0]
  console.log('photo: ' + f.x + ' | ' + f.s + ' bytes')
  const ext = path.extname(f.x).toLowerCase()
  const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg'
  const url = 'data:' + mime + ';base64,' + fs.readFileSync(path.join(up, f.x)).toString('base64')
  const t0 = Date.now()
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
    body: JSON.stringify({ model: model, max_tokens: 300, messages: [{ role: 'user', content: [{ type: 'text', text: 'Describe this image in 15 words.' }, { type: 'image_url', image_url: { url: url } }] }] })
  })
  const j = await r.json().catch(function () { return {} })
  const sec = ((Date.now() - t0) / 1000).toFixed(1)
  if (!r.ok) { console.log('FAIL ' + model + ' status=' + r.status + ' ' + sec + 's ' + String((j.error && j.error.message) || '').slice(0, 200)); process.exit(1) }
  const said = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || ''
  console.log('WORKS ' + model + ' ' + sec + 's -> ' + said.slice(0, 120))
}
main().catch(function (e) { console.log('error: ' + e.message); process.exit(1) })