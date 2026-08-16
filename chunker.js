// chunker.js
// Week 1, Track A: semantic chunking that respects sentence/paragraph/heading
// boundaries instead of blindly cutting at a fixed character count, plus
// overlap between chunks and metadata for citation-quality source tracking.
import * as cheerio from 'cheerio';

// ── Config ────────────────────────────────────────────────────────────
const DEFAULT_MAX_WORDS = 260;   // ~350 tokens at ~0.75 words/token
const DEFAULT_OVERLAP_RATIO = 0.12; // ~12% overlap between adjacent chunks

// ── 1. Extract clean article text from raw HTML ────────────────────────
// Strips nav/script/style/footer noise, keeps headings as anchors so each
// chunk can carry "what section was this from" metadata.
export function extractArticleSections(html) {
  const $ = cheerio.load(html);

  $('script, style, nav, footer, header, noscript, iframe, svg, form').remove();

  const sections = [];
  let currentHeading = null;
  let currentParagraphs = [];

  const flush = () => {
    const text = currentParagraphs.join('\n\n').trim();
    if (text.length > 0) {
      sections.push({ heading: currentHeading, text });
    }
    currentParagraphs = [];
  };

  // Walk the body in document order, grouping paragraphs under their
  // nearest preceding heading.
  $('body')
    .find('h1, h2, h3, h4, p, li')
    .each((_, el) => {
      const tag = el.tagName?.toLowerCase();
      const text = $(el).text().replace(/\s+/g, ' ').trim();
      if (!text) return;

      if (['h1', 'h2', 'h3', 'h4'].includes(tag)) {
        flush();
        currentHeading = text;
      } else {
        currentParagraphs.push(text);
      }
    });

  flush();

  // Fallback: if the page had no headings/paragraphs matched (rare, e.g.
  // JS-rendered pages), just grab whatever text is left as one section.
  if (sections.length === 0) {
    const fallbackText = $('body').text().replace(/\s+/g, ' ').trim();
    if (fallbackText) sections.push({ heading: null, text: fallbackText });
  }

  return sections;
}

// ── 2. Split one section's text into sentence-respecting chunks ────────
function splitIntoSentences(text) {
  // Protect decimal numbers ("4.5 billion", "v3.2") and common abbreviations
  // (Mr., Dr., U.S., etc.) from being treated as sentence boundaries by
  // temporarily replacing their periods with a placeholder, splitting, then
  // restoring them.
  const PLACEHOLDER = '\u0000';
  const protectedText = text
    .replace(/(\d)\.(\d)/g, `$1${PLACEHOLDER}$2`)
    .replace(/\b(Mr|Mrs|Ms|Dr|Prof|Sr|Jr|vs|etc|e\.g|i\.e|U\.S|U\.K)\./gi, (m) =>
      m.replace('.', PLACEHOLDER)
    );

  const sentences =
    protectedText.match(/[^.!?]+[.!?]+["')\]]?|[^.!?]+$/g) || [protectedText];

  return sentences
    .map((s) => s.replace(new RegExp(PLACEHOLDER, 'g'), '.').trim())
    .filter(Boolean);
}

function wordCount(str) {
  return str.split(/\s+/).filter(Boolean).length;
}

function chunkSection(section, sourceUrl, maxWords, overlapRatio) {
  const sentences = splitIntoSentences(section.text);
  const chunks = [];
  let current = [];
  let currentWords = 0;

  for (const sentence of sentences) {
    const sentenceWords = wordCount(sentence);

    if (currentWords + sentenceWords > maxWords && current.length > 0) {
      chunks.push(current.join(' '));

      // Overlap: carry the last N% of words forward into the next chunk
      // so context isn't lost at the boundary.
      const overlapWordTarget = Math.floor(maxWords * overlapRatio);
      const carried = [];
      let carriedWords = 0;
      for (let i = current.length - 1; i >= 0 && carriedWords < overlapWordTarget; i--) {
        carried.unshift(current[i]);
        carriedWords += wordCount(current[i]);
      }
      current = carried;
      currentWords = carriedWords;
    }

    current.push(sentence);
    currentWords += sentenceWords;
  }

  if (current.length > 0) {
    chunks.push(current.join(' '));
  }

  // Attach metadata to each chunk
  return chunks.map((text, i) => ({
    text,
    heading: section.heading,
    sourceUrl,
    chunkIndex: i,
    wordCount: wordCount(text),
  }));
}

// ── 3. Full pipeline: HTML -> heading-aware, overlapping chunks ────────
export function chunkDocument(html, sourceUrl, options = {}) {
  const maxWords = options.maxWords || DEFAULT_MAX_WORDS;
  const overlapRatio = options.overlapRatio ?? DEFAULT_OVERLAP_RATIO;

  const sections = extractArticleSections(html);

  const allChunks = sections.flatMap((section) =>
    chunkSection(section, sourceUrl, maxWords, overlapRatio)
  );

  // Re-index globally so downstream citation numbering is stable
  return allChunks.map((chunk, i) => ({ ...chunk, globalIndex: i }));
}

// ── 4. Lightweight chunker for plain text (e.g. Tavily snippets, which
// are already short and don't need HTML parsing) — same overlap logic,
// no cheerio needed.
export function chunkPlainText(text, sourceUrl, options = {}) {
  const maxWords = options.maxWords || DEFAULT_MAX_WORDS;
  const overlapRatio = options.overlapRatio ?? DEFAULT_OVERLAP_RATIO;
  return chunkSection({ heading: null, text }, sourceUrl, maxWords, overlapRatio);
}