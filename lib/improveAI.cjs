const vm = require('vm')
const MODELS = [process.env.GROQ_GAME_AI_MODEL || 'openai/gpt-oss-120b', 'qwen/qwen3.8-27b']
const SYS = 'You edit one complete self-contained HTML page. Apply the requested change and keep everything else working. Output ONLY the full updated HTML document starting with <!DOCTYPE html>. No markdown, no explanations. Keep every inline script valid, do not add external libraries beyond what the page already loads, and do not shorten or drop existing code.'

function clean(s, max) {
  return String(s || '').replace(/[<>\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
}

async function chat(model, messages, max) {
  const key = process.env.GROQ_API_KEY
  if (!key) return { ok: false, status: 0 }
  const ctl = new AbortController()
  const t = setTimeout(function () { ctl.abort() }, 60000)
  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({ model: model, messages: messages, temperature: 0.4, max_tokens: max })
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

async function improve(html, instruction) {
  if (!html || html.length > 16000) return { ok: false, error: 'page too large to edit' }
  let hint = ''
  for (let attempt = 0; attempt < 2; attempt++) {
    const msgs = [
      { role: 'system', content: SYS },
      { role: 'user', content: 'Change request: ' + clean(instruction, 300) + hint + '\n\nCurrent page:\n' + html }
    ]
    const r = await chat(MODELS[attempt % MODELS.length], msgs, 6000)
    if (!r.ok) { console.log('[improveAI] attempt ' + attempt + ' groq failed status=' + r.status); continue }
    if (r.finish === 'length') { hint = '\nThe last answer was cut off. Make the smallest possible change.'; continue }
    let out = String(r.text || '').trim()
    const f = out.match(/```(?:html)?[ \t]*\r?\n([\s\S]*?)```/i)
    if (f) out = f[1].trim()
    const err = pageOK(out)
    if (err) { console.log('[improveAI] attempt ' + attempt + ' failed check: ' + err); hint = '\nYour previous page failed: ' + err + '. Output the full corrected HTML document.'; continue }
    if (out.length < html.length * 0.6) { console.log('[improveAI] attempt ' + attempt + ' dropped too much code'); hint = '\nYou removed too much. Keep all existing code and only apply the change.'; continue }
    return { ok: true, html: out }
  }
  return { ok: false }
}

module.exports = { improve }