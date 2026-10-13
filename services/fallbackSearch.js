import axios from 'axios'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const cache = new Map()

const decode = (s = '') => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
const strip = (s = '') => decode(String(s).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()

function unwrapBing(href) {
  try {
    const u = new URL(href)
    if (u.hostname.endsWith('bing.com') && u.pathname.startsWith('/ck/')) {
      const p = u.searchParams.get('u')
      if (p && p.startsWith('a1')) return Buffer.from(p.slice(2).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    }
  } catch {}
  return href
}

async function bing(q, first = 1) {
  const { data } = await axios.get('https://www.bing.com/search', { params: { q, first, setlang: 'en' }, headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' }, timeout: 9000, responseType: 'text' })
  const out = []
  for (const b of String(data).split(/<li class="b_algo/).slice(1)) {
    const m = b.match(/<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/)
    if (!m) continue
    const url = unwrapBing(decode(m[1]))
    if (!/^https?:/.test(url)) continue
    const p = b.match(/<p[^>]*>([\s\S]*?)<\/p>/)
    out.push({ title: strip(m[2]), url, snippet: p ? strip(p[1]) : '' })
  }
  return out
}

async function brave(q) {
  const { data } = await axios.get('https://search.brave.com/search', { params: { q, source: 'web' }, headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' }, timeout: 9000, responseType: 'text' })
  const out = []
  for (const b of String(data).split(/<div class="snippet[^"]*"/).slice(1)) {
    const m = b.match(/<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/)
    if (!m || /brave\.com/.test(m[1])) continue
    const t = b.match(/class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\/div>/)
    const d = b.match(/class="[^"]*(?:content|description)[^"]*"[^>]*>([\s\S]*?)<\/div>/)
    out.push({ title: strip(t ? t[1] : m[2]).slice(0, 140), url: decode(m[1]), snippet: d ? strip(d[1]).slice(0, 300) : '' })
  }
  return out
}

export async function fallbackSearch(query, max = 20) {
  const hit = cache.get(query)
  if (hit && Date.now() - hit.t < 5 * 60 * 1000) return hit.v.slice(0, max)
  const [a, a2, b] = await Promise.allSettled([bing(query, 1), bing(query, 11), brave(query)])
  const lists = [a, a2, b].map((r) => (r.status === 'fulfilled' ? r.value : []))
  console.log('[search] fallback bing/brave:', lists.map((l) => l.length).join('/'))
  const seen = new Set()
  const out = []
  for (const x of lists.flat()) {
    if (!x.url || !x.title || seen.has(x.url)) continue
    seen.add(x.url)
    out.push(x)
  }
  if (out.length) cache.set(query, { t: Date.now(), v: out })
  return out.slice(0, max)
}