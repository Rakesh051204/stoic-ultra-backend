console.log('🚀🚀🚀 STOIC ULTRA – FULLY FIXED + RESEARCH PDF (Minimal) 🚀🚀🚀');

import express from 'express'
import { STOIC_SYSTEM_PROMPT } from './stoicSystemPrompt.js'
import cors from 'cors'
import Groq from 'groq-sdk'
import dotenv from 'dotenv'
import axios from 'axios'
import { franc } from 'franc'
import { translate } from '@vitalets/google-translate-api'
import { getSessionHistory, saveMessage, maybeUpdateSummary, clearSessionHistory } from './memoryStore.js'
import { chunkDocument } from './chunker.js'
import { renderPage, closeBrowser, generatePDF } from './browserFetch.js'
import { getToneContext } from './toneEngine.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

// ─── Groq client ──────────────────────────────────────────────────
const HAS_GROQ_KEY = !!process.env.GROQ_API_KEY
if (!HAS_GROQ_KEY) console.warn('⚠️  GROQ_API_KEY missing – mock mode will be used.')

let groq = null
if (HAS_GROQ_KEY) {
  groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
    timeout: 20 * 1000,
    maxRetries: 2,
  })
}

// ─── Other APIs ──────────────────────────────────────────────────
if (!process.env.TAVILY_API_KEY) console.warn('⚠️  TAVILY_API_KEY missing – search disabled.')

app.use(cors())
app.use(express.json({ limit: '50mb' }))

const companyKnowledge = {}

// ─── Models ──────────────────────────────────────────────────────
const FAST_MODEL = 'llama-3.1-8b-instant'
const MAIN_MODEL = 'mixtral-8x7b-32768'   // fallback, but we use FAST by default

// ─── Token budget ───────────────────────────────────────────────
const MAX_HISTORY_MESSAGES = 6
const MAX_HISTORY_CHARS_PER_MSG = 500
const MAX_SOURCES_IN_PROMPT = 6
const MAX_CHUNKS_PER_SOURCE = 1
const MAX_SNIPPET_CHARS = 500
const MAX_IMAGES = 6

function estimateTokens(text) {
  return Math.ceil((text || '').length / 4)
}

function enforceTokenBudget(systemContent, historyMessages, userContent, maxTokensReserved) {
  const SAFE_PROMPT_BUDGET = 6500
  let history = [...historyMessages]

  const totalTokens = () =>
    estimateTokens(systemContent) +
    estimateTokens(history.map((m) => m.content).join('')) +
    estimateTokens(userContent) +
    maxTokensReserved

  while (totalTokens() > SAFE_PROMPT_BUDGET && history.length > 0) {
    history.shift()
  }

  let finalUserContent = userContent
  if (totalTokens() > SAFE_PROMPT_BUDGET && history.length === 0) {
    const overBy = totalTokens() - SAFE_PROMPT_BUDGET
    const cutChars = Math.max(0, finalUserContent.length - overBy * 4)
    finalUserContent = finalUserContent.slice(0, cutChars) + '\n[...truncated to fit token budget]'
  }

  return { history, userContent: finalUserContent }
}

// ─── History functions (with try/catch) ─────────────────────────
async function getHistory(sessionId) {
  try {
    const { recentMessages, summary } = await getSessionHistory(sessionId)
    const trimmed = (recentMessages || [])
      .slice(-MAX_HISTORY_MESSAGES)
      .map((m) => ({
        ...m,
        content: (m.content || '').length > MAX_HISTORY_CHARS_PER_MSG
          ? m.content.slice(0, MAX_HISTORY_CHARS_PER_MSG) + '…'
          : m.content
      }))
    if (summary) {
      return [{ role: 'system', content: `Earlier context: ${summary}` }, ...trimmed]
    }
    return trimmed
  } catch (err) {
    console.error('getHistory error:', err)
    return [] // fallback to empty history
  }
}

async function addToHistory(sessionId, role, content) {
  try {
    await saveMessage(sessionId, role, content)
    if (role === 'assistant') await maybeUpdateSummary(sessionId)
  } catch (err) {
    console.error('addToHistory error:', err)
  }
}

async function clearHistory(sessionId) {
  try {
    await clearSessionHistory(sessionId)
  } catch (err) {
    console.error('clearHistory error:', err)
  }
}

