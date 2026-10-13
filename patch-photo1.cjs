const fs = require('fs')
let t = fs.readFileSync('lib/gameBuild.cjs', 'utf8')
if (t.indexOf('saveHtml') >= 0) { console.log('gameBuild already patched'); process.exit(0) }
const miss = []
function rep(a, b) { if (t.indexOf(a) < 0) { miss.push(a.slice(0, 60)); return } t = t.split(a).join(b) }
rep("async function buildGame(text, baseUrl) {", "async function buildGame(text, baseUrl, image) {")
rep("t3.generate3D(text, null)", "t3.generate3D(text, image || null)")
rep("(build|make|create|generate|design|model|show)", "(build|make|create|generate|design|model|show|convert|turn|transform|render|recreate)")
rep("function read(id) {", "function saveHtml(html) {\n  fs.mkdirSync(OUT, { recursive: true })\n  const id = crypto.randomBytes(4).toString('hex')\n  fs.writeFileSync(path.join(OUT, id + '.html'), String(html), 'utf8')\n  sweep()\n  return id\n}\n\nfunction read(id) {")
rep("module.exports = { buildGame, read, isGameRequest, isGeneric }", "module.exports = { buildGame, read, saveHtml, isGameRequest, isGeneric }")
if (miss.length) { console.log('MISSING: ' + miss.join(' || ')); process.exit(1) }
fs.writeFileSync('lib/gameBuild.cjs', t)
console.log('gameBuild patched ok')