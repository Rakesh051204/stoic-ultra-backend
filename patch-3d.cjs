const fs = require('fs')
let t = fs.readFileSync('lib/gameBuild.cjs', 'utf8')
if (t.indexOf('T3D_RE') >= 0) { console.log('already patched'); process.exit(0) }
const miss = []
function rep(a, b) { if (t.indexOf(a) < 0) { miss.push(a.slice(0, 60)); return } t = t.split(a).join(b) }
rep("const app = require('./appAI.cjs')", "const app = require('./appAI.cjs')\nconst t3 = require('./threeAI.cjs')")
rep("function isGameRequest(text) {", "const T3D_RE = /\\b(build|make|create|generate|design|model|show)\\b[^.?!]{0,60}(\\b3d\\b|three\\.?js)/i\nfunction isGameRequest(text) {")
rep("|| APP_RE.test(t))", "|| APP_RE.test(t) || T3D_RE.test(t))")
rep("if (!res && APP_RE.test(text)", "if (!res && T3D_RE.test(text) && !/\\bgame\\b/i.test(text)) {\n    const a3 = await t3.generate3D(text, null)\n    if (!a3.ok) return { ok: false, error: '3d build failed' }\n    res = { html: a3.html, game: '3d', matched: true, name: a3.name, headline: a3.headline, help: a3.help }\n  }\n  if (!res && APP_RE.test(text)")
if (miss.length) { console.log('MISSING: ' + miss.join(' || ')); process.exit(1) }
fs.writeFileSync('lib/gameBuild.cjs', t)
console.log('patched ok')