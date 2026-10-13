const vm = require('vm')
const MODELS = [process.env.GROQ_GAME_AI_MODEL || 'openai/gpt-oss-120b', 'qwen/qwen3.8-27b']

const SYS = [
  'You build one small self-contained web app or interactive page that does exactly what the user asks.',
  'Output ONLY one complete HTML document starting with <!DOCTYPE html>. No markdown fences and no explanations.',
  'Rules: a single file with inline <style> and <script> only. No external libraries, fonts, images, fetch or network calls. Never use localStorage, sessionStorage or cookies; keep state in variables. Works on phones and desktop. Dark modern look: background #0d0d0c, text #f2f2f0, accent #7C83DB, system-ui font. Polished, with clear labels, smooth transitions, and handling of empty or invalid input. Real working logic, not a mock-up. Keep it under 300 lines.',
  'The <title> must be the app name.'
].join('\n')

function clean(s, max) {
  return String(s || '').replace(/[<>\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
}

async function chat(model, messages, max) {
  const key = process.env.GROQ_API_KEY
  if (!key) return { ok: false, status: 0 }
  const ctl = new AbortController()
  const t = setTimeout(function () { ctl.abort() }, 45000)
  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({ model: model, messages: messages, temperature: 0.6, max_tokens: max })
    })
    const j = await r.json().catch(function () { return {} })
    if (!r.ok) return { ok: false, status: r.status }
    const c = j.choices && j.choices[0]
    return { ok: true, text: (c && c.message && c.message.content) || '', finish: c && c.finish_reason }
  } catch (e) {
    return { ok: false, status: 0 }
  } finally {
    clearTimeout(t)
  }
}

function pageOK(html) {
  if (!/<!doctype html/i.test(html) || !/<\/html>/i.test(html)) return 'incomplete HTML document'
  const re = /<script>([\s\S]*?)<\/script>/gi
  let m
  while ((m = re.exec(html))) {
    try { new vm.Script(m[1]) } catch (e) { return 'script error: ' + String(e.message).slice(0, 160) }
  }
  return null
}

async function generateApp(userText) {
  let mi = 0
  let hint = ''
  for (let attempt = 0; attempt < 3; attempt++) {
    const msgs = [
      { role: 'system', content: SYS },
      { role: 'user', content: 'Request: ' + clean(userText, 400) + hint }
    ]
    const r = await chat(MODELS[mi], msgs, 6000)
    if (!r.ok) { console.log('[appAI] attempt ' + attempt + ' groq failed status=' + r.status); mi = 1; continue }
    if (r.finish === 'length') { hint = '\nKeep it under 200 lines. The last answer was cut off.'; continue }
    let html = String(r.text || '').trim()
    const f = html.match(/```(?:html)?[ \t]*\r?\n([\s\S]*?)```/i)
    if (f) html = f[1].trim()
    const err = pageOK(html)
    if (err) { console.log('[appAI] attempt ' + attempt + ' failed check: ' + err); hint = '\nYour previous page failed: ' + err + '. Output the full corrected HTML document.'; continue }
    const tm = html.match(/<title>([^<]{1,60})<\/title>/i)
    return { ok: true, html: html, name: clean(tm ? tm[1] : 'Mini App', 40), headline: 'Built just for you', help: 'Open it and try it out.' }
  }
  return { ok: false }
}

module.exports = { generateApp }