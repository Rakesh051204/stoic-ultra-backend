const fs = require('fs')
let t = fs.readFileSync('index.js', 'utf8')
if (t.indexOf('RESEARCH-HOOK') >= 0) { console.log('already patched'); process.exit(0) }
const hook = fs.readFileSync('hook-research.txt', 'utf8').trim()
const I = "import { checkSearxngHealth } from './services/webSearchService.js'"
const H = '/* MOD-HOOK-EARLY */'
const bad = []
if (t.split(I).length !== 2) bad.push('import anchor')
if (t.split(H).length !== 2) bad.push('hook anchor')
if (bad.length) { console.log('ANCHOR PROBLEM ' + bad.join(', ')); process.exit(1) }
t = t.split(I).join(I + "\nimport { isResearchRequest, runResearch } from './lib/research.js'")
t = t.split(H).join(hook + '\n    ' + H)
fs.writeFileSync('index.js', t)
console.log('patched ok')