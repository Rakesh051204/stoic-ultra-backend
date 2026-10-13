const fs = require('fs')
let t = fs.readFileSync('lib/research.js', 'utf8')
if (t.indexOf('const BAD =') >= 0) { console.log('already patched'); process.exit(0) }
const A1 = "const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'"
const A2 = ".test(x.url) })"
const A3 = "that together cover the question from different angles. No other text."
const A4 = "send('thinking', { text: 'Writing the report' })"
const A5 = "'](' + s.url + ')' }).join('\\n')"
const all = [A1, A2, A3, A4, A5]
const bad = []
all.forEach(function (a, i) { if (t.split(a).length !== 2) bad.push('A' + (i + 1)) })
if (bad.length) { console.log('ANCHOR PROBLEM ' + bad.join(', ')); process.exit(1) }
const R1 = A1 + "\nconst BAD = /porn|xxx|xvideos|xnxx|redtube|onlyfans|hentai|escort|casino|betting/i"
const R2 = ".test(x.url) && !BAD.test(x.url + ' ' + x.title + ' ' + x.text) })"
const R3 = "that together cover the question from different angles. Keep compound terms intact (for example solid-state batteries) and add one disambiguating word such as battery, technology or science to each query so results stay on topic. No other text."
const R4 = [
  "send('thinking', { text: 'Picking the best sources' })",
  "    const pick = await llm('You filter research sources. Reply with ONLY a JSON array of the numbers of the sources that are clearly about the question and useful for answering it. Exclude adult content, spam, login pages and off-topic pages.', 'Question: ' + topic + '\\nSources:\\n' + sources.map(function (s, i) { return (i + 1) + '. ' + s.title + ' (' + hostOf(s.url) + '): ' + s.text.slice(0, 160) }).join('\\n'), 500, 30000)",
  "    const keep = Array.from(new Set(parseList(pick).map(function (x) { return parseInt(x, 10) }).filter(function (n) { return n >= 1 && n <= sources.length })))",
  "    if (keep.length >= 2) sources = keep.map(function (n) { return sources[n - 1] })",
  "    " + A4
].join("\n")
const R5 = "'](' + s.url + ')' }).join('\\n\\n')"
t = t.split(A1).join(R1)
t = t.split(A2).join(R2)
t = t.split(A3).join(R3)
t = t.split(A4).join(R4)
t = t.split(A5).join(R5)
fs.writeFileSync('lib/research.js', t)
console.log('patched ok')