const fs = require('fs')
let t = fs.readFileSync('lib/threeAI.cjs', 'utf8')
if (t.indexOf('shape3d') >= 0) { console.log('already patched'); process.exit(0) }
const miss = []
function rep(a, b) { if (t.indexOf(a) < 0) { miss.push(a.slice(0, 60)); return } t = t.split(a).join(b) }
rep("const vm = require('vm')", "const vm = require('vm')\nconst sh = require('./shape3d.cjs')")
rep("const desc = await describe(image)", "const desc = await describe(image)\n  const shape = await sh.planShape(userText, desc, chat, MODELS)")
rep("const q = 'Build this 3D object: ' + subject +", "const q = 'Build this 3D object: ' + subject + (shape ? '\\nPlan of the real object:\\n' + shape : '') +")
rep(", 40) || '3D Model'", ", 40).replace(/^(3d|three\\.?js)\\s*(image|model|object|version)?\\s*(of|for)?\\s*/i, '') || '3D Model'")
if (miss.length) { console.log('MISSING: ' + miss.join(' || ')); process.exit(1) }
fs.writeFileSync('lib/threeAI.cjs', t)
console.log('patched ok')