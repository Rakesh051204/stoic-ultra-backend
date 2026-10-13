require('dotenv').config()
const fs = require('fs')
const path = require('path')
const key = process.env.GROQ_API_KEY
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }
async function main() {
  const up = path.join(__dirname, 'uploads')
  let img = null
  try {
    const fl = fs.readdirSync(up).filter(function (f) { return /\.(png|jpe?g|webp)$/i.test(f) }).map(function (f) { const st = fs.statSync(path.join(up, f)); return { f: f, t: st.mtimeMs, s: st.size } }).sort(function (a, b) { return b.t - a.t })
    if (fl[0]) img = fl[0]
  } catch (e) {}
  if (!img) { console.log('no photo found in the uploads folder - attach a photo in the app once, then rerun this block'); return }
  console.log('test photo: ' + img.f + ' | size ' + img.s + ' bytes' + (img.s > 2800000 ? ' | TOO BIG (limit 2.8 MB) - use a smaller photo' : ' | size ok'))
  const url = 'data:' + MIME[path.extname(img.f).toLowerCase()] + ';base64,' + fs.readFileSync(path.join(up, img.f)).toString('base64')
  const lr = await fetch('https://api.groq.com/openai/v1/models', { headers: { Authorization: 'Bearer ' + key } })
  const lj = await lr.json().catch(function () { return {} })
  const ids = (lj.data || []).map(function (m) { return m.id })
  console.log('all models: ' + ids.join(', '))
  const cand = ids.filter(function (id) { return /scout|maverick|vision|-vl|llama-4|pixtral/i.test(id) })
  if (!cand.length) { console.log('no vision-looking models in your Groq list - send me the list above'); return }
  for (const id of cand) {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({ model: id, max_tokens: 60, messages: [{ role: 'user', content: [{ type: 'text', text: 'Describe this image in 10 words.' }, { type: 'image_url', image_url: { url: url } }] }] })
    })
    const j = await r.json().catch(function () { return {} })
    if (r.ok) {
      const said = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || ''
      console.log('WORKS: ' + id + ' -> ' + said.slice(0, 80))
      fs.writeFileSync(path.join(__dirname, 'lib', 'vision-model.txt'), id, 'utf8')
      console.log('saved vision model: ' + id)
      return
    }
    console.log('fails: ' + id + ' status=' + r.status + ' ' + String((j.error && j.error.message) || '').slice(0, 110))
  }
  console.log('no working vision model found - send me this output')
}
main()