const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const g = require('./gameSite.cjs')
const ai = require('./gameAI.cjs')
const app = require('./appAI.cjs')
const t3 = require('./threeAI.cjs')
const OUT = path.join(__dirname, 'games', '_built')

const STEALTH_RE = /\b(bond|007|spy|secret agent|stealth|hitman|assassin|infiltrat\w*)\b/i
const STEALTH_FILE = path.join(__dirname, 'games', 'stealth.html')
const STOP = new Set('please can you could would build make create give me a an the some demo new cool simple any game games gaming app apps website site and link links with my i want to play for us show let lets start one test sample example online browser web it that this now quickly fast'.split(' '))
const TITLES = 'flappy|snake|tetris|chess|checkers|pong|breakout|arkanoid|wordle|sudoku|minesweeper|pac-?man|invaders|asteroids|hangman|tic.?tac.?toe|2048|platformer|shooter|zombie|maze|ludo|carrom|tower defense|battle royale|gta|pubg|asphalt|mario'
const STRICT = new RegExp('\\b(build|make|create|code|develop|generate|play|program)\\b[^.?!]{0,50}\\b(' + TITLES + ')\\b', 'i')

const APP_RE = /\b(build|make|create|code|develop|generate)\b[^.?!]{0,60}\b(calculator|timer|stopwatch|countdown|to-?do|quiz|clock|converter|tracker|planner|simulator|simulation|animation|piano|metronome|dice|drawing app|paint app|mini ?app|web ?app)\b/i
const T3D_RE = /\b(build|make|create|generate|design|model|show|convert|turn|transform|render|recreate)\b[^.?!]{0,60}(\b3d\b|three\.?js)/i
function isGameRequest(text) {
  const t = String(text || '')
  return t.length < 400 && (g.isGameRequest(t) || STRICT.test(t) || APP_RE.test(t) || T3D_RE.test(t))
}
function isGeneric(text) {
  const words = String(text || '').toLowerCase().match(/[a-z0-9]+/g) || []
  return words.filter(function (w) { return !STOP.has(w) }).length === 0
}

async function askGroq(prompt) {
  const key = process.env.GROQ_API_KEY
  if (!key) return ''
  const ctl = new AbortController()
  const t = setTimeout(function () { ctl.abort() }, 8000)
  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({
        model: process.env.GROQ_GAME_MODEL || 'qwen/qwen3.8-27b',
        temperature: 0.8,
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }]
      })
    })
    const j = await r.json()
    return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || ''
  } catch (e) {
    return ''
  } finally {
    clearTimeout(t)
  }
}

function sweep() {
  try {
    const now = Date.now()
    fs.readdirSync(OUT).forEach(function (f) {
      const p = path.join(OUT, f)
      if (now - fs.statSync(p).mtimeMs > 7 * 864e5) fs.unlinkSync(p)
    })
  } catch (e) {}
}

async function buildGame(text, baseUrl, image) {
  text = String(text || '').slice(0, 600)
  const p = g.pick(text)
  let res = null
  if (STEALTH_RE.test(text) && fs.existsSync(STEALTH_FILE)) res = { html: fs.readFileSync(STEALTH_FILE, 'utf8'), game: 'stealth', matched: true, name: 'Operation Night Tide', headline: 'Infiltrate the villa and escape by boat', help: 'WASD move, Shift sneak, mouse aim, click shoot, E takedown or hack, 1-4 gadgets' }
  if (!res && T3D_RE.test(text) && !/\bgame\b/i.test(text)) {
    const a3 = await t3.generate3D(text, image || null)
    if (!a3.ok) return { ok: false, error: '3d build failed' }
    res = { html: a3.html, game: '3d', matched: true, name: a3.name, headline: a3.headline, help: a3.help }
  }
  if (!res && APP_RE.test(text) && !/\bgame\b/i.test(text)) {
    const a = await app.generateApp(text)
    if (!a.ok) return { ok: false, error: 'app build failed' }
    res = { html: a.html, game: 'app', matched: true, name: a.name, headline: a.headline, help: a.help }
  }
  if (!res && !p.matched && !isGeneric(text)) {
    const r = await ai.generateGame(text)
    if (r.ok) res = { html: r.html, game: 'ai', matched: true, name: r.name, headline: r.headline, help: r.help }
  }
  if (!res) {
    if (!p.id) return { ok: false, error: 'no games installed' }
    const raw = await askGroq(g.copyPrompt(text, p.id))
    const out = g.make(text, raw)
    res = { html: out.html, game: out.id, matched: p.matched || isGeneric(text), name: out.site.name, headline: out.site.headline, help: '' }
  }
  fs.mkdirSync(OUT, { recursive: true })
  const id = crypto.randomBytes(4).toString('hex')
  fs.writeFileSync(path.join(OUT, id + '.html'), res.html, 'utf8')
  sweep()
  return {
    ok: true,
    id: id,
    url: String(baseUrl || '').replace(/\/$/, '') + '/api/games/play/' + id,
    html: res.html,
    game: res.game,
    matched: res.matched,
    name: res.name,
    headline: res.headline,
    help: res.help
  }
}

function saveHtml(html) {
  fs.mkdirSync(OUT, { recursive: true })
  const id = crypto.randomBytes(4).toString('hex')
  fs.writeFileSync(path.join(OUT, id + '.html'), String(html), 'utf8')
  sweep()
  return id
}

function read(id) {
  if (!/^[a-f0-9]{8}$/.test(String(id))) return null
  try { return fs.readFileSync(path.join(OUT, id + '.html'), 'utf8') } catch (e) { return null }
}

module.exports = { buildGame, read, saveHtml, isGameRequest, isGeneric }