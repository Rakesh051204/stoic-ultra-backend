const fs = require('fs')
let a = fs.readFileSync('lib/threeAI.cjs', 'utf8')
let s = fs.readFileSync('lib/shape3d.cjs', 'utf8')
if (a.indexOf('helpers3d.txt') >= 0) { console.log('already patched'); process.exit(0) }
const A1 = "const SYS = require('fs').readFileSync(require('path').join(__dirname, 'prompt3d.txt'), 'utf8')"
const A2 = "const err = bodyOK(body)"
const A3 = "Describe this object for a 3D modeler: overall shape, each main part with relative size and position, and colors. Max 150 words."
const S1 = "In under 120 words describe the real object"
const miss = []
if (a.indexOf(A1) < 0) miss.push('A1 SYS line')
if (a.split(A2).length !== 2) miss.push('A2 bodyOK line')
if (a.indexOf(A3) < 0) miss.push('A3 vision text')
if (s.indexOf(S1) < 0) miss.push('S1 planner text')
if (miss.length) { console.log('MISSING ' + miss.join(', ')); process.exit(1) }
const rd = "require('fs').readFileSync(require('path').join(__dirname, "
a = a.split(A1).join("const HELPERS = " + rd + "'helpers3d.txt'), 'utf8')\n" + A1 + " + '\\n\\n' + " + rd + "'rules3d.txt'), 'utf8')")
a = a.split(A2).join("body = HELPERS + '\\n' + body\n    " + A2)
a = a.split(A3).join("Describe this building or object for a 3D modeler in under 200 words, plain text. For a building give: number of floors, footprint shape and the main wings with relative width, depth and height, the roof type of each wing and which way its ridge runs, garage, chimneys, entrance, number of window rows, wall and roof colors, and any driveway or trees. For other objects give overall shape, each main part with relative size and position, and colors.")
s = s.split(S1).join("In under 150 words describe the real object (for a building include floors, footprint shape, wings, roof type and ridge direction, garage, chimneys, window rows, entrance)")
fs.writeFileSync('lib/threeAI.cjs', a)
fs.writeFileSync('lib/shape3d.cjs', s)
console.log('patched ok')