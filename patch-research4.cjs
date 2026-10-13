const fs = require('fs')
let t = fs.readFileSync('lib/research.js', 'utf8')
if (t.indexOf('function isHome') >= 0) { console.log('already patched'); process.exit(0) }
const A1 = "const BAD = /porn|xxx|xvideos|xnxx|redtube|onlyfans|hentai|escort|casino|betting/i"
const A2 = "!BAD.test(x.url + ' ' + x.title + ' ' + x.text) })"
const A3 = "so results stay on topic. No other text."
const A4 = "Exclude adult content, spam, login pages and off-topic pages."
const A5 = "if (keep.length >= 2) sources = keep.map(function (n) { return sources[n - 1] })"
const A6 = "const lists = await Promise.all(qs.map(function (q) { return findHits(q, 5) }))"
const A7 = "async function out(send, text) {"
const all = [A1, A2, A3, A4, A5, A6, A7]
const bad = []
all.forEach(function (a, i) { if (t.split(a).length !== 2) bad.push('A' + (i + 1)) })
if (bad.length) { console.log('ANCHOR PROBLEM ' + bad.join(', ')); process.exit(1) }
t = t.split(A1).join(A1 + "\nfunction isHome(u) { try { const p = new URL(u).pathname; return p === '/' || p === '' } catch (e) { return false } }")
t = t.split(A2).join("!BAD.test(x.url + ' ' + x.title + ' ' + x.text) && !isHome(x.url) })")
t = t.split(A3).join("so results stay on topic. Make every query specific enough to return articles, reports, statistics or listings rather than home pages, and include the country, the year 2026 or the kind of document wanted (report, statistics, salary survey, job listings) when relevant. No other text.")
t = t.split(A4).join("Exclude adult content, spam, login pages, company home pages, generic dictionary or encyclopedia entries for a single common word, and any page that does not help answer the question.")
t = t.split(A5).join("console.log('[research] picker kept: ' + JSON.stringify(keep) + ' of ' + sources.length)\n    if (keep.length >= 1) sources = keep.map(function (n) { return sources[n - 1] })")
t = t.split(A6).join("let lists = await Promise.all(qs.map(function (q) { return findHits(q, 5) }))\n      if (!lists.some(function (l) { return l.length })) { console.log('[research] no hits, retrying once'); await pace(2500); lists = await Promise.all(qs.map(function (q) { return findHits(q, 5) })) }")
t = t.split(A7).join(A7 + "\n  text = String(text).replace(/[\\u200B-\\u200D\\uFEFF]/g, '')")
fs.writeFileSync('lib/research.js', t)
console.log('patched ok')