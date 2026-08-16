import dns from 'dns'
import fs from 'fs'
dns.setDefaultResultOrder('ipv4first')
import express from 'express'
import { checkSearxngHealth } from './services/webSearchService.js'
import { runSearch } from './searchPipeline.js'
import { detectLanguageSwitch } from './languageIntent.js'
import cors from 'cors'
import Groq from 'groq-sdk'
import dotenv from 'dotenv'
import conversationsRouter from './routes/conversations.js'
import projectsRouter from './routes/projects.js'
import { detectLocationIntent } from './utils/locationIntent.js'
import { geocodePlace, findNearby } from './services/geoService.js'
import { STOIC_SYSTEM_PROMPT } from './stoicSystemPrompt.js'
import uploadRouter, { getAttachments, clearAttachments } from './routes/upload.js'

dotenv.config()
process.on('exit', (code) => console.log(`🚪 Process exiting with code ${code}`))
process.on('uncaughtException', (err) => console.error('🔥 UNCAUGHT:', err))
process.on('unhandledRejection', (err) => console.error('🔥 UNHANDLED REJECTION:', err))

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json())
app.use('/api/conversations', conversationsRouter)
app.use('/api/projects', projectsRouter)
app.use(uploadRouter)
app.use((err, req, res, next) => {
  if (err && err.name === 'MulterError') {
    return res.status(400).json({ success: false, error: err.message })
  }
  next(err)
})

const HAS_GROQ_KEY = !!process.env.GROQ_API_KEY
if (!HAS_GROQ_KEY) console.warn('⚠️  GROQ_API_KEY missing – mock mode.')

let groq = null
if (HAS_GROQ_KEY) {
  groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
    timeout: 30 * 1000,
    maxRetries: 2,
  })
}

const ANSWER_MODEL = 'openai/gpt-oss-120b'
const FOLLOWUP_MODEL = 'openai/gpt-oss-20b'
const VISION_MODEL = 'qwen/qwen3.6-27b' // Groq marks this preview — swap this one string if it changes

// ---- Groq free-tier TPM budget guard ---------------------------------
const TPM_BUDGET = 7500 // stay under Groq's 8000 hard cap
const MIN_COMPLETION_TOKENS = 512

function estimateTokens(content = '') {
  if (Array.isArray(content)) {
    const textPart = content.filter(c => c.type === 'text').map(c => c.text).join(' ')
    const imageCount = content.filter(c => c.type === 'image_url').length
    return Math.ceil(textPart.length / 4) + imageCount * 500
  }
  return Math.ceil(String(content).length / 4)
}

function estimateMessagesTokens(messages = []) {
  return messages.reduce((sum, m) => sum + estimateTokens(m.content), 0)
}

function safeMaxCompletionTokens(promptMessages, desiredMax) {
  const promptTokens = estimateMessagesTokens(promptMessages)
  const remaining = TPM_BUDGET - promptTokens
  return Math.max(MIN_COMPLETION_TOKENS, Math.min(desiredMax, remaining))
}
// ------------------------------------------------------------------------

const conversationHistory = new Map()
const MAX_HISTORY_MESSAGES = 6
const MAX_HISTORY_CHARS_ASSISTANT = 600
const MAX_HISTORY_CHARS_USER = 300

function getHistory(sessionId) {
  if (!conversationHistory.has(sessionId)) {
    conversationHistory.set(sessionId, [])
  }
  return conversationHistory.get(sessionId)
}

function appendHistory(sessionId, role, content) {
  const history = getHistory(sessionId)
  const cap = role === 'assistant' ? MAX_HISTORY_CHARS_ASSISTANT : MAX_HISTORY_CHARS_USER
  const trimmed = content.length > cap ? content.slice(0, cap) + '…' : content
  history.push({ role, content: trimmed })
  if (history.length > MAX_HISTORY_MESSAGES) {
    history.splice(0, history.length - MAX_HISTORY_MESSAGES)
  }
}

