const fs = require('fs')
const path = require('path')
const DIR = path.join(__dirname, 'games')

// Add a new game = drop an html file in lib/games and add one line here.
const GAMES = {
  racing: { label: '3D night-city racing', re: /rac(e|ing|er)|\bcars?\b|driv|nitro|asphalt|drift|speed|bike|motor/i, file: 'racing.html' }
}

function clean(s, max) {
  return String(s || '').replace(/[<>\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
}
function available() {
  return Object.keys(GAMES).filter(function (k) { return fs.existsSync(path.join(DIR, GAMES[k].file)) })
}
function list() {
  return available().map(function (k) { return { id: k, label: GAMES[k].label } })
}
function pick(text) {
  const t = String(text || '')
  const a = available()
  for (let i = 0; i < a.length; i++) if (GAMES[a[i]].re.test(t)) return { id: a[i], matched: true }
  return { id: a[0] || null, matched: false }
}
function isGameRequest(text) {
  const t = String(text || '')
  return /\b(build|make|create|design|generate|code|develop|want|give)\b[^.?!]{0,60}\b(game|games|gaming|arcade)\b/i.test(t) ||
    /\b(racing|shooter|gta|pubg|asphalt|battle royale)\b[^.?!]{0,40}\b(game|website|app)\b/i.test(t)
}
function copyPrompt(userText, id) {
  const label = GAMES[id] ? GAMES[id].label : 'browser game'
  return 'The user asked: "' + clean(userText, 400) + '". We are building them a ' + label + ' game site. Reply with ONLY a JSON object, no markdown, with keys: name (2-3 words, the game brand), headline (under 10 words), sub (one exciting sentence under 25 words). No HTML.'
}
function parseCopy(raw) {
  let o = {}
  try {
    const s = String(raw || '')
    o = JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1))
  } catch (e) {}
  return {
    name: clean(o.name, 40) || 'Nitro Rush',
    headline: clean(o.headline, 80) || 'Race the night city',
    sub: clean(o.sub, 200) || 'Dodge traffic, hit nitro and beat your best score.'
  }
}
function make(userText, raw) {
  const p = pick(userText)
  if (!p.id) throw new Error('no games installed')
  const site = parseCopy(raw)
  const tpl = fs.readFileSync(path.join(DIR, GAMES[p.id].file), 'utf8')
  const json = JSON.stringify(site).replace(/</g, '\\u003c')
  return { id: p.id, matched: p.matched, site: site, html: tpl.replace('__SITE__', function () { return json }) }
}
module.exports = { list, pick, isGameRequest, isGameSiteRequest: isGameRequest, copyPrompt, parseCopy, make }