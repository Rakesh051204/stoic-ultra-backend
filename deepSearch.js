const { renderPage } = require('./browserFetch');

async function fetchSourceContent(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const html = await res.text();
    if (html.length > 500) return html; // good enough
    throw new Error('thin content, trying browser render');
  } catch (err) {
    // fallback to Playwright
    return await renderPage(url);
  }
}