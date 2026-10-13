const fs = require('fs')
let t = fs.readFileSync('lib/threeAI.cjs', 'utf8')
if (t.indexOf('GROQ_VISION_MODEL') >= 0) { console.log('threeAI already patched'); process.exit(0) }
const miss = []
function rep(a, b) { if (t.indexOf(a) < 0) { miss.push(a.slice(0, 60)); return } t = t.split(a).join(b) }
rep("const VISION = 'meta-llama/llama-4-scout-17b-16e-instruct'", "const VISION = process.env.GROQ_VISION_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct'")
rep("return r.ok ? clean(r.text, 900) : ''", "if (!r.ok) console.log('[threeAI] vision failed status=' + r.status + ' model=' + VISION)\n  return r.ok ? clean(r.text, 900) : ''")
rep("const desc = await describe(image)", "const desc = await describe(image)\n  if (image && !desc) return { ok: false }")
rep("return { ok: true, html: html, name: name,", "return { ok: true, html: html, name: (/^(this|it|that|image|photo|picture|pic)\\b/i.test(name) ? '3D Model' : name),")
if (miss.length) { console.log('MISSING: ' + miss.join(' || ')); process.exit(1) }
fs.writeFileSync('lib/threeAI.cjs', t)
console.log('threeAI patched ok')