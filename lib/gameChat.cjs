const express = require('express')
const fs = require('fs')
const path = require('path')
const gb = require('./gameBuild.cjs')
const imp = require('./improveAI.cjs')
const PATHS = ['/api/chat/stream']
const TOKEN_EVENT = 'token'
const parse = express.json({ limit: '5mb' })
const hits = new Map()
const last = new Map()
let sb = null

const FOLLOW_OK = ['3d', 'app', 'ai']
const FOLLOW_RE = /^\s*(please\s+|can you\s+|could you\s+|now\s+|also\s+)*(add|more|less|remove|delete|increase|decrease|reduce|fix|improve|change|update|replace|enlarge|speed|slow)\b|\bmake (it|this|the)\b/i
const QUESTION_RE = /^\s*(what|why|how|who|when|where|is|are|does|do|explain|tell)\b/i
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' }

function db() {
  if (sb) return sb
  try {
    const mod = require('@supabase/supabase-js')
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) sb = mod.createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  } catch (e) { console.log('[gameChat] supabase unavailable: ' + e.message) }
  return sb
}

async function saveTurn(body, userText, assistantText, game) {
  try {
    const sid = body && body.sessionId
    if (!sid || sid === 'default' || sid === 'voice' || (body && body.incognito)) return
    const s = db()
    if (!s) return
    const now = new Date().toISOString()
    const ex = await s.from('sessions').select('id').eq('id', sid).maybeSingle()
    if (ex.error) { console.log('[gameChat] session lookup failed: ' + ex.error.message); return }
    if (ex.data) {
      await s.from('sessions').update({ updated_at: now }).eq('id', sid)
    } else {
      const title = userText.length > 60 ? userText.slice(0, 60) + '...' : userText
      const ins = await s.from('sessions').insert({ id: sid, title: title, created_at: now, updated_at: now })
      if (ins.error) console.log('[gameChat] session insert failed: ' + ins.error.message)
    }
    const rows = [
      { session_id: sid, role: 'user', content: userText },
      { session_id: sid, role: 'assistant', content: assistantText, sources: [], images: [], meta: { game: game } }
    ]
    let r = await s.from('messages').insert(rows)
    if (r.error) {
      console.log('[gameChat] save with meta failed, retrying without it: ' + r.error.message)
      r = await s.from('messages').insert(rows.map(function (x) { const c = Object.assign({}, x); delete c.meta; return c }))
    }
    if (r.error) console.log('[gameChat] save failed: ' + r.error.message)
  } catch (e) { console.log('[gameChat] save error: ' + e.message) }
}

function limited(ip) {
  const now = Date.now()
  const a = (hits.get(ip) || []).filter(function (t) { return now - t < 60000 })
  a.push(now)
  hits.set(ip, a)
  return a.length > 10
}
function textOf(b) {
  if (!b || typeof b !== 'object') return ''
  const keys = ['message', 'query', 'question', 'prompt', 'q', 'text', 'input', 'content']
  for (let i = 0; i < keys.length; i++) {
    const v = b[keys[i]]
    if (typeof v === 'string' && v) return v
    if (v && typeof v === 'object' && typeof v.content === 'string') return v.content
  }
  const arr = b.messages || b.history
  if (Array.isArray(arr)) {
    for (let i = arr.length - 1; i >= 0; i--) {
      const m = arr[i]
      if (m && (!m.role || m.role === 'user') && typeof m.content === 'string') return m.content
    }
  }
  return ''
}
function base(req) {
  return process.env.PUBLIC_BACKEND_URL || process.env.RENDER_EXTERNAL_URL ||
    ((req.get('x-forwarded-proto') || req.protocol) + '://' + (req.get('x-forwarded-host') || req.get('host')))
}
function thinkingText(text) {
  if (/\bgame\b/i.test(text)) return 'Building your game'
  if (/\b3d\b|three\.?js/i.test(text)) return 'Building your 3D model'
  if (/(calculator|timer|stopwatch|countdown|to-?do|quiz|clock|converter|tracker|planner|simulator|simulation|animation|piano|metronome|dice|drawing app|paint app|mini ?app|web ?app)/i.test(text)) return 'Building your app'
  return 'Building your game'
}
function followUp(sid, text) {
  const l = sid ? last.get(sid) : null
  if (!l || Date.now() - l.ts > 10 * 60 * 1000) return null
  if (FOLLOW_OK.indexOf(l.kind) < 0) return null
  if (text.length > 300 || QUESTION_RE.test(text) || !FOLLOW_RE.test(text)) return null
  return l
}
async function pickImage(sid, text) {
  if (!sid || !/\b(this|image|photo|picture|pic|attached|uploaded|above)\b/i.test(text)) return null
  try {
    const up = await import('../routes/upload.js')
    const recs = (up.getAttachments(sid) || []).slice().reverse()
    for (const r of recs) {
      if (!r || !r.path) continue
      const mime = MIME[path.extname(String(r.path)).toLowerCase()]
      if (!mime) continue
      const buf = fs.readFileSync(r.path)
      if (buf.length > 2800000) { console.log('[gameChat] image too large for the vision model, skipped'); continue }
      return { url: 'data:' + mime + ';base64,' + buf.toString('base64'), clear: up.clearAttachments }
    }
  } catch (e) { console.log('[gameChat] image read failed: ' + e.message) }
  return null
}
async function runBuild(req, text, sid) {
  const img = await pickImage(sid, text)
  const r = await gb.buildGame(text, base(req), img ? img.url : null)
  if (img && r.ok && r.game === '3d' && img.clear) { try { img.clear(sid) } catch (e) {} }
  return r
}
async function runImprove(req, text, prev) {
  const html = gb.read(prev.id)
  if (!html) return { ok: false }
  const out = await imp.improve(html, text)
  if (!out.ok) return { ok: false }
  const id = gb.saveHtml(out.html)
  return { ok: true, id: id, url: base(req).replace(/\/$/, '') + '/api/games/play/' + id, name: prev.name, headline: 'Updated', game: prev.kind, matched: true, help: '', improved: true }
}

