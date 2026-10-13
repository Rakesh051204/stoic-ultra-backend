const fs = require('fs')
let t = fs.readFileSync('lib/threeAI.cjs', 'utf8')
if (t.indexOf('prompt3d.txt') >= 0) { console.log('already patched'); process.exit(0) }
const re = /const SYS = \[[\s\S]*?\]\.join\('\\n'\)/
if (!re.test(t)) { console.log('MISSING SYS block'); process.exit(1) }
t = t.replace(re, function () { return "const SYS = require('fs').readFileSync(require('path').join(__dirname, 'prompt3d.txt'), 'utf8')" })
fs.writeFileSync('lib/threeAI.cjs', t)
console.log('patched ok')