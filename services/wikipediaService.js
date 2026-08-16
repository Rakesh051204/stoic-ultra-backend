// services/wikipediaService.js
// No API key. Good for chitchat-adjacent factual questions (people, places,
// science topics) where you want a clean, short, reliable summary instead
// of scraping a general search result.
//
// FIX: added User-Agent header — Wikimedia returns 403 without one
// (https://meta.wikimedia.org/wiki/User-Agent_policy).
import axios from 'axios';

const WIKI_HEADERS = {
  'User-Agent': 'StoicApp/1.0 (https://github.com/your-repo; contact@example.com)',
};

export async function searchWikipedia(query, limit = 4) {
  const url = 'https://en.wikipedia.org/w/api.php';
  const { data } = await axios.get(url, {
    params: {
      action: 'query',
      list: 'search',
      srsearch: query,
      format: 'json',
      srlimit: limit,
    },
    timeout: 6000,
    headers: WIKI_HEADERS,
  });
  return (data?.query?.search || []).map((r) => r.title);
}

export async function getSummary(title) {
  try {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
      title
    )}`;
    const { data } = await axios.get(url, {
      timeout: 6000,
      headers: WIKI_HEADERS,
    });
    return {
      title: data.title,
      extract: data.extract,
      url: data.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`,
      thumbnail: data.thumbnail?.source || null,
    };
  } catch (err) {
    return null;
  }
}

/**
 * Convenience wrapper: search then pull the top summary.
 * Returns null if nothing found (so caller can fall back to web search).
 */
export async function quickFact(query) {
  const titles = await searchWikipedia(query, 1);
  if (!titles.length) return null;
  return getSummary(titles[0]);
}