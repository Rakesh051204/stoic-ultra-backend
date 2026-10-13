const fs = require('fs')
let t = fs.readFileSync('lib/research.js', 'utf8')
if (t.indexOf('[research] queries:') >= 0) { console.log('already patched'); process.exit(0) }
const A1 = "if (!queries.length) queries = [topic]"
const A2 = "const lists = await Promise.all(qs.map(function (q) { return findHits(q, 5) }))"
const A3 = "if (!first.length) {"
const bad = []
;[A1, A2, A3].forEach(function (a, i) { if (t.split(a).length !== 2) bad.push('A' + (i + 1)) })
if (bad.length) { console.log('ANCHOR PROBLEM ' + bad.join(', ')); process.exit(1) }
t = t.split(A1).join(A1 + "\n    console.log('[research] queries: ' + JSON.stringify(queries))")
t = t.split(A2).join(A2 + "\n      console.log('[research] hits per query: ' + lists.map(function (l) { return l.length }).join(','))")
t = t.split(A3).join("if (!first.length) { console.log('[research] no hits after filtering');")
fs.writeFileSync('lib/research.js', t)
console.log('patched ok')