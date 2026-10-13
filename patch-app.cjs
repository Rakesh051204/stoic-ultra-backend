const fs = require('fs')
let t = fs.readFileSync('lib/gameBuild.cjs', 'utf8')
if (t.indexOf('APP_RE') >= 0) { console.log('already patched'); process.exit(0) }
const miss = []
function rep(a, b) { if (t.indexOf(a) < 0) { miss.push(a.slice(0, 60)); return } t = t.split(a).join(b) }
rep("const ai = require('./gameAI.cjs')", "const ai = require('./gameAI.cjs')\nconst app = require('./appAI.cjs')")
rep("function isGameRequest(text) {", "const APP_RE = /\\b(build|make|create|code|develop|generate)\\b[^.?!]{0,60}\\b(calculator|timer|stopwatch|countdown|to-?do|quiz|clock|converter|tracker|planner|simulator|simulation|animation|piano|metronome|dice|drawing app|paint app|mini ?app|web ?app)\\b/i\nfunction isGameRequest(text) {")
rep("(g.isGameRequest(t) || STRICT.test(t))", "(g.isGameRequest(t) || STRICT.test(t) || APP_RE.test(t))")
rep("if (!res && !p.matched && !isGeneric(text)) {", "if (!res && APP_RE.test(text) && !/\\bgame\\b/i.test(text)) {\n    const a = await app.generateApp(text)\n    if (!a.ok) return { ok: false, error: 'app build failed' }\n    res = { html: a.html, game: 'app', matched: true, name: a.name, headline: a.headline, help: a.help }\n  }\n  if (!res && !p.matched && !isGeneric(text)) {")
if (miss.length) { console.log('MISSING: ' + miss.join(' || ')); process.exit(1) }
fs.writeFileSync('lib/gameBuild.cjs', t)
console.log('patched ok')