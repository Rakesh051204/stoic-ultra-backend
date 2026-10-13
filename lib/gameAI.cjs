const fs = require('fs')
const path = require('path')
const vm = require('vm')
const KIT = path.join(__dirname, 'games', '_kit.html')

const SYS = [
  'You write the game logic for a small 2D browser game. A ready-made kit already provides the page, canvas, menus, score display, keyboard and touch controls.',
  'Output ONLY JavaScript. No markdown fences, no HTML, no explanations.',
  'The first line must be exactly: //GAME: <Game Name> | <headline under 8 words> | <how to play in under 12 words>',
  'Then define exactly these top-level functions: function init(){} resets all game state; function update(dt){} advances the game (dt is seconds); function draw(){} paints EVERY frame, starting with a full background.',
  'Globals already defined (never redeclare them): ctx (2D context), W=800, H=500, keys {left,right,up,down,action} (true while held), keys.pressed.left/right/up/down/action (true only on the frame the key went down), ptr {x,y,down,clicked} (pointer in canvas units), score (read only), addScore(n), gameOver(), rand(a,b), randi(a,b), clamp(v,a,b), hit(a,b) for rects {x,y,w,h}, beep(freq,seconds), Math.',
  'Rules: never use document, window, fetch, images or libraries. Draw everything with ctx shapes, gradients and text. Keep game state in top-level variables with unique names. Keep it between 200 and 320 lines. Make it fun, with difficulty that grows. Call gameOver() when the player loses and addScore(n) for points. Support keyboard (keys) and touch/mouse (ptr) where it makes sense.',
  'Make it look and feel like a real game: draw the player, enemies and vehicles as recognizable characters built from several ctx shapes (never plain squares or circles), add a themed animated background with depth, at least 3 enemy or obstacle types, power-ups, a health or lives bar, levels or waves that get harder, particles and screen shake on hits, and show the story goal in the first seconds.',
  'If the user names a commercial game, make an original simplified game in the same genre with an original name and no copyrighted characters.'
].join('\n')

function clean(s, max) {
  return String(s || '').replace(/[<>\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
}

async function chat(model, messages, max) {
  const key = process.env.GROQ_API_KEY
  if (!key) return { ok: false, status: 0 }
  const ctl = new AbortController()
  const t = setTimeout(function () { ctl.abort() }, 40000)
  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({ model: model, messages: messages, temperature: 0.7, max_tokens: max })
    })
    const j = await r.json().catch(function () { return {} })
    if (!r.ok) return { ok: false, status: r.status, msg: JSON.stringify(j.error || '').slice(0, 200) }
    const c = j.choices && j.choices[0]
    return { ok: true, text: (c && c.message && c.message.content) || '', finish: c && c.finish_reason }
  } catch (e) {
    return { ok: false, status: 0 }
  } finally {
    clearTimeout(t)
  }
}

function extract(raw) {
  let t = String(raw || '').trim()
  const f = t.match(/```(?:javascript|js)?[ \t]*\r?\n([\s\S]*?)```/i)
  if (f) t = f[1].trim()
  else t = t.replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/, '').trim()
  const m = t.match(/^\s*\/\/\s*GAME:\s*([^|\n]*)\|\s*([^|\n]*)\|\s*([^\n]*)/i)
  return {
    code: t,
    name: (m && clean(m[1], 40)) || 'Arcade Game',
    head: (m && clean(m[2], 80)) || 'Play it now',
    help: (m && clean(m[3], 120)) || 'Use the arrow keys, Space or touch.'
  }
}

function stub() {
  return new Proxy(function () {}, {
    get: function (t, p) {
      if (p === Symbol.toPrimitive) return function () { return 0 }
      if (p === 'width') return 10
      return stub()
    },
    apply: function () { return stub() },
    set: function () { return true }
  })
}

const PRE = 'var __K={};const ctx=__ctx,W=800,H=500;const keys=__keys,ptr=__ptr;let score=0;' +
  'const rand=__rand,randi=__randi,clamp=__clamp,hit=__hit,addScore=__noop,gameOver=__noop,beep=__noop;'
const RUN = 'if(typeof init!=="function"||typeof update!=="function"||typeof draw!=="function")throw new Error("init, update and draw must all be defined as functions");' +
  'init();for(var __i=0;__i<150;__i++){if(__i%20===0){keys.left=(__i%40===0)?1:0;keys.right=1-keys.left;keys.pressed.action=1;keys.pressed.up=1;ptr.clicked=1;ptr.down=1}update(0.016);draw()}'

function smoke(code) {
  const noop = function () {}
  const sb = {
    __ctx: stub(),
    __keys: { left: 0, right: 0, up: 0, down: 0, action: 0, pressed: { left: 0, right: 0, up: 0, down: 0, action: 0 } },
    __ptr: { x: 400, y: 250, down: 0, clicked: 0 },
    __rand: function (a, b) { return a + Math.random() * (b - a) },
    __randi: function (a, b) { return Math.floor(a + Math.random() * (b - a + 1)) },
    __clamp: function (v, a, b) { return Math.max(a, Math.min(b, v)) },
    __hit: function (a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y },
    __noop: noop,
    console: { log: noop, error: noop, warn: noop }
  }
  try {
    const c = vm.createContext(sb)
    vm.runInContext(PRE, c)
    vm.runInContext(code, c, { timeout: 500 })
    vm.runInContext(RUN, c, { timeout: 800 })
    return null
  } catch (e) {
    return String((e && e.message) || e).slice(0, 220)
  }
}

function assemble(info, code) {
  const esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] }) }
  const safe = code.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--')
  return fs.readFileSync(KIT, 'utf8')
    .replace(/__TITLE__/g, function () { return esc(info.name) })
    .replace('__HEADLINE__', function () { return esc(info.head) })
    .replace('__HELP__', function () { return esc(info.help) })
    .replace('/*__GAME__*/', function () { return safe })
}

async function generateGame(userText) {
  const models = [process.env.GROQ_GAME_AI_MODEL || 'openai/gpt-oss-120b', 'qwen/qwen3.8-27b']
  let mi = 0
  let hint = ''
  for (let attempt = 0; attempt < 3; attempt++) {
    const msgs = [
      { role: 'system', content: SYS },
      { role: 'user', content: 'Game request: ' + clean(userText, 400) + hint }
    ]
    const r = await chat(models[mi], msgs, 6000)
    if (!r.ok) { console.log('[gameAI] attempt ' + attempt + ' groq failed, status=' + r.status + ' model=' + models[mi] + ' ' + (r.msg || '')); mi = 1; continue }
    if (r.finish === 'length') { console.log('[gameAI] attempt ' + attempt + ' answer was cut off'); hint = '\nKeep it under 220 lines. The last answer was cut off.'; continue }
    const info = extract(r.text)
    const err = smoke(info.code)
    if (err) { console.log('[gameAI] attempt ' + attempt + ' code failed test: ' + err); hint = '\nYour previous code failed with: ' + err + '. Output the full corrected code. Do not redeclare the kit globals.'; continue }
    return { ok: true, html: assemble(info, info.code), name: info.name, headline: info.head, help: info.help }
  }
  return { ok: false }
}

module.exports = { generateGame, smoke, assemble, extract }