module.exports = function gameChat(req, res, next) {
  if (req.method !== 'POST') return next()
  const p = req.originalUrl.split('?')[0].replace(/\/$/, '')
  if (PATHS.indexOf(p) < 0) return next()
  parse(req, res, function (err) {
    if (err) return next(err)
    const text = textOf(req.body)
    if (!text || text.length > 600) return next()
    const sid = req.body && req.body.sessionId
    const fresh = gb.isGameRequest(text)
    const prev = fresh ? null : followUp(sid, text)
    if (!fresh && !prev) return next()
    const head = {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    }
    if (req.headers.origin) {
      head['Access-Control-Allow-Origin'] = req.headers.origin
      head['Access-Control-Allow-Credentials'] = 'true'
      head['Vary'] = 'Origin'
    }
    res.writeHead(200, head)
    const send = function (o) { res.write('data: ' + JSON.stringify(o) + '\n\n') }
    if (limited(req.ip || '')) {
      send({ event: 'error', message: 'You are building too fast. Try again in a minute.' })
      return res.end()
    }
    send({ event: 'thinking', text: prev ? 'Updating your ' + (prev.kind === '3d' ? '3D model' : prev.kind === 'app' ? 'app' : 'game') : thinkingText(text) })
    const job = prev ? runImprove(req, text, prev) : runBuild(req, text, sid)
    job.then(async function (r) {
      if (!r.ok) {
        send({ event: 'error', message: prev ? 'I could not apply that change right now. Please try again.' : 'I could not build that right now. Please try again.' })
        return res.end()
      }
      const game = { id: r.id, url: r.url, name: r.name, headline: r.headline, kind: r.game }
      if (sid) { if (last.size > 300) last.clear(); last.set(sid, { id: r.id, kind: r.game, name: r.name, ts: Date.now() }) }
      send({ event: 'game', game: game })
      let open = 'Play it here: '
      let tip = r.help ? '\n\nHow to play: ' + r.help : ''
      if (r.game === '3d') { open = 'View it here: '; tip = '\n\nHow to rotate: drag to rotate, scroll to zoom.' }
      else if (r.game === 'app') { open = 'Open it here: '; tip = r.help ? '\n\nHow to use: ' + r.help : '' }
      else if (r.game === 'racing') { tip = '\n\nOpen Settings inside the game to change steering, gears (automatic or manual), difficulty and graphics. Brake is S or the Down arrow.' }
      let answer
      if (r.improved) {
        answer = 'Done - I updated **' + r.name + '** with your change.\n\n' + open + r.url
      } else {
        const note = r.matched ? '' : 'I could not build that exact game right now, so here is my 3D racing game instead. Ask again in a minute to retry.\n\n'
        answer = note + 'Here is **' + r.name + '** - ' + r.headline + '.\n\n' + open + r.url + tip
      }
      send({ event: TOKEN_EVENT, text: answer })
      await saveTurn(req.body, text, answer, game)
      res.end()
    }).catch(function (e) {
      console.log('[gameChat] job failed: ' + (e && e.message))
      send({ event: 'error', message: 'I could not build that right now. Please try again.' })
      res.end()
    })
  })
}