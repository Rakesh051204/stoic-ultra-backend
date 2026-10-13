try { require('dotenv').config() } catch (e) {}
const fs = require('fs')
const key = process.env.GROQ_API_KEY
if (!key) { console.log('no GROQ_API_KEY'); process.exit(1) }
console.log('GROQ_GAME_AI_MODEL in env: ' + (process.env.GROQ_GAME_AI_MODEL || '(not set)'))
fetch('https://api.groq.com/openai/v1/models', { headers: { Authorization: 'Bearer ' + key } })
  .then(function (r) { return r.json() })
  .then(function (j) {
    const ids = (j.data || []).map(function (m) { return m.id })
    console.log('AVAILABLE: ' + ids.join(', '))
    const bad = /whisper|guard|tts|orpheus|safeguard|embed|compound/i
    const chat = ids.filter(function (i) { return !bad.test(i) })
    const pref = [/llama-3\.3/, /kimi/, /llama-4-maverick/, /llama-4-scout/, /gpt-oss-120b/, /qwen/, /gpt-oss-20b/, /llama-3\.1-8b/]
    const picked = []
    pref.forEach(function (p) { const m = chat.find(function (i) { return p.test(i) && picked.indexOf(i) < 0 }); if (m) picked.push(m) })
    chat.forEach(function (i) { if (picked.indexOf(i) < 0) picked.push(i) })
    if (!picked.length) { console.log('no chat models found'); process.exit(1) }
    const a = picked[0], b = picked[1] || picked[0]
    console.log('PICKED main=' + a + ' backup=' + b)
    let t = fs.readFileSync('lib/gameAI.cjs', 'utf8')
    t = t.replace(/const models = \[[^\]]*\]/, "const models = [process.env.GROQ_GAME_AI_MODEL || '" + a + "', '" + b + "']")
    fs.writeFileSync('lib/gameAI.cjs', t)
    let g = fs.readFileSync('lib/gameBuild.cjs', 'utf8')
    g = g.split("'llama-3.1-8b-instant'").join("'" + b + "'")
    fs.writeFileSync('lib/gameBuild.cjs', g)
    console.log('gameAI patched: ' + t.includes("'" + a + "'"))
    console.log('gameBuild patched: ' + !g.includes('llama-3.1-8b-instant'))
  })
  .catch(function (e) { console.log('failed: ' + e.message); process.exit(1) })