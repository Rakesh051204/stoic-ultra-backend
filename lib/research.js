import { search, extractPageText } from '../services/webSearchService.js'

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const BAD = /porn|xxx|xvideos|xnxx|redtube|onlyfans|hentai|escort|casino|betting/i
function isHome(u) { try { const p = new URL(u).pathname; return p === '/' || p === '' } catch (e) { return false } }

export function isResearchRequest(message) {
  return /^\s*\/?(please\s+)?(deep[\s-]*)?research\b/i.test(String(message || ''))
}

function today() { return new Date().toISOString().slice(0, 10) }
function tidy(t, n) { return String(t || '').replace(/\s+/g, ' ').trim().slice(0, n) }
function pace(ms) { return new Promise(function (r) { setTimeout(r, ms) }) }

async function llm(system, user, max, ms) {
  const key = process.env.GROQ_API_KEY
  if (!key) return ''
  const models = [process.env.RESEARCH_MODEL || 'openai/gpt-oss-120b', 'qwen/qwen3.8-27b']
  for (const model of models) {
    const ctl = new AbortController()
    const t = setTimeout(function () { ctl.abort() }, ms || 60000)
    try {
      const r = await fetch(GROQ_URL, {
        method: 'POST',
        signal: ctl.signal,
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
        body: JSON.stringify({ model: model, temperature: 0.3, max_tokens: max, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] })
      })
      const j = await r.json().catch(function () { return {} })
      if (!r.ok) { console.log('[research] llm ' + model + ' status=' + r.status); continue }
      const c = j.choices && j.choices[0]
      const text = String((c && c.message && c.message.content) || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
      if (text) return text
    } catch (e) {
      console.log('[research] llm ' + model + ' ' + (e && e.name))
    } finally {
      clearTimeout(t)
    }
  }
  return ''
}

function parseList(t) {
  const m = String(t || '').match(/\[[\s\S]*?\]/)
  if (!m) return []
  try {
    const a = JSON.parse(m[0])
    return Array.isArray(a) ? a.map(function (x) { return String(x).trim() }).filter(Boolean) : []
  } catch (e) { return [] }
}

async function findHits(q, n) {
  try {
    const r = await search(q, { maxResults: n })
    const arr = Array.isArray(r) ? r : ((r && (r.results || r.sources)) || [])
    return arr.map(function (x) {
      return { title: tidy(x.title || x.url || '', 120), url: String(x.url || x.link || ''), text: tidy(x.content || x.snippet || x.text || '', 600) }
    }).filter(function (x) { return /^https?:\/\//.test(x.url) && !BAD.test(x.url + ' ' + x.title + ' ' + x.text) && !isHome(x.url) })
  } catch (e) {
    console.log('[research] search failed: ' + (e && e.message))
    return []
  }
}

async function readPage(h) {
  let page = ''
  try {
    const r = await extractPageText(h.url, 9000)
    page = typeof r === 'string' ? r : ((r && (r.text || r.content)) || '')
  } catch (e) {}
  page = tidy(page, 1800)
  const text = page.length > 200 ? page : tidy(h.text, 900)
  return { title: h.title, url: h.url, text: text }
}

function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, '') } catch (e) { return u } }

async function out(send, text) {
  text = String(text).replace(/[\u200B-\u200D\uFEFF]/g, '')
  for (let i = 0; i < text.length; i += 60) {
    send('token', { text: text.slice(i, i + 60) })
    await pace(8)
  }
}

