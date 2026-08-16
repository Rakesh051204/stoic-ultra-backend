// webSearchService.js
// Drop-in replacement for Tavily search in stoic-ultra-backend.
// Search comes from your self-hosted SearXNG instance (see ../searxng-docker).
// Full-page extraction still uses Jina AI Reader (r.jina.ai) — free, no key,
// and stable, so no reason to replace that part.
//
// Usage:
//   import { search } from './services/webSearchService.js';
//   const data = await search('who won the 2026 nba finals', { maxResults: 8 });
//   // data.results -> [{ title, url, content, snippet, favicon, score }]
//
// Requires SearXNG running locally (docker compose up -d in searxng-docker/).
// Set SEARXNG_URL in your .env if it's not on the default localhost:8080.

import axios from 'axios';

const SEARXNG_URL = process.env.SEARXNG_URL || 'http://localhost:8080';

// --- simple in-memory cache (swap for Redis later if you want) ---
const CACHE = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function getCached(key) {
  const hit = CACHE.get(key);
  if (!hit) return null;
  if (Date.now() - hit.time > CACHE_TTL_MS) {
    CACHE.delete(key);
    return null;
  }
  return hit.value;
}

function setCached(key, value) {
  CACHE.set(key, { value, time: Date.now() });
  if (CACHE.size > 500) {
    const oldestKey = CACHE.keys().next().value;
    CACHE.delete(oldestKey);
  }
}

// --- SearXNG JSON API ---
export async function searxngSearch(query, maxResults = 8) {
  const { data } = await axios.get(`${SEARXNG_URL}/search`, {
    params: {
      q: query,
      format: 'json',
      categories: 'general',
    },
    timeout: 8000,
  });

  const results = (data?.results || [])
    .slice(0, maxResults)
    .map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.content || '',
    }));

  return results;
}

// --- Jina AI Reader: turns any URL into clean markdown/text, free, no key ---
export async function extractPageText(url, timeoutMs = 9000) {
  try {
    const readerUrl = `https://r.jina.ai/${url}`;
    const response = await axios.get(readerUrl, {
      timeout: timeoutMs,
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (typeof response.data === 'string') {
      return response.data.slice(0, 6000); // cap so you don't blow token budget
    }
    return null;
  } catch (err) {
    return null; // extraction failures shouldn't kill the whole search
  }
}

export function getFaviconUrl(pageUrl) {
  try {
    const domain = new URL(pageUrl).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
  } catch (_) {
    return null;
  }
}

/**
 * Health check — call this on backend startup so you fail loudly if SearXNG
 * isn't running, instead of every chat request silently returning zero results.
 */
export async function checkSearxngHealth() {
  try {
    await axios.get(`${SEARXNG_URL}/search`, {
      params: { q: 'test', format: 'json' },
      timeout: 5000,
    });
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Main entry point — shaped to match what Tavily returned.
 *
 * @param {string} query
 * @param {object} opts
 * @param {number} opts.maxResults - how many search results to return (default 8)
 * @param {boolean} opts.extractFullText - fetch full page text via Jina (default true)
 * @param {number} opts.extractTopN - only extract full text for top N results (default 5)
 */
export async function search(query, opts = {}) {
  const {
    maxResults = 8,
    extractFullText = true,
    extractTopN = 5,
  } = opts;

  const cacheKey = `search:${query}:${maxResults}:${extractFullText}:${extractTopN}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const rawResults = await searxngSearch(query, maxResults);

  let results;
  if (extractFullText) {
    results = await Promise.all(
      rawResults.map(async (r, i) => {
        const shouldExtract = i < extractTopN;
        const content = shouldExtract ? await extractPageText(r.url) : null;
        return {
          title: r.title,
          url: r.url,
          content: content || r.snippet,
          snippet: r.snippet,
          favicon: getFaviconUrl(r.url),
          score: 1 - i * 0.05,
        };
      })
    );
  } else {
    results = rawResults.map((r, i) => ({
      title: r.title,
      url: r.url,
      content: r.snippet,
      snippet: r.snippet,
      favicon: getFaviconUrl(r.url),
      score: 1 - i * 0.05,
    }));
  }

  const payload = { query, results };
  setCached(cacheKey, payload);
  return payload;
}