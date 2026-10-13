const fs = require('fs')
let a = fs.readFileSync('lib/threeAI.cjs', 'utf8')
let s = fs.readFileSync('lib/shape3d.cjs', 'utf8')
if (a.indexOf('helpers3d.txt') >= 0) { console.log('already patched'); process.exit(0) }
const A1 = "const SYS = require('fs').readFileSync(require('path').join(__dirname, 'prompt3d.txt'), 'utf8')"
const A2 = "const err = bodyOK(body)"
const A3 = "Describe this object for a 3D modeler: overall shape, each main part with relative size and position, and colors. Max 150 words."
const A4 = "async function chat(model, messages, max) {"
const A5 = "const t = setTimeout(function () { ctl.abort() }, 45000)"
const A6 = "const r = await chat(VISION, msgs, 400)"
const A7 = "{ role: 'user', content: q }], 4000)"
const S1 = "In under 120 words describe the real object"
const checks = [[a, A1, 'A1'], [a, A2, 'A2'], [a, A3, 'A3'], [a, A4, 'A4'], [a, A5, 'A5'], [a, A6, 'A6'], [a, A7, 'A7'], [s, S1, 'S1']]
const bad = []
checks.forEach(function (c) { if (c[0].split(c[1]).length !== 2) bad.push(c[2]) })
if (bad.length) { console.log('ANCHOR PROBLEM ' + bad.join(', ')); process.exit(1) }
const rd = "require('fs').readFileSync(require('path').join(__dirname, "
a = a.split(A1).join("const HELPERS = " + rd + "'helpers3d.txt'), 'utf8')\n" + A1 + " + '\\n\\n' + " + rd + "'rules3d.txt'), 'utf8')")
a = a.split(A2).join("body = body + '\\n' + HELPERS\n    " + A2)
a = a.split(A3).join("Describe this building or object for a 3D modeler in under 200 words, plain text. For a building give: number of floors, footprint shape and the main wings with relative width, depth and height, the roof type of each wing and which way its ridge runs, garage, chimneys, entrance, number of window rows, wall and roof colors, and any driveway or trees. For other objects give overall shape, each main part with relative size and position, and colors.")
a = a.split(A4).join("async function chat(model, messages, max, ms) {")
a = a.split(A5).join("const t = setTimeout(function () { ctl.abort() }, ms || 45000)")
a = a.split(A6).join("const r = await chat(VISION, msgs, 500, 90000)")
a = a.split(A7).join("{ role: 'user', content: q }], 4000, 60000)")
s = s.split(S1).join("In under 150 words describe the real object (for a building include floors, footprint shape, wings, roof type and ridge direction, garage, chimneys, window rows, entrance)")
fs.writeFileSync('lib/threeAI.cjs', a)
fs.writeFileSync('lib/shape3d.cjs', s)
console.log('patched ok')