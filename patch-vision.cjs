const fs = require('fs')
let t = fs.readFileSync('lib/threeAI.cjs', 'utf8')
if (t.indexOf('vision-model.txt') >= 0) { console.log('threeAI already reads vision-model.txt'); process.exit(0) }
const a = "const VISION = process.env.GROQ_VISION_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct'"
if (t.indexOf(a) < 0) { console.log('MISSING VISION line'); process.exit(1) }
t = t.split(a).join("const VISION = process.env.GROQ_VISION_MODEL || (function () { try { return require('fs').readFileSync(require('path').join(__dirname, 'vision-model.txt'), 'utf8').trim() } catch (e) { return '' } })() || 'meta-llama/llama-4-scout-17b-16e-instruct'")
fs.writeFileSync('lib/threeAI.cjs', t)
console.log('threeAI patched ok')