export async function runResearch(opts) {
  const send = opts.send
  const topic = tidy(String(opts.message || '').replace(/^\s*\/?(please\s+)?(deep[\s-]*)?research(\s+(on|about|into|for))?\s*[:\-]?\s*/i, ''), 400)
  send('sources', { sources: [] })
  send('images', { images: [] })
  try {
    if (!topic) { await out(send, 'Tell me what to research, for example: research how solid-state batteries work.'); return { ok: false } }

    send('thinking', { text: 'Planning the research' })
    const plan = await llm('You plan web research. Today is ' + today() + '. Reply with ONLY a JSON array of 3 to 5 short, specific web search queries (4 to 9 words each) that together cover the question from different angles. Keep compound terms intact (for example solid-state batteries) and add one disambiguating word such as battery, technology or science to each query so results stay on topic. Make every query specific enough to return articles, reports, statistics or listings rather than home pages, and include the country, the year 2026 or the kind of document wanted (report, statistics, salary survey, job listings) when relevant. No other text.', topic, 1200, 30000)
    let queries = parseList(plan).slice(0, 5)
    if (!queries.length) queries = [topic]
    console.log('[research] queries: ' + JSON.stringify(queries))

    const seen = new Set()
    const hosts = {}
    async function gather(qs, n) {
      let lists = await Promise.all(qs.map(function (q) { return findHits(q, 5) }))
      if (!lists.some(function (l) { return l.length })) { console.log('[research] no hits, retrying once'); await pace(2500); lists = await Promise.all(qs.map(function (q) { return findHits(q, 5) })) }
      console.log('[research] hits per query: ' + lists.map(function (l) { return l.length }).join(','))
      const chosen = []
      let more = true
      for (let round = 0; round < 5 && more; round++) {
        more = false
        for (const l of lists) {
          const h = l[round]
          if (!h) continue
          more = true
          const k = h.url.replace(/[#?].*$/, '').replace(/\/$/, '')
          if (seen.has(k)) continue
          const host = hostOf(h.url)
          if ((hosts[host] || 0) >= 2) continue
          if (chosen.length >= n) continue
          seen.add(k)
          hosts[host] = (hosts[host] || 0) + 1
          chosen.push(h)
        }
      }
      return chosen
    }

    send('thinking', { text: 'Searching the web (' + queries.length + ' searches)' })
    const first = await gather(queries, 7)
    if (!first.length) { console.log('[research] no hits after filtering'); await out(send, 'I could not find any web results right now. Check that your search service (SearXNG) is running, then try again.'); return { ok: false } }

    send('thinking', { text: 'Reading ' + first.length + ' pages' })
    let sources = (await Promise.all(first.map(readPage))).filter(function (s) { return s.text.length > 80 })
    if (!sources.length) { await out(send, 'I found pages but could not read any of them. Please try again.'); return { ok: false } }

    const digest = sources.map(function (s, i) { return '[' + (i + 1) + '] ' + s.title + ': ' + s.text.slice(0, 250) }).join('\n')
    const gap = await llm('You check research for gaps. Today is ' + today() + '. Reply with ONLY a JSON array of 0 to 2 extra web search queries for important missing information, or [] if the sources already cover the question.', 'Question: ' + topic + '\nSources so far:\n' + digest, 800, 30000)
    const extra = parseList(gap).slice(0, 2)
    if (extra.length) {
      send('thinking', { text: 'Checking for gaps (' + extra.length + ' more searches)' })
      const more = await gather(extra, 3)
      if (more.length) {
        const added = (await Promise.all(more.map(readPage))).filter(function (s) { return s.text.length > 80 })
        sources = sources.concat(added)
      }
    }

    send('thinking', { text: 'Picking the best sources' })
    const pick = await llm('You filter research sources. Reply with ONLY a JSON array of the numbers of the sources that are clearly about the question and useful for answering it. Exclude adult content, spam, login pages, company home pages, generic dictionary or encyclopedia entries for a single common word, and any page that does not help answer the question.', 'Question: ' + topic + '\nSources:\n' + sources.map(function (s, i) { return (i + 1) + '. ' + s.title + ' (' + hostOf(s.url) + '): ' + s.text.slice(0, 160) }).join('\n'), 500, 30000)
    const keep = Array.from(new Set(parseList(pick).map(function (x) { return parseInt(x, 10) }).filter(function (n) { return n >= 1 && n <= sources.length })))
    console.log('[research] picker kept: ' + JSON.stringify(keep) + ' of ' + sources.length)
    if (keep.length >= 1) sources = keep.map(function (n) { return sources[n - 1] })
    send('thinking', { text: 'Writing the report' })
    const ctx = sources.map(function (s, i) { return '[' + (i + 1) + '] ' + s.title + ' (' + s.url + ')\n' + s.text }).join('\n\n')
    const sys = 'You are a careful research analyst. Today is ' + today() + '. Write a clear research report answering the question using ONLY the numbered sources. Start with a 2 to 3 sentence direct answer. Then 3 to 5 short sections with ## headings and the key facts, citing sources like [1] or [2][3] right after the claims they support. If sources conflict or are thin on something, say so plainly. Do not invent facts, numbers or URLs, and do not add a sources list, it is added automatically. Keep it under 700 words.'
    const report = await llm(sys, 'Question: ' + topic + '\n\nSources:\n' + ctx, 3500, 90000)
    const list = sources.map(function (s, i) { return (i + 1) + '. [' + s.title.replace(/[\[\]]/g, '') + '](' + s.url + ')' }).join('\n\n')
    if (!report) {
      await out(send, 'I found sources but the writing model did not answer (it may be rate limited). Try again in a minute. Sources I found:\n\n' + list)
      return { ok: false }
    }
    await out(send, report + '\n\n**Sources**\n\n' + list)
    return { ok: true }
  } catch (e) {
    console.error('[research] error:', e && e.stack ? e.stack : e)
    try { await out(send, 'Research hit a problem: ' + (e && e.message) + '. Please try again.') } catch (_e) {}
    return { ok: false }
  }
}