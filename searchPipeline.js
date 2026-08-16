// searchPipeline.js -- SearXNG-backed, now with Wikipedia wired in as a
// real source (not just an image) and higher result counts.
//
// Same return shape ({ sources, images }), so agentChat.js/index.js needs
// NO changes at all.
import { search as searxngSearch } from './services/webSearchService.js';
import { searchImages } from './services/imageService.js';
import { quickFact } from './services/wikipediaService.js';
function buildQueryVariations(searchQuery, mode) {
  const base = [searchQuery, `${searchQuery} overview`];
  if (mode === 'quality') {
    base.push(`${searchQuery} details`, `${searchQuery} facts`);
  }
  return base;
}
export async function runSearch(searchQuery, mode = 'balanced') {
  const queries = buildQueryVariations(searchQuery, mode);
  const extractFullText = mode === 'quality';
  const searchPromises = queries.map((q) =>
    searxngSearch(q, {
      // bumped 8/10 -> 10/14 for more sources per your request
      maxResults: mode === 'quality' ? 14 : 10,
      extractFullText,
      extractTopN: extractFullText ? 4 : 0,
    }).catch((err) => {
      console.error(`SearXNG search failed for query "${q}":`, err.message);
      return { results: [] };
    })
  );
  // bumped 10 -> 24 for a much fuller image strip / lightbox gallery
  const imagesPromise = searchImages(searchQuery, 24).catch((err) => {
    console.error('Image search failed:', err.message);
    return [];
  });
  // NEW: fetch a Wikipedia summary in parallel so it can be injected as a
  // real source the model can cite with ⟦cite:en.wikipedia.org⟧, the same
  // way the reference video shows a Wikipedia pill inline in the answer.
  const wikiPromise = quickFact(searchQuery).catch((err) => {
    console.error('Wikipedia quickFact failed:', err.message);
    return null;
  });
  const [responses, rawImages, wikiFact] = await Promise.all([
    Promise.all(searchPromises),
    imagesPromise,
    wikiPromise,
  ]);
  const seenUrls = new Set();
  const sources = [];
  // Wikipedia goes first, matching the video where it's the prominent
  // top source badge.
  if (wikiFact) {
    sources.push({
      title: wikiFact.title,
      url: wikiFact.url,
      domain: 'en.wikipedia.org',
      content: wikiFact.extract,
      snippet: wikiFact.extract,
      favicon: 'https://www.google.com/s2/favicons?domain=en.wikipedia.org&sz=64',
    });
    seenUrls.add(wikiFact.url);
  }
  for (const response of responses) {
    for (const r of response.results || []) {
      if (!r.url || seenUrls.has(r.url)) continue;
      seenUrls.add(r.url);
      let domain = '';
      try {
        domain = new URL(r.url).hostname.replace(/^www\./, '');
      } catch {
        domain = '';
      }
      sources.push({
        title: r.title,
        url: r.url,
        domain,
        content: r.content,
        snippet: r.content,
        favicon: r.favicon,
      });
    }
  }
  const seenImageSrcs = new Set();
  const images = [];
  for (const img of rawImages) {
    if (!img.url || seenImageSrcs.has(img.url)) continue;
    seenImageSrcs.add(img.url);
    images.push({ src: img.url, alt: img.title || img.attribution || '' });
  }
  return { sources, images };
}