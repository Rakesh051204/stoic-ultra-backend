const fs = require('fs')
let t = fs.readFileSync('routes/conversations.js', 'utf8')
if (t.indexOf('m.meta.game') >= 0) { console.log('already patched'); process.exit(0) }
const a = "followUps: (m.meta && m.meta.followUps) ? m.meta.followUps : undefined,"
if (t.indexOf(a) < 0) { console.log('MISSING anchor'); process.exit(1) }
t = t.split(a).join(a + " game: (m.meta && m.meta.game) ? m.meta.game : undefined,")
fs.writeFileSync('routes/conversations.js', t)
console.log('patched ok')