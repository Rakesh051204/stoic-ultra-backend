// imageService.js — decides IF images are needed, fetches from SearXNG, validates before returning

const axios = require('axios');

// --- 1. Should this query even trigger images? ---
// Cheap heuristic first (no LLM call needed for obvious cases)
const ENTITY_PATTERNS = [
  /^who is /i,
  /^who's /i,
  /^what is (the )?[a-z]+ (company|brand|app|product)/i,
  /^tell me about /i,
];

function looksLikeEntityQuery(query) {
  return ENTITY_PATTERNS.some((re) => re.test(query.trim()));
}

// Fallback: let Groq classify ambiguous cases (fast, small model, one-word answer)
async function classifyNeedsImages(query, groqClient) {
  if (looksLikeEntityQuery(query)) return true;

  const resp = await groqClient.chat.completions.create({
    model: 'llama-3.1-8b-instant', // small/fast model just for classification
    messages: [
      {
        role: 'system',
        content:
          'Reply with only "yes" or "no". Does this query ask about a specific ' +
          'person, brand, place, product, or visual thing where showing photos ' +
          'would help? Say "no" for general knowledge, code, math, advice, or ' +
          'conversational queries.',
      },
      { role: 'user', content: query },
    ],
    max_tokens: 3,
    temperature: 0,
  });

  return resp.choices[0].message.content.trim().toLowerCase().startsWith('y');
}

// --- 2. Fetch candidate images from SearXNG ---
async function fetchCandidateImages(query, searxngUrl) {
  const { data } = await axios.get(`${searxngUrl}/search`, {
    params: { q: query, categories: 'images', format: 'json' },
    timeout: 5000,
  });
  return (data.results || []).slice(0, 8).map((r) => ({
    url: r.img_src || r.url,
    thumbnail: r.thumbnail_src || r.img_src,
    source: r.url,
    title: r.title,
  }));
}

// --- 3. Validate each candidate actually loads as an image ---
async function validateImage(candidate) {
  try {
    const res = await axios.head(candidate.url, {
      timeout: 3000,
      maxRedirects: 3,
      validateStatus: (s) => s < 400,
    });
    const contentType = res.headers['content-type'] || '';
    const contentLength = parseInt(res.headers['content-length'] || '0', 10);

    if (!contentType.startsWith('image/')) return null;
    if (contentLength && contentLength < 2000) return null; // likely a 1x1 tracking pixel

    return candidate;
  } catch {
    return null; // dead link, timeout, CORS-blocked — just drop it, don't show broken state
  }
}

// --- 4. Public function: call this from your answer pipeline ---
async function getImagesForQuery(query, { groqClient, searxngUrl, count = 3 }) {
  const needsImages = await classifyNeedsImages(query, groqClient);
  if (!needsImages) return [];

  const candidates = await fetchCandidateImages(query, searxngUrl);

  // Validate in parallel, but stop once we have enough good ones
  const validated = [];
  for (const batch of chunk(candidates, 4)) {
    const results = await Promise.all(batch.map(validateImage));
    validated.push(...results.filter(Boolean));
    if (validated.length >= count) break;
  }

  return validated.slice(0, count);
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

module.exports = { getImagesForQuery };