// ─── Translation / detection ────────────────────────────────────
async function detectLanguage(text) {
  try {
    const langCode = franc(text)
    const map = {
      'eng': 'English', 'spa': 'Spanish', 'fra': 'French', 'deu': 'German',
      'ita': 'Italian', 'por': 'Portuguese', 'rus': 'Russian', 'jpn': 'Japanese',
      'kor': 'Korean', 'zho': 'Chinese', 'ara': 'Arabic', 'hin': 'Hindi',
      'tam': 'Tamil', 'tel': 'Telugu', 'mal': 'Malayalam', 'kan': 'Kannada'
    }
    return map[langCode] || 'Unknown'
  } catch { return 'Unknown' }
}

async function translateText(text, targetLang = 'ta') {
  try {
    const result = await translate(text, { to: targetLang })
    return result.text
  } catch { return null }
}

// ─── Image validation ───────────────────────────────────────────
const TRUSTED_BIO_IMAGE_DOMAINS = [
  'wikipedia.org', 'wikimedia.org', 'linkedin.com', 'licdn.com',
  'twimg.com', 'x.com', 'gravatar.com', 'github.com', 'githubusercontent.com',
  'gstatic.com', 'googleusercontent.com',
]
function isTrustedBioDomain(hostname) {
  return TRUSTED_BIO_IMAGE_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d))
}
function isPersonQuery(query) {
  return /\bwho\s+(is|was|are|were)\b/.test(query) || /\b(biography|born on|net worth of)\b/.test(query)
}
function validateImages(images, maxKeep = 4, restrictToTrustedDomains = false) {
  if (!images || images.length === 0) return []
  return images.filter(img => {
    if (!img?.url) return false
    try {
      const u = new URL(img.url)
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
      if (restrictToTrustedDomains && !isTrustedBioDomain(u.hostname)) return false
      return true
    } catch { return false }
  }).slice(0, maxKeep)
}

