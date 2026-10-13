const fs = require('fs')
const path = require('path')
let L = []
try { L = JSON.parse(fs.readFileSync(path.join(__dirname, 'landmarks3d.json'), 'utf8')) } catch (e) { L = [] }

function hintFor(text) {
  for (let i = 0; i < L.length; i++) {
    if (new RegExp(L[i].re, 'i').test(text)) return L[i].hint
  }
  return ''
}

const SYS = 'You are a 3D modeling planner. In under 120 words describe the real object so it can be built from boxes, cylinders, spheres and cones: overall proportions (height to width), main sections from bottom to top with size, shape and color, and its distinctive features. Interpret misspellings. If it is a famous building or landmark, describe its real design accurately. Output plain text only.'

async function planShape(text, desc, chat, models) {
  const hint = hintFor(String(text || ''))
  const user = 'Object: ' + String(text || '').slice(0, 300) + (desc ? '\nPhoto description: ' + desc : '') + (hint ? '\nKnown real design: ' + hint : '')
  const r = await chat(models[0], [{ role: 'system', content: SYS }, { role: 'user', content: user }], 400)
  const plan = r && r.ok ? String(r.text || '').trim().slice(0, 1200) : ''
  return plan || hint
}

module.exports = { planShape }