function buildSourcesContext(sources) {
  if (!sources || sources.length === 0) return null
  const lines = sources
    .filter((s) => s.domain)
    .slice(0, 6)
    .map((s, i) => `${i + 1}. domain: ${s.domain} — "${s.title || s.domain}"${s.snippet ? ` — ${s.snippet.slice(0, 120)}` : ''}`)
  if (lines.length === 0) return null
  return `SOURCES AVAILABLE FOR CITATION (use the exact "domain" value shown, nothing else):\n${lines.join('\n')}`
}

function isChitChat(message) {
  const trimmed = message.trim().toLowerCase()
  if (trimmed.length > 60) return false
  const stripped = trimmed.replace(/\b(bro|bruh|man|dude|buddy|friend|dear|sis|boss|mate)\b/g, '').replace(/\s+/g, ' ').trim()
  const patterns = [
    /^(hi|hello|hey|yo|sup|hii+|hiya)[\s!.?]*$/,
    /^(hi|hello|hey|yo|sup|hii+|hiya)[\s,]*(how are you|what'?s up|how'?s it going|how'?s you)[\s!.?]*$/,
    /^(how are you|what'?s up|how'?s it going|how'?s you|how'?s everything|how'?s life)[\s!.?]*$/,
    /^(thanks|thank you|thx|ty|appreciate it)[\s!.?]*$/,
    /^(bye|goodbye|see ya|cya|good night|gn)[\s!.?]*$/,
    /^(ok|okay|cool|nice|great|good|awesome|lol|haha)[\s!.?]*$/,
    /^(who are you|what are you|what can you do|tell me about yourself)[\s!.?]*$/,
    /^(good morning|good afternoon|good evening)[\s!.?]*$/
  ]
  return patterns.some(p => p.test(stripped))
}

const CHITCHAT_SYSTEM_PROMPT = `You are Stoic, a warm and friendly AI. Someone just sent you a casual greeting or small talk, not a real question. Reply the way a genuinely friendly person would — brief, warm, a little personality, never robotic or repetitive. 1-2 sentences max. No bullet points, no markdown, no "How can I help you today" every single time — vary it naturally like a real conversation would. If they ask how you are, answer like you actually have a mood, then turn it back to them.` + STOIC_SYSTEM_PROMPT

function isCasualKnowledgeCheck(message) {
  const trimmed = message.trim().toLowerCase()
  return /^(hey\s+|yo\s+|bro\s+)?(do you know|you know|know)\b/.test(trimmed)
}

const CASUAL_KNOWLEDGE_SYSTEM_PROMPT = `You are Stoic, chatting like a knowledgeable friend, not writing a report. The person asked something casually, phrased like "you know X" — they want a warm, direct confirmation plus the actual answer in 1-3 short sentences, conversational tone, contractions are fine, a light "Yeah, for sure —" style opener is welcome. No headers, no bullet lists, no numbered facts, no formal structure. Just answer like a friend who happens to know it.

Only if real sources are supplied below, and only when a specific claim depends on one, tag that claim inline with [[cite:domain.com]] immediately after it — two square brackets each side, using the exact domain given. Never invent a domain. If no sources are supplied, never emit a [[cite:...]] marker.`

function pickReasoningEffort(message) {
  const len = message.trim().length
  if (len < 40) return 'low'
  if (len < 150) return 'medium'
  return 'high'
}

function pickMaxTokens(message) {
  const len = message.trim().length
  if (len < 40) return 2048
  return 4096
}

const VAGUE_FOLLOWUP = /^(explain more|tell me more|go on|continue|more|elaborate)[\s!.?]*$/i

function resolveSearchQuery(message, sessionId) {
  if (VAGUE_FOLLOWUP.test(message.trim())) {
    const history = getHistory(sessionId)
    const lastUserMsg = [...history].reverse().find((m) => m.role === 'user')?.content
    return lastUserMsg || message
  }
  return message
}

// ---- NEW: job-links intent detection & extraction ----------------------
const JOB_QUERY_RE = /\b(job|jobs|hiring|apply|application|openings|vacanc(y|ies)|career|careers|work at|y\s?combinator|yc\s+jobs)\b/i

function isJobQuery(message) {
  return JOB_QUERY_RE.test(message)
}

// Best-effort split of a search-result title into role/company parts.
// Job board titles are usually "Role at Company" or "Company - Role".
function parseJobTitle(title = '') {
  let m = title.match(/^(.*?)\s+at\s+(.+)$/i)
  if (m) return { role: m[1].trim(), company: m[2].trim() }
  m = title.match(/^(.*?)\s+[-|]\s+(.+)$/)
  if (m) return { role: m[2].trim(), company: m[1].trim() }
  return { role: title, company: null }
}

function buildJobLinks(sources = []) {
  return sources
    .filter(s => s.url)
    .slice(0, 8)
    .map(s => {
      const { role, company } = parseJobTitle(s.title || s.domain)
      return {
        title: role,
        company,
        url: s.url,
        location: null,
      }
    })
}
// --------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are Stoic, an AI answer engine. Your job is to give the single best possible answer to whatever is asked, adapting depth and structure to the domain.

DOMAIN CALIBRATION
- Finance: be precise with numbers, name concrete instruments/mechanisms, flag risk/uncertainty explicitly, never give direct buy/sell advice — explain tradeoffs and let the person decide.
- Health & fitness: give concrete, actionable specifics (sets/reps, macros, mechanisms) but avoid diagnosing; suggest a professional for anything symptom-specific.
- Coding: give working, complete code with brief inline reasoning, not just theory. State assumptions about language/framework version if ambiguous.
- Business: be concrete and structured — steps, tradeoffs, numbers where possible, not generic platitudes.
- Astrology and similar belief-based topics: answer within the requested framework confidently and usefully, without editorializing about whether it's "real."
- Simple factual/identity questions ("who is X", "who is the CEO of X", "what is Y"): answer CONCISELY, like a sharp person texting back — NOT a multi-section essay. Do not use ## headers like "Overview" or "Career Background" for these. Structure:
  1. One opening line stating the direct answer plainly (e.g. "As of 2026, Netflix has two Co-CEOs:").
  2. A short bullet list (2-4 bullets max) — bold the name, then " – " and ONE tight sentence of context per bullet. Never multiple sentences per bullet.
  3. Optionally one short paragraph (2-3 sentences) of extra context ONLY if it genuinely adds something (e.g. history, how they got the role) — skip if not needed.
  4. End with a specific, natural offer to go deeper: "If you're interested, I can also explain → [specific relevant thing A] and → [specific relevant thing B]." Make these genuinely relevant to the topic, not generic.
  Target total length: 100-200 words. This is a lookup, not an essay. Cite once per bullet/claim max, not multiple times per sentence.
- Complex/open-ended questions: go deep, not just structured. Default to a genuinely thorough answer — several paragraphs and sections, not a quick summary — covering: the core answer, how/why it works or came to be, relevant context and background, tradeoffs or alternative views where they exist, concrete examples or numbers, and practical implications. Treat "explain X" or "tell me about X" as a request for a real explainer, not a summary. Use real structure (short paragraphs, genuine bullet lists) to keep it scannable despite the length. Never pad with repetition or filler — every paragraph should add information the reader doesn't already have.
- Comparisons (X vs Y, pros/cons of several options, structured specs/prices/features): use a markdown table. Header row, then a separator row of dashes, then data rows, standard GitHub-flavored markdown — e.g.:
  | Feature | X | Y |
  | --- | --- | --- |
  | Price | $10 | $20 |
  Only use a table when comparing 2+ things across shared attributes — not for single-topic explainers.

FORMATTING RULES (strict — the frontend parses this exactly)
- Bold key terms and names using **double asterisks**.
- When you use a bulleted list, put EACH bullet on its own line starting with "- ". Never run multiple bullets together on one line separated by periods or dashes.
- Separate distinct ideas into their own paragraph, separated by a blank line.
- Do not use numbered citation brackets like [1] or [2].
- Cite frequently — aim for a citation after nearly every factual sentence that depends on a source, not just once per paragraph. Spread citations across ALL supplied sources, not just the first one or two.
- Only if real sources are supplied to you in this conversation, and only when a specific claim depends on one, tag that claim inline with [[cite:domain.com]] immediately after it — TWO square brackets on each side, exactly like that, using the exact domain from the supplied source list. Example: "The company was founded in 2015.[[cite:openai.com]]" Never invent a domain that wasn't given to you, never use a single bracket like [domain.com], and never emit a [[cite:...]] marker if no sources were supplied.

Be direct. Do not open with filler like "Great question!" Get straight into the answer.` + STOIC_SYSTEM_PROMPT

async function generateFollowUps(message, answerContent) {
  try {
    const followUpCompletion = await groq.chat.completions.create({
      model: FOLLOWUP_MODEL,
      messages: [
        {
          role: 'user',
          content: `Question: "${message}"\nAnswer: "${answerContent.slice(0, 1500)}"\n\nSuggest exactly 6 short, natural follow-up questions (under 12 words each) a curious person might ask next. One per line, no numbering, no quotes, no extra commentary, no intro sentence — just the 6 lines.`
        }
      ],
      temperature: 0.6,
      max_tokens: 300,
    })
    const raw = followUpCompletion.choices?.[0]?.message?.content || ''
    const cleaned = raw
      .split('\n')
      .map(l => l.replace(/^[-*\d.)\s]+/, '').trim())
      .filter(Boolean)
      .filter(l => l.split(' ').length >= 3)
      .slice(0, 6)
    return cleaned
  } catch (fuError) {
    console.warn('⚠️ Follow-up generation failed, sending none:', fuError.message)
    return []
  }
}

app.post('/api/chat/stream', async (req, res) => {
  const { message, sessionId = 'default', userLat, userLon } = req.body

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

  try {
    if (isChitChat(message)) {
      send('thinking', { text: 'Replying' })
      send('sources', { sources: [] })
      send('images', { images: [] })

      const chitchatStream = await groq.chat.completions.create({
        model: FOLLOWUP_MODEL,
        messages: [
          { role: 'system', content: CHITCHAT_SYSTEM_PROMPT },
          { role: 'user', content: message }
        ],
        temperature: 0.9,
        max_tokens: 80,
        stream: true
      })

      let chitchatReply = ''
      for await (const chunk of chitchatStream) {
        const delta = chunk.choices?.[0]?.delta?.content
        if (delta) {
          chitchatReply += delta
          send('token', { text: delta })
        }
      }

      appendHistory(sessionId, 'user', message)
      appendHistory(sessionId, 'assistant', chitchatReply)

      send('followups', { followUps: [] })
      send('done', {})
      return res.end()
    }

    if (isCasualKnowledgeCheck(message)) {
      send('thinking', { text: 'Thinking about it' })

      const { sources, images } = await runSearch(message, 'balanced')
      send('sources', { sources })
      send('images', { images })

      const sourcesContext = buildSourcesContext(sources)
      const casualMessages = [
        { role: 'system', content: CASUAL_KNOWLEDGE_SYSTEM_PROMPT },
      ]
      if (sourcesContext) casualMessages.push({ role: 'system', content: sourcesContext })
      casualMessages.push({ role: 'user', content: message })

      const casualMaxTokens = safeMaxCompletionTokens(casualMessages, 400)

      const casualStream = await groq.chat.completions.create({
        model: ANSWER_MODEL,
        messages: casualMessages,
        temperature: 0.7,
        max_completion_tokens: casualMaxTokens,
        stream: true
      })

      let casualContent = ''
      for await (const chunk of casualStream) {
        const delta = chunk.choices?.[0]?.delta?.content
        if (delta) {
          casualContent += delta
          send('token', { text: delta })
        }
      }

      appendHistory(sessionId, 'user', message)
      appendHistory(sessionId, 'assistant', casualContent)

      const followUps = await generateFollowUps(message, casualContent)
      send('followups', { followUps })
      send('done', {})
      return res.end()
    }

    const { switched: isLanguageSwitch, newLanguage: targetLanguage } = detectLanguageSwitch(message)

    if (isLanguageSwitch) {
      const history = getHistory(sessionId)
      const previousAnswer = [...history].reverse().find(m => m.role === 'assistant')?.content
      const previousTopic = [...history].reverse().find(m => m.role === 'user')?.content

      send('thinking', { text: `Rewriting in ${targetLanguage}` })
      send('sources', { sources: [] })
      send('images', { images: [] })

      const langSystemPrompt = previousAnswer
        ? `The user wants the SAME information as before, re-written entirely in ${targetLanguage}, using its native script.
Do not search for new information. Do not change the topic or add new facts.
Translate the FULL content — all sections, not just the first one. Do not summarize or truncate. Match the length and structure of the original answer.
Preserve the original structure exactly: if the original answer used bullet points or section headers, keep the same structure in ${targetLanguage} too — don't collapse them into a single paragraph.
Original topic: "${previousTopic}"
Original answer to re-express in full, in ${targetLanguage}: "${previousAnswer}"`
        : `The user asked to respond in ${targetLanguage}, but there is no prior answer in this session to translate. Politely ask, in ${targetLanguage}, what they'd like to know.`

      const langMessages = [
        { role: 'system', content: langSystemPrompt },
        { role: 'user', content: message }
      ]
      const langMaxTokens = safeMaxCompletionTokens(langMessages, 3072)

      const langStream = await groq.chat.completions.create({
        model: ANSWER_MODEL,
        messages: langMessages,
        temperature: 0.4,
        max_completion_tokens: langMaxTokens,
        stream: true
      })

      let langContent = ''
      for await (const chunk of langStream) {
        const delta = chunk.choices?.[0]?.delta?.content
        if (delta) {
          langContent += delta
          send('token', { text: delta })
        }
      }

      appendHistory(sessionId, 'user', message)
      appendHistory(sessionId, 'assistant', langContent)

      send('followups', { followUps: [] })
      send('done', {})
      return res.end()
    }

    send('thinking', { text: 'Understanding your question' })
    send('thinking', { text: 'Searching the web' })

    const searchQuery = resolveSearchQuery(message, sessionId)
    const { sources, images } = await runSearch(searchQuery, 'balanced')

    console.log(`🖼️ Images from runSearch: ${images?.length || 0}`)

    send('sources', { sources })
    send('images', { images })

    // NEW: job-links feature — only fires for job-intent queries
    if (isJobQuery(message)) {
      const jobs = buildJobLinks(sources)
      send('jobs', { jobs })
    }

    const locationIntent = detectLocationIntent(message)
    if (locationIntent.needsMap) {
      try {
        if (locationIntent.isNearMe && userLat && userLon) {
          const places = await findNearby({
            lat: userLat,
            lon: userLon,
            category: locationIntent.category,
          })
          send('map', { type: 'nearby', center: { lat: userLat, lon: userLon }, places })
        } else if (locationIntent.isPlaceQuery) {
          const geo = await geocodePlace(message)
          if (geo) {
            send('map', { type: 'single', center: { lat: geo.lat, lon: geo.lon }, label: geo.displayName })
          }
        }
      } catch (mapError) {
        console.warn('⚠️ Map lookup failed, continuing without map:', mapError.message)
      }
    }

    if (!groq) {
      send('token', { text: '⚠️ No Groq API key – please set GROQ_API_KEY in .env' })
      send('done', {})
      return res.end()
    }

    const sourcesContext = buildSourcesContext(sources)
    const promptMessages = [
      { role: 'system', content: SYSTEM_PROMPT },
    ]
    if (sourcesContext) promptMessages.push({ role: 'system', content: sourcesContext })
    promptMessages.push(...getHistory(sessionId))
    promptMessages.push({ role: 'user', content: message })

    const attachments = getAttachments(sessionId)
    const imageAttachments = attachments.filter(a => a.type === 'image')
    const textAttachments = attachments.filter(a => a.textContent)

    let modelToUse = ANSWER_MODEL

    if (textAttachments.length > 0) {
      const attachmentContext = textAttachments
        .map(a => `--- Attached file: ${a.name} ---\n${a.textContent}`)
        .join('\n\n')
      promptMessages.push({ role: 'system', content: `ATTACHED FILE CONTENT (use this to answer if relevant):\n${attachmentContext}` })
    }

    if (imageAttachments.length > 0) {
      modelToUse = VISION_MODEL
      const lastIdx = promptMessages.length - 1
      const userText = promptMessages[lastIdx].content
      promptMessages[lastIdx] = {
        role: 'user',
        content: [
          { type: 'text', text: userText },
          ...imageAttachments.slice(0, 4).map(img => {
            const base64 = fs.readFileSync(img.path, { encoding: 'base64' })
            const dataUrl = `data:${img.mimetype};base64,${base64}`
            return {
              type: 'image_url',
              image_url: { url: dataUrl },
            }
          }),
        ],
      }
    }

    clearAttachments(sessionId)

    const reasoningEffort = pickReasoningEffort(message)
    const desiredMaxTokens = pickMaxTokens(message)
    const maxTokens = safeMaxCompletionTokens(promptMessages, desiredMaxTokens)
    send('thinking', { text: imageAttachments.length > 0 ? 'Looking at what you sent' : 'Reasoning through the answer' })

    const streamOptions = {
      model: modelToUse,
      messages: promptMessages,
      temperature: 0.4,
      max_completion_tokens: maxTokens,
      stream: true,
    }
    if (modelToUse === ANSWER_MODEL) {
      streamOptions.reasoning_effort = reasoningEffort
      streamOptions.include_reasoning = true
    }
    const stream = await groq.chat.completions.create(streamOptions)

    let fullContent = ''
    let fullReasoning = ''
    let chunkCount = 0
    let sentFirstTokenStep = false

    for await (const chunk of stream) {
      chunkCount++
      const delta = chunk.choices?.[0]?.delta || {}

      if (delta.reasoning) {
        fullReasoning += delta.reasoning
      }

      if (delta.content) {
        if (!sentFirstTokenStep) {
          send('thinking', { text: 'Writing the answer' })
          sentFirstTokenStep = true
        }
        fullContent += delta.content
        send('token', { text: delta.content })
      }
    }

    if (fullReasoning) {
      send('reasoning', { text: fullReasoning })
    }

    console.log(`✅ Stream finished: ${chunkCount} chunks, ${fullContent.length} chars, ${fullReasoning.length} reasoning chars, effort=${reasoningEffort}, maxTokens=${maxTokens} (desired ${desiredMaxTokens}), sourcesGivenToModel=${sources.filter(s => s.domain).length}, model=${modelToUse}`)

    if (fullContent.trim().length === 0) {
      console.warn('⚠️ Empty response – using fallback')
      send('token', { text: 'I could not generate a response. Please try again.' })
    }

    appendHistory(sessionId, 'user', message)
    appendHistory(sessionId, 'assistant', fullContent)

    const followUps = await generateFollowUps(message, fullContent)
    send('followups', { followUps })
    send('done', {})
    res.end()

  } catch (error) {
    console.error('🔥 ERROR:', error)
    console.error('📄 Full error:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2))
    send('error', { message: 'Internal error: ' + error.message })
    res.end()
  }
})

app.listen(PORT, () => {
  console.log(`✅ Stoic backend running on http://localhost:${PORT}`)
  console.log(`🔑 API key present: ${!!process.env.GROQ_API_KEY}`)
  console.log(`🧠 Answer model: ${ANSWER_MODEL} | Follow-up model: ${FOLLOWUP_MODEL} | Vision model: ${VISION_MODEL}`)
})