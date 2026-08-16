// imageService.js
// Primary image source is now SearXNG (same self-hosted instance already
// used for web search in webSearchService.js) — categories=images.
// This is what was missing: the old version only used Wikimedia (title-match
// only, so it silently returned [] for most everyday queries) and Pexels
// (dead fallback with no API key set). SearXNG covers general queries
// properly with zero extra config beyond what's already running.
//
// IMPORTANT: SearXNG's "images" category must be enabled in
// searxng-docker/searxng/settings.yml, same place you already enabled
// `formats: [html, json]`. Under `search:` -> `categories:` (or via the
// engine list), make sure image-capable engines aren't disabled. If you
// get 0 results below even though general search works, this is the
// first thing to check.

import axios from 'axios'

const SEARXNG_URL = process.env.SEARXNG_URL || 'http://localhost:8080'
const DEFAULT_LIMIT = 20

// --- SearXNG image search (primary) ---
async function searchSearxngImages(query, limit = DEFAULT_LIMIT) {
  try {
    const { data } = await axios.get(`${SEARXNG_URL}/search`, {
      params: {
        q: query,
        format: 'json',
        categories: 'images',
      },
      timeout: 8000,
    })

    const results = data?.results || []
    if (!results.length) {
      console.warn(`⚠️ SearXNG returned 0 image results for "${query}" — check that the images category is enabled in settings.yml`)
      return []
    }

    return results
      .slice(0, limit)
      .map((r) => ({
        // SearXNG image results use img_src for the actual image and
        // url for the page it came from. Some engines put the direct
        // link in thumbnail_src instead if img_src is missing.
        url: r.img_src || r.thumbnail_src,
        source: r.engine || 'searxng',
        title: r.title || '',
        attribution: r.source || new URL(r.url || SEARXNG_URL).hostname,
        sourceUrl: r.url || '',
      }))
      .filter((img) => !!img.url) // drop any malformed entries with no image url
  } catch (err) {
    console.error('SearXNG image search failed:', err.message)
    return []
  }
}

// --- Wikimedia Commons (secondary, good for people/places/science/animals) ---
async function searchWikimediaImages(query, limit = DEFAULT_LIMIT) {
  try {
    const url = 'https://commons.wikimedia.org/w/api.php'
    const { data } = await axios.get(url, {
      params: {
        action: 'query',
        generator: 'search',
        gsrsearch: `intitle:"${query}" filetype:bitmap`,
        gsrnamespace: 6,
        gsrlimit: Math.min(limit * 2, 50),
        prop: 'imageinfo',
        iiprop: 'url|extmetadata',
        format: 'json',
      },
      timeout: 8000,
    })
    const pages = data?.query?.pages
    if (!pages) return []
    const queryWords = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2)
    const mapped = Object.values(pages)
      .map((p) => {
        const info = p.imageinfo?.[0]
        if (!info) return null
        return {
          url: info.url,
          source: 'wikimedia',
          title: p.title.replace('File:', ''),
          attribution:
            info.extmetadata?.Artist?.value?.replace(/<[^>]+>/g, '') || 'Wikimedia Commons',
        }
      })
      .filter(Boolean)
    const relevant = mapped.filter((img) => {
      const titleLower = img.title.toLowerCase()
      return queryWords.some((w) => titleLower.includes(w))
    })
    return relevant.slice(0, limit)
  } catch (err) {
    console.error('Wikimedia image search failed:', err.message)
    return []
  }
}

/**
 * SearXNG first (covers general queries), Wikimedia tops up if SearXNG
 * comes up short. De-duped by URL.
 */
export async function searchImages(query, limit = DEFAULT_LIMIT) {
  const searxResults = await searchSearxngImages(query, limit)
  console.log(`🖼️ SearXNG images: ${searxResults.length}`)

  if (searxResults.length >= limit) return searxResults

  const remaining = limit - searxResults.length
  const wikiResults = await searchWikimediaImages(query, remaining)
  console.log(`🖼️ Wikimedia top-up images: ${wikiResults.length}`)

  const combined = [...searxResults, ...wikiResults]
  const seen = new Set()
  return combined.filter((img) => {
    if (seen.has(img.url)) return false
    seen.add(img.url)
    return true
  })
}

export { searchSearxngImages, searchWikimediaImages }