// ─── Scraping / chunking ────────────────────────────────────────
const SCRAPE_TIMEOUT_MS = 4000
const SCRAPE_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0'
function getQueryWords(query) {
  return query.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(w => w.length >= 3)
}
function isCodeOrTechnicalQuery(query) {
  const q = query.toLowerCase()
  const patterns = [
    /\bnums\d?\s*=/, /\bfind the median\b/, /\bo\(log/, /\bo\(n\)/, /\bo\(n\^?\d*\)/,
    /\barray[s]?\b.*\balgorithm\b/, /\bleetcode\b/, /\bbinary search\b/,
    /\bfunction\b.*\breturn\b/, /```/, /\bimplement\b.*\b(function|algorithm|class)\b/,
    /\btime complexity\b/, /\bspace complexity\b/, /\bwrite (a|an) (function|program|script)\b/
  ]
  return patterns.some(p => p.test(q))
}
function scoreChunk(chunkText, queryWords) {
  const lowerText = chunkText.toLowerCase()
  let score = 0
  for (const word of queryWords) {
    score += lowerText.split(word).length - 1
  }
  return score
}
async function scrapeAndChunk(url, query) {
  let html = null
  try {
    const res = await axios.get(url, { timeout: SCRAPE_TIMEOUT_MS, headers: { 'User-Agent': SCRAPE_UA }, maxContentLength: 3 * 1024 * 1024 })
    html = res.data
    if (!html || typeof html !== 'string' || html.length < 500) html = null
  } catch { html = null }
  if (!html) {
    try { html = await renderPage(url) } catch { return null }
  }
  try {
    const chunks = chunkDocument(html, url)
    if (!chunks || chunks.length === 0) return null
    const queryWords = getQueryWords(query)
    const scored = chunks.map(c => ({ ...c, score: scoreChunk(c.text, queryWords) }))
      .sort((a, b) => b.score - a.score)
    return scored.filter(c => c.score > 0).slice(0, MAX_CHUNKS_PER_SOURCE)
  } catch { return null }
}

// ─── Deep search (with timeout) ─────────────────────────────────
async function deepSearch(query) {
  const sources = []
  let images = []

  if (!process.env.TAVILY_API_KEY) {
    return { sources, images }
  }

  try {
    const wantsImages = !isCodeOrTechnicalQuery(query)
    const tavilyRes = await Promise.race([
      axios.post('https://api.tavily.com/search', {
        api_key: process.env.TAVILY_API_KEY,
        query: query,
        search_depth: 'basic',
        max_results: MAX_SOURCES_IN_PROMPT,
        include_answer: false,
        include_images: wantsImages,
        include_image_descriptions: wantsImages
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Tavily timeout after 10s')), 10000))
    ]);

    if (tavilyRes.data.results) {
      for (const result of tavilyRes.data.results) {
        sources.push({ title: result.title || query, url: result.url, snippet: result.content })
      }
    }
    if (tavilyRes.data.images && !isCodeOrTechnicalQuery(query)) {
      const rawImages = tavilyRes.data.images.map(img => typeof img === 'string' ? { url: img, description: '' } : { url: img.url, description: img.description || '' })
      images = await validateImages(rawImages, MAX_IMAGES, isPersonQuery(query))
    }
  } catch (e) {
    console.log('Tavily error:', e.message)
    // fall through with empty sources/images
  }

  // Enrich with scraping (already has its own timeout)
  const enriched = await Promise.allSettled(sources.map(s => scrapeAndChunk(s.url, query)))
  sources.forEach((source, i) => {
    const result = enriched[i]
    if (result.status === 'fulfilled' && result.value) {
      source.snippet = result.value.map(c => c.text).join('\n\n')
      source.chunked = true
    } else {
      source.chunked = false
    }
  })

  return { sources, images }
}

function formatSearchResultsForPrompt(sources) {
  if (!sources || sources.length === 0) return 'No search results found.'
  return sources.slice(0, MAX_SOURCES_IN_PROMPT).map((s, i) => {
    const snippet = (s.snippet || '').slice(0, MAX_SNIPPET_CHARS)
    return `[${i + 1}] ${s.title} — ${s.url}\n${snippet}`
  }).join('\n\n')
}

// ─── Rewrite follow‑up ──────────────────────────────────────────
async function rewriteFollowUpQuery(message, sessionId) {
  if (!groq) return message
  try {
    const history = await getHistory(sessionId)
    if (!history || history.length === 0) return message
    const recentTurns = history.slice(-4).map(h => `${h.role}: ${h.content}`).join('\n')
    const completion = await groq.chat.completions.create({
      model: FAST_MODEL,
      messages: [
        { role: 'system', content: 'Rewrite the user\'s latest message as a fully standalone search query, resolving any pronouns or references. Reply with ONLY the rewritten query, nothing else.' },
        { role: 'user', content: `Conversation so far:\n${recentTurns}\n\nLatest message: "${message}"\n\nStandalone query:` }
      ],
      temperature: 0,
      max_tokens: 100
    })
    const rewritten = completion.choices?.[0]?.message?.content?.trim()
    return rewritten && rewritten.length > 0 ? rewritten : message
  } catch (err) {
    console.error('rewriteFollowUpQuery failed:', err.message)
    return message
  }
}

// ─── System prompts ─────────────────────────────────────────────
const GROUNDED_SYSTEM_PROMPT = `You are Stoic, an AI answer engine. You are given a user query and a set of
web search results, plus possibly earlier turns of this same conversation.
Your job is to produce a grounded, well-structured answer — never from
memory, only from the provided sources and prior conversation context.

CITATION RULES:
- The search results below are already numbered [1], [2], [3]... in the
  SEARCH_RESULTS block.
- Cite generously — most sentences that state a fact should end with a
  citation. Do not save citations only for the end of a paragraph; put
  one after nearly every factual sentence, the way a research report does.
- Whenever a sentence relies on a specific source, add ONLY that source's
  number in plain square brackets immediately after the sentence, e.g.
  "Ronaldo was born in 1985 [1]."
- NEVER use any other citation format. Do NOT use tokens like 【1†L1-L4】,
  do NOT include line ranges, daggers, or any special citation markup.
  The ONLY valid format is a plain number in square brackets: [1], [2], etc.
- If two sources support the same sentence, cite both as [1][2], never
  combined inside one bracket.
- Only cite numbers that actually appear in SEARCH_RESULTS. Never invent a
  number beyond what's listed, and never cite a number if web search was
  disabled for this query.

CONVERSATION CONTEXT RULES:
- If the user's message is a short follow-up (e.g. "give some code",
  "what about X", "explain more") that only makes sense in light of the
  previous turn, resolve it using the conversation history provided.
- Do not repeat the entire previous answer — build on it.

NUMBER GROUNDING RULES:
- Every date, statistic, name, or figure MUST come directly from the search
  results provided below. Never invent or estimate a number.
- If the search results do not contain a fact needed to answer, say so
  explicitly instead of filling the gap from your own knowledge.
- If sources conflict, state the conflict rather than picking one silently.
- If the search results are empty or irrelevant, say you couldn't find
  reliable information rather than answering from memory.

FORMATTING RULES:
- NEVER use markdown headers (#, ##, ###). Use plain paragraphs and **bold**
  text for emphasis only.
- Use proper markdown code fences with language tags (\`\`\`javascript etc.)
  for any code so it renders with syntax highlighting.
- Keep paragraphs short (2-4 sentences).

ANSWER STRUCTURE (follow this exactly for new topics; for follow-ups, adapt
naturally):

1. Lead sentence — one direct sentence answering the question, with the
   single most important entity/fact in **bold**.

2. Context paragraph — 2-4 sentences of supporting detail pulled from the
   sources. Bold key dates, names, and numbers.

3. Details table (ONLY when the query is about an entity). Skip for
   how-to, opinion, or conceptual questions.

   | Feature | Details |
   |---|---|

4. Source line — one sentence pointing to the most authoritative source,
   as a markdown link using its real URL from the search results. Never
   fabricate a URL.

TONE: No filler like "Great question!". Confident but sourced, like a
concise analyst.

${STOIC_SYSTEM_PROMPT}`

const CHITCHAT_SYSTEM_PROMPT = `You are Stoic, a warm and friendly AI assistant.
When the user sends casual greetings, reply in a friendly, concise manner (2-4 sentences).
Keep it natural, no markdown, no long explanations.`

function isChitChat(message) {
  const trimmed = message.trim().toLowerCase()
  if (trimmed.length > 60) return false
  const stripped = trimmed.replace(/\b(bro|bruh|man|dude|buddy|friend|dear|sis|boss|mate)\b/g, '').replace(/\s+/g, ' ').trim()
  const patterns = [
    /^(hi|hello|hey|yo|sup|hii+|hiya)[\s!.?]*$/,
    /^(hi|hello|hey|yo|sup|hii+|hiya)[\s,]*(how are you|what'?s up|how'?s it going|how'?s you)[\s!.?]*$/,
    /^(how are you|what'?s up|how'?s it going|how'?s you)[\s!.?]*$/,
    /^(thanks|thank you|thx|ty)[\s!.?]*$/,
    /^(bye|goodbye|see ya|cya)[\s!.?]*$/,
    /^(ok|okay|cool|nice|great|good)[\s!.?]*$/,
    /^(who are you|what are you|what can you do)[\s!.?]*$/
  ]
  return patterns.some(p => p.test(stripped))
}

// ─── Streaming endpoint (main chat) ──────────────────────────────
app.post('/api/chat/stream', async (req, res) => {
  const { message, model, webSearchOn = true, mode = 'balanced', sessionId = 'default', incognito = false } = req.body

  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'message is required' })
  }

  console.log(`📨 [stream] session=${sessionId} msg="${message}"`)

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders?.()

  const send = (event, data) => {
    res.write(`data: ${JSON.stringify({ event, ...data })}\n\n`)
  }

  let clientAborted = false
  req.on('close', () => { clientAborted = true })

  let finished = false
  const watchdog = setTimeout(() => {
    if (!finished && !clientAborted) {
      console.error(`⏰ [stream] timeout for session ${sessionId}`)
      send('error', { message: 'Request timed out. Please try again.' })
      finished = true
      res.end()
    }
  }, 30 * 1000) // 30s total timeout

  const markFinished = () => {
    finished = true
    clearTimeout(watchdog)
  }

  try {
    // ─── Chit‑chat ──────────────────────────────────────────────
    if (isChitChat(message)) {
      send('thinking', { text: 'Replying' })
      send('sources', { sources: [] })
      send('images', { images: [] })

      let fullContent = ''
      if (groq) {
        try {
          const stream = await groq.chat.completions.create({
            model: FAST_MODEL,
            messages: [
              { role: 'system', content: CHITCHAT_SYSTEM_PROMPT },
              { role: 'user', content: message }
            ],
            temperature: 0.7,
            max_tokens: 150,
            stream: true
          })
          for await (const chunk of stream) {
            if (clientAborted || finished) break
            const delta = chunk.choices[0]?.delta?.content || ''
            if (delta) { fullContent += delta; send('token', { text: delta }) }
          }
        } catch (err) {
          console.error('Chit‑chat Groq error:', err.message)
          fullContent = "Hey there! I'm Stoic. 😊 How can I help you today?"
          send('token', { text: fullContent })
        }
      } else {
        fullContent = "Hey there! I'm Stoic. 😊 How can I help you today?"
        send('token', { text: fullContent })
      }

      if (fullContent.trim().length === 0) {
        fullContent = "Hey there! I'm Stoic. 😊 How can I help you today?"
        send('token', { text: fullContent })
      }

      if (!clientAborted && !finished) {
        if (!incognito) await addToHistory(sessionId, 'user', message)
        if (!incognito) await addToHistory(sessionId, 'assistant', fullContent)
        send('followups', { followUps: [] })
        send('done', {})
      }
      markFinished()
      return res.end()
    }

    // ─── Main search + answer ───────────────────────────────────
    let sources = []
    let images = []
    if (webSearchOn && process.env.TAVILY_API_KEY) {
      send('thinking', { text: `Searching the web for "${message}"` })
      let searchQuery = message
      try {
        searchQuery = await rewriteFollowUpQuery(message, sessionId)
      } catch (e) {
        console.warn('rewriteFollowUpQuery failed, using original message:', e.message)
      }
      if (clientAborted || finished) return res.end()
      const searchResult = await deepSearch(searchQuery)
      if (clientAborted || finished) return res.end()
      sources = searchResult.sources
      images = searchResult.images
      send('sources', { sources })
      send('images', { images })
      send('thinking', {
        text: sources.length > 0
          ? `Found ${sources.length} sources. Reading and synthesizing an answer`
          : 'No strong search results found. Answering carefully from what is available'
      })
    } else {
      send('thinking', { text: 'Answering from general knowledge' })
      send('sources', { sources: [] })
      send('images', { images: [] })
    }

    if (clientAborted || finished) return res.end()

    const formattedResults = webSearchOn && process.env.TAVILY_API_KEY
      ? formatSearchResultsForPrompt(sources)
      : 'Web search was disabled or unavailable — answer from general knowledge, and note that no live sources were checked.'

    const temperature = mode === 'quality' ? 0.15 : mode === 'speed' ? 0.4 : 0.25
    const maxTokens = mode === 'quality' ? 1500 : mode === 'speed' ? 700 : 1200

    let rawHistory = []
    if (!incognito) {
      try {
        rawHistory = await getHistory(sessionId)
      } catch (e) {
        console.error('getHistory failed:', e.message)
        rawHistory = []
      }
    }
    if (clientAborted || finished) return res.end()

    const rawUserContent = `QUERY: ${message}\n\nSEARCH_RESULTS:\n${formattedResults}`
    const { history, userContent } = enforceTokenBudget(GROUNDED_SYSTEM_PROMPT, rawHistory, rawUserContent, maxTokens)

    const promptMessages = [
      { role: 'system', content: GROUNDED_SYSTEM_PROMPT },
      ...history,
      { role: 'user', content: userContent }
    ]

    const effectiveModel = model || FAST_MODEL   // default to FAST
    let fullContent = ''

    if (groq) {
      try {
        console.log(`🤖 Calling Groq with ${effectiveModel} (${mode})`)

        // ─── Groq call with 15s timeout ──────────────────────────
        let stream;
        try {
          stream = await Promise.race([
            groq.chat.completions.create({
              model: effectiveModel,
              messages: promptMessages,
              temperature,
              max_tokens: maxTokens,
              stream: true
            }),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Groq call timed out after 15s')), 15000)
            )
          ]);
        } catch (timeoutError) {
          console.error('❌ Groq timeout:', timeoutError.message);
          send('error', { message: 'The AI service is taking too long. Please try again.' });
          markFinished();
          return res.end();
        }

        let chunkCount = 0
        for await (const chunk of stream) {
          chunkCount++
          if (clientAborted || finished) break
          const delta = chunk.choices?.[0]?.delta?.content || ''
          if (delta) {
            fullContent += delta
            send('token', { text: delta })
          }
        }
        console.log(`🏁 Main stream finished: ${chunkCount} chunks, ${fullContent.length} chars`)

        if (fullContent.trim().length === 0) {
          console.warn('⚠️ Groq returned empty content – using fallback.')
          fullContent = `I'm sorry, I couldn't generate a response for "${message}" at this time. Please try rephrasing your question.`
          send('token', { text: fullContent })
        }
      } catch (err) {
        console.error('❌ Groq stream error:', err.message)
        fullContent = `⚠️ The AI service is currently unavailable. Please try again later.`
        send('token', { text: fullContent })
      }
    } else {
      console.log('🔄 Groq not configured – using mock response')
      fullContent = `🔹 **Mock mode** – Stoic is running without a Groq API key. To get real AI answers, add your GROQ_API_KEY to the .env file and restart.`
      send('token', { text: fullContent })
    }

    if (finished || clientAborted) return res.end()

    if (!incognito) {
      try {
        await addToHistory(sessionId, 'user', message)
        await addToHistory(sessionId, 'assistant', fullContent)
      } catch (e) {
        console.error('addToHistory failed:', e.message)
        // non‑fatal – we still send the reply
      }
    }

    // ─── Generate follow‑ups ────────────────────────────────────
    let followUps = []
    if (groq && fullContent.length > 20) {
      try {
        const followUpResponse = await groq.chat.completions.create({
          model: FAST_MODEL,
          messages: [
            {
              role: 'user',
              content: `Based on this question: "${message}" and this answer: "${fullContent.slice(0, 500)}", generate exactly 3 short natural follow-up questions. Return ONLY a JSON array of 3 strings, nothing else.`
            }
          ],
          temperature: 0.7,
          max_tokens: 150
        })
        followUps = JSON.parse(followUpResponse.choices[0].message.content.trim())
      } catch (e) {
        console.warn('Follow‑up generation failed, using defaults:', e.message)
        followUps = [
          `Tell me more about this topic`,
          `Can you give me some examples?`,
          `What are the latest developments?`
        ]
      }
    } else {
      followUps = [
        `Tell me more about this topic`,
        `Can you give me some examples?`,
        `What are the latest developments?`
      ]
    }

    if (clientAborted || finished) return res.end()

    send('followups', { followUps })
    send('done', {})
    markFinished()
    res.end()

  } catch (error) {
    console.error('🔥 Unhandled stream error:', error)
    if (!clientAborted && !finished) {
      send('error', { message: 'Internal server error. Please try again.' })
    }
    markFinished()
    res.end()
  }
})

// ─── RESEARCH + PDF GENERATION (Minimal version – no Tavily, no Supabase) ──────
app.post('/api/research', async (req, res) => {
  console.log('🚀 /api/research route was called!');
  const { query, sessionId = 'default' } = req.body;

  if (!query || !query.trim()) {
    return res.status(400).json({ error: 'query is required' });
  }

  console.log(`🔬 [research] session=${sessionId} query="${query}"`);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = (event, data) => {
    res.write(`data: ${JSON.stringify({ event, ...data })}\n\n`);
  };

  let clientAborted = false;
  req.on('close', () => { clientAborted = true });

  try {
    // Minimal: no Tavily, no Supabase
    send('thinking', { text: `Researching "${query}" ...` });
    send('sources', { sources: [] });
    send('images', { images: [] });

    if (clientAborted) return res.end();

    // Simple report generation (non‑streaming)
    send('thinking', { text: '✍️ Writing report ...' });

    const systemPrompt = `You are a professional research assistant. Write a comprehensive, well‑structured report on the given topic. Use markdown for headings, lists, and emphasis. The report should be detailed, clear, and suitable for a business audience.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Topic: ${query}` }
    ];

    console.log('📡 Calling Groq for research report (non‑streaming)...');
    const completion = await groq.chat.completions.create({
      model: FAST_MODEL,
      messages,
      temperature: 0.3,
      max_tokens: 2500,
      stream: false
    });
    console.log('✅ Groq call finished');
    const fullContent = completion.choices[0].message.content;
    console.log(`📝 Report generated: ${fullContent.length} chars`);

    send('token', { text: fullContent });

    if (fullContent.trim().length === 0) {
      fullContent = '⚠️ The AI could not generate a report. Please try again.';
      send('token', { text: fullContent });
    }

    if (clientAborted) return res.end();

    // PDF generation
    send('thinking', { text: '📄 Generating PDF ...' });

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Research Report</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; margin: 40px; line-height: 1.6; }
    h1 { color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px; }
    h2 { color: #2980b9; margin-top: 30px; }
    h3 { color: #1abc9c; }
    p { margin: 10px 0; }
    ul, ol { margin: 10px 0 10px 20px; }
    code { background: #f4f4f4; padding: 2px 4px; border-radius: 4px; }
    pre { background: #f4f4f4; padding: 10px; border-radius: 4px; overflow-x: auto; }
    .footer { margin-top: 40px; font-size: 0.9em; color: #7f8c8d; border-top: 1px solid #ddd; padding-top: 10px; }
    .cover { text-align: center; margin-bottom: 40px; }
    .cover h1 { border: none; font-size: 36px; color: #2c3e50; }
    .cover p { color: #7f8c8d; font-size: 18px; }
  </style>
</head>
<body>
  <div class="cover">
    <h1>Research Report</h1>
    <p><strong>Topic:</strong> ${query}</p>
    <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
    <p><strong>Sources:</strong> 0</p>
  </div>
  <hr>
  ${fullContent}
  <div class="footer">
    Generated by Stoic Ultra Research Engine
  </div>
</body>
</html>
    `;

    console.log('📄 Generating PDF from HTML...');
    const pdfBuffer = await generatePDF(htmlContent);
    const pdfBase64 = pdfBuffer.toString('base64');
    console.log('✅ PDF generated, size:', pdfBase64.length);

    send('pdf', { data: pdfBase64, filename: `report-${Date.now()}.pdf` });
    send('done', {});
    res.end();

  } catch (error) {
    console.error('🔥 Research error:', error);
    if (!clientAborted) {
      send('error', { message: error.message });
      res.end();
    }
  }
});

// ─── Other endpoints ─────────────────────────────────────────────
app.post('/api/ultra/search', async (req, res) => {
  res.json({ answer: 'Search endpoint placeholder', sources: [], images: [], followUps: [] })
})

app.post('/api/chat', async (req, res) => {
  const { message, sessionId = 'default' } = req.body
  try {
    res.json({ content: `Echo: ${message}`, thinkingSteps: [], sources: [], images: [], followUps: [] })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/chat/clear', async (req, res) => {
  const { sessionId = 'default' } = req.body
  try {
    await clearHistory(sessionId)
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/ultra/knowledge', (req, res) => {
  const { companyId, documents } = req.body
  if (!companyKnowledge[companyId]) companyKnowledge[companyId] = []
  companyKnowledge[companyId].push(...documents)
  res.json({ success: true, total: companyKnowledge[companyId].length })
})

app.post('/feedback', (req, res) => {
  const { messageId, feedback, sessionId } = req.body
  console.log(`Feedback: ${feedback} for ${messageId}`)
  res.json({ success: true })
})

app.get('/discover/academic', async (req, res) => {
  res.json({ entries: [] })
})

app.get('/discover/markets', async (req, res) => {
  res.json({ items: [] })
})

app.get('/discover/news', async (req, res) => {
  res.json({ items: [], hasMore: false })
})

app.listen(PORT, () => {
  console.log('✅ All routes registered (including /api/research)');
  console.log(`✅ Stoic Ultra backend running on http://localhost:${PORT}`)
  console.log(`🔑 API key present: ${!!process.env.GROQ_API_KEY}`)
  console.log(`📦 Using model: ${FAST_MODEL} by default (timeout 15s)`)
  console.log(`🔍 Tavily search: ${process.env.TAVILY_API_KEY ? 'ENABLED' : 'DISABLED'}`)
  console.log(`🗄️ Supabase memory: ENABLED (with error handling)`)
  console.log(`📊 Token budget: history<=${MAX_HISTORY_MESSAGES} msgs, sources<=${MAX_SOURCES_IN_PROMPT}`)
})

async function shutdown() {
  console.log('Shutting down, closing browser...')
  await closeBrowser()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)