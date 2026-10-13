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
function cleanVideoQuery(q = '') {
  const stop = new Set(['i','want','the','a','an','show','me','give','please','videos','video','sample','of','to','watch','all','like','and','can','you','my','this','that','with','for','is','are'])
  const words = q.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w && !stop.has(w))
  return words.slice(0, 8).join(' ') || q
}
async function searxVideos(query, limit = 4) {
  try {
    const { data } = await axios.get(SEARXNG_URL + '/search', {
      params: { q: cleanVideoQuery(query), format: 'json', categories: 'videos' },
      timeout: 2500,
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
const YT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const ytTxt = (x) => (x ? (x.simpleText || (x.runs || []).map((r) => r.text).join('')) : '')

async function ytSearch(query, limit = 6) {
  const { data } = await axios.get('https://www.youtube.com/results', {
    params: { search_query: query },
    headers: { 'User-Agent': YT_UA, 'Accept-Language': 'en-US,en;q=0.9' },
    timeout: 9000,
    responseType: 'text',
  })
  const html = String(data)
  const i = html.indexOf('ytInitialData = ')
  if (i < 0) return []
  const start = html.indexOf('{', i)
  const end = html.indexOf(';</script>', start)
  let json
  try { json = JSON.parse(html.slice(start, end)) } catch { return [] }
  const found = []
  const walk = (n) => {
    if (!n || typeof n !== 'object' || found.length >= limit * 3) return
    if (n.videoRenderer && n.videoRenderer.videoId) { found.push(n.videoRenderer); return }
    for (const k in n) walk(n[k])
  }
  walk(json)
  const seen = new Set()
  const out = []
  for (const v of found) {
    if (seen.has(v.videoId)) continue
    seen.add(v.videoId)
    const thumbs = (v.thumbnail && v.thumbnail.thumbnails) || []
    out.push({
      title: ytTxt(v.title),
      url: 'https://www.youtube.com/watch?v=' + v.videoId,
      thumbnail: (thumbs.length && thumbs[thumbs.length - 1].url ? thumbs[thumbs.length - 1].url.split('?')[0] : null) || 'https://i.ytimg.com/vi/' + v.videoId + '/hqdefault.jpg',
      embed: 'https://www.youtube-nocookie.com/embed/' + v.videoId,
      source: ytTxt(v.ownerText) || 'YouTube',
      length: ytTxt(v.lengthText) || null,
      snippet: ytTxt(v.descriptionSnippet).slice(0, 140),
    })
    if (out.length >= limit) break
  }
  return out
}

export async function searchVideos(query, limit = 4) {
  const primary = await searxVideos(query, limit)
  if (primary.length) return primary
  try {
    const yt = await ytSearch(cleanVideoQuery(query), limit)
    console.log('[videos] youtube fallback:', yt.length)
    return yt
  } catch (e) {
    console.warn('[videos] youtube fallback failed:', e.message)
    return []
  }
}