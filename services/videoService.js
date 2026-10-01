import axios from 'axios'

const SEARXNG_URL = process.env.SEARXNG_URL || 'http://localhost:8080'
const VIDEO_RE = /\b(videos?|watch|clips?|footage|interview|trailer|highlights?|full (meeting|match|speech|episode))\b/i

export const wantsVideos = (message = '') => VIDEO_RE.test(message)

function toEmbed(r) {
  if (r.iframe_src) return r.iframe_src
  try {
    const u = new URL(r.url)
    if (u.hostname.includes('youtube.com') && u.searchParams.get('v')) {
      return 'https://www.youtube-nocookie.com/embed/' + u.searchParams.get('v')
    }
    if (u.hostname === 'youtu.be') return 'https://www.youtube-nocookie.com/embed' + u.pathname
  } catch {}
  return null
}

function ytThumb(url) {
  try {
    const u = new URL(url)
    let id = null
    if (u.hostname.includes('youtube.com')) id = u.searchParams.get('v')
    else if (u.hostname === 'youtu.be') id = u.pathname.slice(1)
    return id ? 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg' : null
  } catch { return null }
}
export async function searchVideos(query, limit = 4) {
  try {
    const { data } = await axios.get(SEARXNG_URL + '/search', {
      params: { q: query, format: 'json', categories: 'videos' },
      timeout: 8000,
    })
    const seen = new Set()
    const out = []
    for (const r of data?.results || []) {
      if (!r.url || seen.has(r.url)) continue
      seen.add(r.url)
      let host = ''
      try { host = new URL(r.url).hostname.replace('www.', '') } catch {}
      out.push({
        title: r.title,
        url: r.url,
        thumbnail: r.thumbnail || r.img_src || ytThumb(r.url),
        embed: toEmbed(r),
        source: r.author || host,
        length: r.length || null,
        snippet: (r.content || '').slice(0, 140),
      })
      if (out.length >= limit) break
    }
    return out
  } catch (e) {
    console.warn('video search failed:', e.message)
    return []
  }
}