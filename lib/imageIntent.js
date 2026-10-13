const IMG = /\b(images?|photos?|pictures?|pics?|wallpapers?)\b/i
const FILLER = /\b(please|plz|pls|give|show|me|find|get|generate|send|some|a|an|the|of|for|i|want|need|images?|photos?|pictures?|pics?|wallpapers?|like|and|ok)\b/gi
const UA = { 'User-Agent': 'StoicUltra/1.0 (rakeshpalani2004@gmail.com)' }

async function openverse(q) {
  const r = await fetch(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&page_size=12`, { headers: UA })
  const j = await r.json()
  return (j.results || []).map((x) => ({
    url: x.url, thumb: x.thumbnail || x.url, title: x.title || q,
    page: x.foreign_landing_url, by: x.creator || '', source: 'Openverse', domain: 'openverse.org',
  }))
}

async function wikimedia(q) {
  const u = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=12'
    + `&gsrsearch=${encodeURIComponent(q + ' filetype:bitmap')}&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=500&origin=*`
  const j = await (await fetch(u, { headers: UA })).json()
  return Object.values(j.query?.pages || {}).map((p) => {
    const i = p.imageinfo?.[0]
    if (!i) return null
    return {
      url: i.url, thumb: i.thumburl || i.url, title: String(p.title || q).replace(/^File:/, '').replace(/\.\w+$/, ''),
      page: i.descriptionurl, by: '', source: 'Wikimedia Commons', domain: 'commons.wikimedia.org',
    }
  }).filter(Boolean)
}

export async function handleImageRequest({ message, send }) {
  if (!IMG.test(message || '')) return false
  const q = message.replace(FILLER, ' ').replace(/\s+/g, ' ').trim()
  if (!q || q.length < 2) return false
  send('images', { type: 'start', query: q })
  let all = []
  for (const [name, domain, fn] of [
    ['Openverse', 'openverse.org', openverse],
    ['Wikimedia', 'commons.wikimedia.org', wikimedia],
  ]) {
    send('images', { type: 'source', name, domain, url: `https://${domain}/search?q=${encodeURIComponent(q)}` })
    try { all = all.concat(await fn(q)) } catch (e) { console.error('[img]', name, e.message) }
    if (all.length >= 12) break
  }
  const seen = new Set()
  all = all.filter((x) => x.url && !seen.has(x.url) && seen.add(x.url)).slice(0, 12)
  if (!all.length) { send('images', { type: 'end' }); return false }
  send('images', { type: 'results', query: q, images: all })
  send('token', { text: `Here are images of ${q}.` })
  console.log('[img] hit', q, all.length)
  return true
}