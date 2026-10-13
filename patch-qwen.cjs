const fs = require('fs')
let t = fs.readFileSync('lib/threeAI.cjs', 'utf8')
if (t.indexOf('process.env.VISION_MODEL') >= 0) { console.log('already patched'); process.exit(0) }
const a = 'process.env.GROQ_VISION_MODEL ||'
if (t.indexOf(a) < 0) { console.log('MISSING anchor'); process.exit(1) }
t = t.split(a).join("process.env.GROQ_VISION_MODEL || process.env.VISION_MODEL || 'qwen/qwen3.8-27b' ||")
fs.writeFileSync('lib/threeAI.cjs', t)
console.log('threeAI patched ok')