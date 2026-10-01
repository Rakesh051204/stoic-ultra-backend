// Inside your route/controller, wherever you currently call SearXNG and get results back —
// right before/after that, emit a step event with a `sources` array attached.

// Example: after your existing SearXNG call
const searxResults = await fetchFromSearxng(query); // <- whatever your existing function is called

// Build lightweight source objects for the pills (just domain + favicon, not full data)
const stepSources = searxResults.slice(0, 5).map((r) => {
  const domain = new URL(r.url).hostname.replace(/^www\./, '');
  return {
    domain,
    url: r.url,
    // Google's favicon service works for ~any domain without you hosting anything
    favicon: `https://www.google.com/s2/favicons?domain=${domain}&sz=32`,
  };
});

// Send this as your SSE step event (adjust to match your existing SSE emit function/shape)
sendStepEvent({
  text: 'Searching the web',
  sources: stepSources,
});

// Then later, another step, e.g. once you've picked which pages to actually read:
sendStepEvent({
  text: 'Reading sources',
  sources: stepSources, // or a filtered subset of the ones you're actually using
});