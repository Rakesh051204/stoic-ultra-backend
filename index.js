import gameChat from './lib/gameChat.cjs'
import gamesRouter from './routes/games.cjs'
import { handleJobRequest } from './lib/jobIntent.js'
import { registerMail } from './lib/mailRoute.js'
import { handleModuleRequest } from './lib/modules.js'
import { handleImageRequest } from './lib/imageIntent.js'
console.log('[BOOT] jobs engine patch v3 loaded')
import dns from 'dns'
import fs from 'fs'
dns.setDefaultResultOrder('ipv4first')
import 'dotenv/config'
import express from 'express'
import { checkSearxngHealth } from './services/webSearchService.js'
import { isResearchRequest, runResearch } from './lib/research.js'
import { searchVideos, wantsVideos } from './services/videoService.js'
import { WIDGET_PROMPT } from './services/widgetPrompt.js'
import { ANSWER_FIRST_PROMPT } from './services/answerFirstPrompt.js'
import deployRouter from './routes/deploy.js'
import { scoreResume } from './services/atsScorer.js'
import { buildAtsBlock } from './services/atsWidget.js'
import { detectClocks } from './services/clockService.js'
import { wantsJobs, buildJobsReport, friendlyText } from './services/jobsReport.js'
import jobsReportRouter from './routes/jobsReport.js'
import resumeRouter from './routes/resume.js'
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
import { getToneContext, CRISIS_PROMPT, CRISIS_FALLBACK } from './toneEngine.js'
import { isHardQuestion, DEEP_THINK_PROMPT } from './lib/reasoningEngine.js'
import { skipSearch } from './lib/searchGate.js'
const WEBSITE_RE_BASE = /\b(build|make|create|design|develop|generate)\b[\s\S]{0,60}\b(website|web ?site|landing page|web ?page|web ?app|portfolio|homepage)\b|\b(website|landing page)\b/i
const WEBSITE_FENCE = String.fromCharCode(96, 96, 96)
const WEBSITE_SLIM = 'You are Stoic, an expert web designer. Reply with one short line, then ONE complete single-file page inside a fenced code block that starts with ' + WEBSITE_FENCE + 'website and ends with ' + WEBSITE_FENCE + '. The page starts with <!DOCTYPE html> and ends with </html>. All CSS in one <style> using CSS variables, all JS in one <script> (max 12 lines), no external files except Google Fonts. Design it like a premium real brand site (Starbucks or Apple level): sticky header, full-width hero with a dark gradient overlay and a big headline, product or menu cards with prices, an about section, a visit-our-outlet section, and a footer with address and hours. REAL PHOTOS: use 6 img tags written exactly like <img class="ph" data-photo="DESCRIPTION"> where DESCRIPTION is a specific 12 to 20 word photo description (subject, setting, lighting, camera angle). Never write a src attribute and never draw scenes with SVG or CSS art. Style .ph with width 100 percent, a fixed height, object-fit cover and rounded corners. The hero also uses a photo: a position relative box with the img absolutely filling it, then the dark gradient overlay and the headline on top. HARD LIMIT: the page MUST be finished, so keep the WHOLE page under 10000 characters. CSS ORDER: put only a tiny style in the head (CSS variables, body font, the .ph rule, max 12 lines), then write the complete body content, then put ALL remaining CSS in a second style tag at the very END of the body, before the script, so a cut-off page still shows its content. Emoji for icons, emoji for icons, never SVG path data. Content must be visible by default: never use opacity 0 waiting for a script. Use the real shop or brand name and specific copy (menu items with prices, address, hours). After the block write two short lines about what you built.'
const HOUSE_SLIM = 'You are Stoic, a residential architect and web designer. Reply with one short line, then ONE complete single-file page inside a fenced code block that starts with ' + WEBSITE_FENCE + 'website and ends with ' + WEBSITE_FENCE + '. The page starts with <!DOCTYPE html> and ends with </html>. All CSS in one <style>, JS minimal, no external files except Google Fonts. It is a realistic architectural concept presentation with these sections in order: (1) full-width hero with a photo of the exterior and the project name; (2) key facts row (style, bedrooms, bathrooms, built-up area, plot size, pool); (3) Floor plan: ONE clean inline SVG with viewBox 0 0 800 500 drawn only with rect, line and text elements: thick dark wall outlines, every room labeled with its name and size in feet, door gaps, rooms scaled sensibly to the plot and the room counts the user asked for, white lines on a deep blue blueprint background, at most 30 elements; (4) room schedule table with sizes; (5) photo gallery of 4 interior and garden photos; (6) materials and finishes plus an approximate budget range; (7) one-line disclaimer that this is an idea sketch, not a construction drawing. REAL PHOTOS: use 6 img tags written exactly like <img class="ph" data-photo="DESCRIPTION"> with a specific 12 to 20 word photo description each: exterior at dusk with pool, living room, open kitchen, master bedroom, pool and garden aerial view, entrance courtyard. Never write a src attribute. NEVER draw the house, rooms or landscape with SVG shapes or CSS art: the ONLY SVG allowed is the floor plan. Style .ph with width 100 percent, a fixed height, object-fit cover and rounded corners. HARD LIMIT: finish the page, keep the WHOLE page under 10000 characters. CSS ORDER: put only a tiny style in the head (CSS variables, body font, the .ph rule, max 12 lines), then write the complete body content, then put ALL remaining CSS in a second style tag at the very END of the body, before the script, so a cut-off page still shows its content. Emoji for icons, emoji for icons. Content visible by default, never opacity 0 waiting for a script. After the block write two short lines about what you built.'
const HOUSE_RE = /\b(house|home(?!\s?page)|villa|bungalow|floor ?plan|architect\w*|bedrooms?)\b[\s\S]*\b(design|draw|sketch|plan|layout|blueprint|build)\b|\b(design|draw|sketch|plan|layout|blueprint|build)\b[\s\S]*\b(house|home(?!\s?page)|villa|bungalow|floor ?plan|architect\w*|bedrooms?)\b/i
const WEBSITE_RE = { test: (m) => WEBSITE_RE_BASE.test(String(m)) || HOUSE_RE.test(String(m)) }
const CODE_TASK_RE = /\b(code|solve|implement|function|leetcode|python|java|c\+\+|javascript|algorithm|program)\b|Example 1:|Constraints:/i

function shouldShowImages(message) {
  const m = String(message || '')
  if (CODE_TASK_RE.test(m)) return false
  const explicit = /\b(pictures?|photos?|images?|pics?|show me|look like|looks like)\b/i
  if (explicit.test(m)) return true
  const noImage = /\b(explain|how (to|do|does|can|is)|why|difference|meaning|define|definition|summar\w*|translate|write|fix|debug|error|steps?|tutorial|compare|vs|versus|difference)\b/i
  if (noImage.test(m)) return false
  const entity = /^\s*(who\s+(is|was|are|were)|where\s+(is|are)|what\s+is\s+the\s+(capital|tallest|largest)|(best|top)\s+(places|things|hotels|beaches|restaurants)|(places|things)\s+to\s+(visit|do|see))\b/i
  return entity.test(m)
}
async function saveChatTurn(sessionId, userText, assistantText, sources = [], images = [], meta = {}) {
  try {
    if (!sessionId || sessionId === 'voice') return
    const um = meta && meta.user ? meta.user : null
    const am = meta && meta.assistant ? meta.assistant : null
    const rows = [
      { session_id: sessionId, role: 'user', content: userText },
      { session_id: sessionId, role: 'assistant', content: assistantText, sources: sources || [], images: images || [] },
    ]
    if (um) rows[0].meta = um
    if (am) rows[1].meta = am
    let r = await supabase.from('messages').insert(rows)
    if (r.error && (um || am)) {
      console.error('save with meta failed, retrying without it:', r.error.message)
      r = await supabase.from('messages').insert(rows.map(({ meta, ...rest }) => rest))
    }
    if (r.error) console.error('save messages failed:', r.error.message)
  } catch (e) { console.error('save messages error:', e.message) }
}
import uploadRouter, { getAttachments, clearAttachments } from './routes/upload.js'
import connectorsRouter from './routes/connectors.js'
import { groqToolDefinitions } from './connectors/toolDefinitionsGroq.js'
import { executeOpenAIToolCalls } from './connectors/toolExecutor.js'
import { createClient } from '@supabase/supabase-js'

dotenv.config()
process.on('exit', (code) => console.log(`ðŸšª Process exiting with code ${code}`))
process.on('uncaughtException', (err) => console.error('ðŸ”¥ UNCAUGHT:', err))
process.on('unhandledRejection', (err) => console.error('ðŸ”¥ UNHANDLED REJECTION:', err))

const app = express()
app.use(gameChat)
registerMail(app)
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json({ limit: '5mb' }))
app.use('/api/conversations', conversationsRouter)
app.use('/api/projects', projectsRouter)
app.use(uploadRouter)
app.use('/api/connectors', connectorsRouter)
app.use((err, req, res, next) => {
  if (err && err.name === 'MulterError') {
    return res.status(400).json({ success: false, error: err.message })
  }
  next(err)
})

const HAS_GROQ_KEY = !!process.env.GROQ_API_KEY
if (!HAS_GROQ_KEY) console.warn('âš ï¸  GROQ_API_KEY missing â€“ mock mode.')

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
const VISION_MODEL = process.env.VISION_MODEL || 'qwen/qwen3.8-27b' // set VISION_MODEL in .env to change

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

// ---- Connector tool-calling (Slack, Notion, GitHub) -------------------
// Your app doesn't have full session-based auth yet, but connectors.js
// already expects a real user id via the x-user-id header (see requireUser
// in routes/connectors.js). The chat frontend isn't sending that header
// yet, so fall back to the one real user id already in your
// user_connectors table for local testing.
const DEFAULT_USER_ID = 'user_u7bqbp9x2gqmsomj7zc'

function resolveUserId(req) {
  return req.headers['x-user-id'] || DEFAULT_USER_ID
}

// Simple keyword check â€” avoids calling Groq with tools attached on
// every single message (adds latency + cost).
function isConnectorQuery(message) {
  const m = message.toLowerCase()
  const mentionsService = /\b(slack|notion|github)\b/.test(m)
  const mentionsAction = /\b(send|message|create|list|show|get|check|search|comment|issue|repo|page|channel)\b/.test(m)
  return mentionsService && mentionsAction
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
  const trimmed = content.length > cap ? content.slice(0, cap) + 'â€¦' : content
  history.push({ role, content: trimmed })
  if (history.length > MAX_HISTORY_MESSAGES) {
    history.splice(0, history.length - MAX_HISTORY_MESSAGES)
  }
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

async function persistSession(sessionId, message) {
  if (!sessionId || sessionId === 'default' || sessionId === 'voice') return

  try {
    const existingResult = await supabase.from('sessions').select('id').eq('id', sessionId).maybeSingle()
    if (existingResult.error) {
      console.error('persistSession lookup failed:', existingResult.error.message)
      return
    }

    const now = new Date().toISOString()

    if (existingResult.data) {
      const updateResult = await supabase.from('sessions').update({ updated_at: now }).eq('id', sessionId)
      if (updateResult.error) console.error('persistSession update failed:', updateResult.error.message)
    } else {
      const title = message.length > 60 ? message.slice(0, 60) + '...' : message
      const insertResult = await supabase.from('sessions').insert({
        id: sessionId,
        title: title,
        created_at: now,
        updated_at: now,
      })
      if (insertResult.error) console.error('persistSession insert failed:', insertResult.error.message)
    }
  } catch (err) {
    console.error('persistSession unexpected error:', err.message)
  }
}

function buildSourcesContext(sources) {
  if (!sources || sources.length === 0) return null
  const lines = sources
    .filter((s) => s.domain)
    .slice(0, 10)
    .map((s, i) => `${i + 1}. domain: ${s.domain} â€” "${s.title || s.domain}"${s.snippet ? ` â€” ${s.snippet.slice(0, 120)}` : ''}`)
  if (lines.length === 0) return null
  return `SOURCES AVAILABLE FOR CITATION â€” YOU MUST ONLY USE A DOMAIN FROM THIS EXACT LIST. If none of these sources support a claim, do NOT add a citation for that claim. Do not use any domain you know from memory that is not listed here:\n${lines.join('\n')}`
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

const CHITCHAT_SYSTEM_PROMPT = `You are Stoic, a warm and friendly AI. Someone just sent you a casual greeting or small talk, not a real question. Reply the way a genuinely friendly person would â€” brief, warm, a little personality, never robotic or repetitive. 1-2 sentences max. No bullet points, no markdown, no "How can I help you today" every single time â€” vary it naturally like a real conversation would. If they ask how you are, answer like you actually have a mood, then turn it back to them.` + STOIC_SYSTEM_PROMPT

function isCasualKnowledgeCheck(message) {
  const trimmed = message.trim().toLowerCase()
  return /^(hey\s+|yo\s+|bro\s+)?(do you know|you know|know)\b/.test(trimmed)
}

const CASUAL_KNOWLEDGE_SYSTEM_PROMPT = `You are Stoic, chatting like a knowledgeable friend, not writing a report. The person asked something casually, phrased like "you know X" — they want a warm, direct confirmation plus the actual answer in 1-3 short sentences, conversational tone, contractions are fine, a light "Yeah, for sure —" style opener is welcome. No headers, no bullet lists, no numbered facts, no formal structure. Just answer like a friend who happens to know it.

CRITICAL: If sources are supplied below, they are more current than anything you learned during training. For any claim about recent events, scores, winners, current holders of a position, or anything that could have changed — always defer to the supplied sources over your own memory, even if your memory feels confident. If the sources contradict what you "know," the sources win. If no sources are supplied and the question needs current information you don't have, say so honestly instead of guessing from memory.

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
- Finance: be precise with numbers, name concrete instruments/mechanisms, flag risk/uncertainty explicitly, never give direct buy/sell advice â€” explain tradeoffs and let the person decide.
- Health & fitness: give concrete, actionable specifics (sets/reps, macros, mechanisms) but avoid diagnosing; suggest a professional for anything symptom-specific.
- Coding: give working, complete code with brief inline reasoning, not just theory. State assumptions about language/framework version if ambiguous.
- Business: be concrete and structured â€” steps, tradeoffs, numbers where possible, not generic platitudes.
- Astrology and similar belief-based topics: answer within the requested framework confidently and usefully, without editorializing about whether it's "real."
- Simple factual/identity questions ("who is X", "who is the CEO of X", "what is Y"): answer CONCISELY, like a sharp person texting back â€” NOT a multi-section essay. Do not use ## headers like "Overview" or "Career Background" for these. Structure:
  1. One opening line stating the direct answer plainly (e.g. "As of 2026, Netflix has two Co-CEOs:").
  2. A short bullet list (2-4 bullets max) â€” bold the name, then " â€“ " and ONE tight sentence of context per bullet. Never multiple sentences per bullet.
  3. Optionally one short paragraph (2-3 sentences) of extra context ONLY if it genuinely adds something (e.g. history, how they got the role) â€” skip if not needed.
  4. End with a specific, natural offer to go deeper: "If you're interested, I can also explain â†’ [specific relevant thing A] and â†’ [specific relevant thing B]." Make these genuinely relevant to the topic, not generic.
  Target total length: 100-200 words. This is a lookup, not an essay. Cite once per bullet/claim max, not multiple times per sentence.
- Complex/open-ended questions: go deep, not just structured. Default to a genuinely thorough answer â€” several paragraphs and sections, not a quick summary â€” covering: the core answer, how/why it works or came to be, relevant context and background, tradeoffs or alternative views where they exist, concrete examples or numbers, and practical implications. Treat "explain X" or "tell me about X" as a request for a real explainer, not a summary. Use real structure (short paragraphs, genuine bullet lists) to keep it scannable despite the length. Never pad with repetition or filler â€” every paragraph should add information the reader doesn't already have.
- Comparisons (X vs Y, pros/cons of several options, structured specs/prices/features): use a markdown table. Header row, then a separator row of dashes, then data rows, standard GitHub-flavored markdown â€” e.g.:
  | Feature | X | Y |
  | --- | --- | --- |
  | Price | $10 | $20 |
  Only use a table when comparing 2+ things across shared attributes â€” not for single-topic explainers.

FORMATTING RULES (strict â€” the frontend parses this exactly)
- Bold key terms and names using **double asterisks**.
- When you use a bulleted list, put EACH bullet on its own line starting with "- ". Never run multiple bullets together on one line separated by periods or dashes.
- Separate distinct ideas into their own paragraph, separated by a blank line.
- Do not use numbered citation brackets like [1] or [2].
- Cite frequently â€” aim for a citation after nearly every factual sentence that depends on a source, not just once per paragraph. Spread citations across ALL supplied sources, not just the first one or two.
- Only if real sources are supplied to you in this conversation, and only when a specific claim depends on one, tag that claim inline with [[cite:domain.com]] immediately after it â€” TWO square brackets on each side, exactly like that, using the exact domain from the supplied source list. Example: "The company was founded in 2015.[[cite:openai.com]]" Never invent a domain that wasn't given to you, never use a single bracket like [domain.com], and never emit a [[cite:...]] marker if no sources were supplied.

Be direct. Do not open with filler like "Great question!" Get straight into the answer.` + STOIC_SYSTEM_PROMPT

async function generateFollowUps(message, answerContent) {
  try {
    const followUpCompletion = await groq.chat.completions.create({
      model: FOLLOWUP_MODEL,
      messages: [
        {
          role: 'user',
          content: `Question: "${message}"\nAnswer: "${answerContent.slice(0, 1500)}"\n\nSuggest exactly 6 short, natural follow-up questions (under 12 words each) a curious person might ask next. One per line, no numbering, no quotes, no extra commentary, no intro sentence â€” just the 6 lines.`
        }
      ],
      temperature: 0.6,
      max_tokens: 1200, reasoning_effort: 'low',
    })
    const raw = followUpCompletion.choices?.[0]?.message?.content || ''
    const cleaned = raw
      .split('\n')
      .map(l => l.replace(/^[-*\d.)\s]+/, '').trim())
      .filter(Boolean)
      .filter(l => l.split(' ').length >= 3)
      .slice(0, 12)
    return cleaned
  } catch (fuError) {
    console.warn('âš ï¸ Follow-up generation failed, sending none:', fuError.message)
    return []
  }
}

app.use('/api/resume', resumeRouter)
app.use('/api/deploy', deployRouter)
app.use('/api/jobs', jobsReportRouter)
app.post('/api/chat/stream', async (req, res) => {
  const { message, sessionId = 'default', userLat, userLon } = req.body

  persistSession(sessionId, message)

  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'message is required' })
  }

  console.log(`ðŸ“¨ [stream] session=${sessionId} msg="${message}"`)
  const CODE_RE = /\b(code|solve|implement|function|leetcode|python|java|c\+\+|javascript|algorithm|program)\b|Example 1:|Constraints:/i;
  const _hist = (typeof history !== "undefined" && Array.isArray(history)) ? history : [];
  const _lastMsgs = _hist.slice(-4).map(m => (m && m.content) || "").join(" ");
  const isCodeTask = CODE_RE.test(String(message)) || CODE_RE.test(_lastMsgs);

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders?.()

  const send = (event, data) => {
    res.write(`data: ${JSON.stringify({ event, ...data })}\n\n`)
  }

    /* RESEARCH-HOOK */ try { if (isResearchRequest(message)) { let _racc = ''; const _rsend = (ev, d) => { if (ev === 'token') _racc += (d && d.text) || ''; send(ev, d) }; await runResearch({ message, send: _rsend }); try { appendHistory(sessionId, 'user', message); appendHistory(sessionId, 'assistant', _racc); await saveChatTurn(sessionId, message, _racc, [], []) } catch (_s) { console.error('[research] save failed:', _s.message) } send('followups', { followUps: [] }); send('done', {}); return res.end() } } catch (e) { console.error('[research] failed:', e.stack || e.message) }
    /* MOD-HOOK-EARLY */ try { console.log('[mod] checking:', String(message).slice(0, 60)); let _rs2 = ''; try { _rs2 = (getAttachments(sessionId) || []).map(a => a.textContent || a.extractedText || '').join('\n') } catch (_e) {} let _acc = ''; const _send = (ev, d) => { if (ev === 'token') _acc += (d && d.text) || ''; send(ev, d) }; if (await handleModuleRequest({ message, send: _send, resumeText: _rs2 })) { try { appendHistory(sessionId, 'user', message); appendHistory(sessionId, 'assistant', _acc); await saveChatTurn(sessionId, message, _acc, [], []) } catch (_s) { console.error('[mod] save failed:', _s.message) } send('followups', { followUps: [] }); send('done', {}); return res.end() } } catch (e) { console.error('[mod] failed:', e.stack || e.message) }
  try {
    var __tone = { mood: 'neutral', instruction: '' }
    try { __tone = await getToneContext(String(message), getHistory(sessionId) || [], FOLLOWUP_MODEL) } catch (_t) { console.error('[tone] failed:', _t.message) }
    if (__tone.mood === 'crisis') {
      console.log('[tone] crisis path')
      send('thinking', { text: 'Replying' })
      send('sources', { sources: [] })
      send('images', { images: [] })
      const _cs = await groq.chat.completions.create({
        model: ANSWER_MODEL,
        messages: [{ role: 'system', content: CRISIS_PROMPT }, ...((getHistory(sessionId) || []).slice(-6)), { role: 'user', content: message }],
        temperature: 0.5,
        max_completion_tokens: 900,
        reasoning_effort: 'low',
        stream: true
      })
      let _cr = ''
      for await (const chunk of _cs) {
        const d = chunk.choices?.[0]?.delta?.content
        if (d) { _cr += d; send('token', { text: d }) }
      }
      if (!_cr.trim()) { _cr = CRISIS_FALLBACK; send('token', { text: _cr }) }
      appendHistory(sessionId, 'user', message)
      appendHistory(sessionId, 'assistant', _cr)
      await saveChatTurn(sessionId, message, _cr, [], [])
      send('followups', { followUps: [] })
      send('done', {})
      return res.end()
    }
    if (['sad', 'anxious', 'discouraged'].includes(__tone.mood) && !isCodeTask && !/\b(ats|resume|cv|jobs?|vacanc\w*|hiring|salary)\b/i.test(String(message))) {
      console.log('[tone] support path (no search):', __tone.mood)
      send('thinking', { text: 'Replying' })
      send('sources', { sources: [] })
      send('images', { images: [] })
      const _SUP = 'You are Stoic, a warm, grounded friend. The user is sharing how they feel. Rules: 1) Reply like a caring person, not a search engine: 3 to 6 short sentences, no bullet points, no headings, no citations, no source mentions. 2) Start by acknowledging what they said in your own words, without repeating it back mechanically. 3) Offer one or two small, realistic things that could help today, or simply ask one gentle open question about what is weighing on them. 4) No toxic positivity, no lectures, no diagnosing. 5) If they mention hopelessness or not wanting to live, respond with care and suggest talking to someone they trust or a crisis line (Tele-MANAS 14416 in India, 112 in an emergency). 6) Reply in the language the user wrote in.'
      const _ss = await groq.chat.completions.create({
        model: ANSWER_MODEL,
        messages: [{ role: 'system', content: _SUP + '\n' + (__tone.instruction || '') }, ...((getHistory(sessionId) || []).slice(-6)), { role: 'user', content: message }],
        temperature: 0.6,
        max_completion_tokens: 700,
        reasoning_effort: 'low',
        stream: true
      })
      let _sr = ''
      for await (const chunk of _ss) {
        const d = chunk.choices?.[0]?.delta?.content
        if (d) { _sr += d; send('token', { text: d }) }
      }
      if (!_sr.trim()) { _sr = "That sounds heavy, and I'm glad you said it. What's weighing on you the most right now?"; send('token', { text: _sr }) }
      appendHistory(sessionId, 'user', message)
      appendHistory(sessionId, 'assistant', _sr)
      await saveChatTurn(sessionId, message, _sr, [], [])
      send('followups', { followUps: [] })
      send('done', {})
      return res.end()
    }
    if (isChitChat(message) && !/\b(ats|resume|cv)\b/i.test(message)) {
      send('thinking', { text: 'Replying' })
      send('sources', { sources: [] })
      send('images', { images: [] })

      const chitchatStream = await groq.chat.completions.create({
        model: FOLLOWUP_MODEL,
        messages: [
          { role: 'system', content: CHITCHAT_SYSTEM_PROMPT + (typeof __tone !== 'undefined' && __tone && __tone.instruction ? '\n' + __tone.instruction : '') },
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
      await saveChatTurn(sessionId, message, chitchatReply, [], [])

      send('followups', { followUps: [] })
      send('done', {})
      return res.end()
    }

    if (isCasualKnowledgeCheck(message) && !/\b(ats|resume|cv)\b/i.test(message)) {
      send('thinking', { text: 'Thinking about it' })

      const { sources, images } = ((CODE_TASK_RE.test(message) || skipSearch(message)) ? { sources: [], images: [] } : await runSearch(message, 'balanced'))
      send('sources', { sources })
      send('images', { images: shouldShowImages(message) ? images : [] })

      // JOBS-ENGINE
      try {
        const _resume = getAttachments(sessionId).map(a => a.textContent || a.extractedText || '').join('\n')
        if (await handleJobRequest({ message, sessionId, send, resumeText: _resume })) { clearAttachments(sessionId); send('done', {}); return res.end() }
      } catch (e) { console.error('[jobs] engine failed:', e.message) }
      const sourcesContext = buildSourcesContext(sources)
      const casualMessages = [
        { role: 'system', content: WIDGET_PROMPT + '\n' + CASUAL_KNOWLEDGE_SYSTEM_PROMPT + '\n' + ANSWER_FIRST_PROMPT + (typeof __tone !== 'undefined' && __tone && __tone.instruction ? '\n' + __tone.instruction : '') },
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
      await saveChatTurn(sessionId, message, casualContent, sources, images)

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
Translate the FULL content â€” all sections, not just the first one. Do not summarize or truncate. Match the length and structure of the original answer.
Preserve the original structure exactly: if the original answer used bullet points or section headers, keep the same structure in ${targetLanguage} too â€” don't collapse them into a single paragraph.
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
      await saveChatTurn(sessionId, message, langContent, [], [])

      send('followups', { followUps: [] })
      send('done', {})
      return res.end()
    }

    // ---- Connector tool-calling (Slack, Notion, GitHub) ------------------
    if (isConnectorQuery(message)) {
      send('thinking', { text: 'Checking your connected apps' })
      send('sources', { sources: [] })
      send('images', { images: [] })

      try {
        const userId = resolveUserId(req)

        const toolMessages = [
          { role: 'system', content: 'You can call tools to interact with the user\'s connected Slack, Notion, and GitHub accounts. Use a tool when the user asks you to fetch or act on data from one of these.' },
          ...getHistory(sessionId),
          { role: 'user', content: message },
        ]

        // First pass: non-streaming, so we can see if Groq wants to call a tool
        const firstPass = await groq.chat.completions.create({
          model: ANSWER_MODEL,
          messages: toolMessages,
          tools: groqToolDefinitions,
          tool_choice: 'auto',
          temperature: 0.3,
        })

        const choice = firstPass.choices[0]
        let finalMessages = toolMessages

        if (choice.finish_reason === 'tool_calls' && choice.message.tool_calls?.length) {
          send('thinking', { text: 'Running the action' })
          finalMessages = [
            ...toolMessages,
            choice.message,
            ...(await executeOpenAIToolCalls(userId, choice.message.tool_calls)),
          ]
        }

        send('thinking', { text: 'Writing the answer' })
        const finalStream = await groq.chat.completions.create({
          model: ANSWER_MODEL,
          messages: finalMessages,
          temperature: 0.4,
          stream: true,
        })

        let connectorContent = ''
        for await (const chunk of finalStream) {
          const delta = chunk.choices?.[0]?.delta?.content
          if (delta) {
            connectorContent += delta
            send('token', { text: delta })
          }
        }

        appendHistory(sessionId, 'user', message)
        appendHistory(sessionId, 'assistant', connectorContent)
      await saveChatTurn(sessionId, message, connectorContent, [], [])

        send('followups', { followUps: [] })
        send('done', {})
        return res.end()
      } catch (connectorError) {
        console.error('Connector error:', connectorError)
        send('token', { text: 'Something went wrong reaching that app: ' + connectorError.message })
        send('done', {})
        return res.end()
      }
    }
    // ------------------------------------------------------------------------

    /* ENGINE-HOOK2 */ try { const _rs = (getAttachments(sessionId) || []).map(a => a.textContent || a.extractedText || '').join('\n'); if (await handleJobRequest({ message, sessionId, send, resumeText: _rs })) { send('followups', { followUps: [] }); send('done', {}); return res.end() } } catch (e) { console.error('[jobs] engine failed:', e.message) }
    /* IMG-HOOK */ try { if (await handleImageRequest({ message, send })) { send('followups', { followUps: [] }); send('done', {}); return res.end() } } catch (e) { console.error('[img] failed:', e.message) }
    send('thinking', { text: 'Understanding your question' })
    const hasImageUpload = getAttachments(sessionId).length > 0
    const attachMeta = (getAttachments(sessionId) || []).map((a) => ({ id: a.id, name: a.name || a.originalname || a.filename || 'file', type: a.type || a.mimetype || a.mimeType || '', mimeType: a.mimetype || a.mimeType || a.type || '' }))
    if (wantsJobs(message) || /\b(jobs?|roles?|openings?|vacanc\w+)\b/i.test(message) && /\bapply\b|\blinks?\b|\bmatching\b/i.test(message)) {
      try {
        console.log('[jobs] building report for:', message)
        send('thinking', { text: 'Reading your request' }); send('thinking', { text: 'Checking Greenhouse and Lever career pages' })
        const report = await buildJobsReport(message, { base: req.protocol + '://' + req.get('host'), resumeText: ((getAttachments(sessionId) || []).find((a) => a.extractedText) || {}).extractedText || '' })
        console.log('[jobs] rows:', report.rows.length); send('thinking', { text: 'Found ' + report.rows.length + ' open roles, building your report' })
        if (report.rows.length) {
          const jobsText = friendlyText(report)
          send('report', { report })
          for (const part of (jobsText.match(/[\s\S]{1,4}/g) || [])) { send('token', { text: part }); await new Promise((r) => setTimeout(r, 9)) }
          try { appendHistory(sessionId, 'user', message); appendHistory(sessionId, 'assistant', jobsText); await saveChatTurn(sessionId, message, jobsText, [], [], { user: (getAttachments(sessionId) || []).length ? { attachments: getAttachments(sessionId).map((a) => ({ id: a.id, name: a.name || a.originalname || a.filename || 'file', type: a.type || a.mimetype || a.mimeType || '', mimeType: a.mimetype || a.mimeType || a.type || '' })) } : null, assistant: { report } }) } catch (se) { console.log('[jobs] save', se.message) }
          send('followups', { followUps: [] })
          send('done', {})
          return res.end()
        }
      } catch (e) { console.log('[jobs] ERROR', e.stack || e.message) }
    }
    send('thinking', { text: hasImageUpload ? 'Reading your file' : ((skipSearch(message) || CODE_TASK_RE.test(message)) ? 'Thinking it through' : 'Searching ' + shortTopic(resolveSearchQuery(message, sessionId))) })

    const searchQuery = resolveSearchQuery(message, sessionId)
    const { sources, images } = ((CODE_TASK_RE.test(message) || hasImageUpload || skipSearch(message)) ? { sources: [], images: [] } : await runSearch(searchQuery, 'balanced'))

    console.log(`ðŸ–¼ï¸ Images from runSearch: ${images?.length || 0}`)

    send('sources', { sources })
    send('images', { images: shouldShowImages(message) ? images : [] })
    const clockList = hasImageUpload ? [] : detectClocks(message)
    console.log('[clocks]', clockList.length)
    if (clockList.length) send('clocks', { clocks: clockList })
    if (!hasImageUpload && wantsVideos(message)) {
      const videos = await searchVideos(searchQuery, 4); res.locals.savedVideos = videos
      if (videos.length) send('videos', { videos })
    }

    // NEW: job-links feature â€” only fires for job-intent queries
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
        console.warn('âš ï¸ Map lookup failed, continuing without map:', mapError.message)
      }
    }

    if (!groq) {
      send('token', { text: 'âš ï¸ No Groq API key â€“ please set GROQ_API_KEY in .env' })
      send('done', {})
      return res.end()
    }

    const sourcesContext = buildSourcesContext(sources)
    const promptMessages = [
      { role: 'system', content: WIDGET_PROMPT + '\n' + SYSTEM_PROMPT + '\n' + ANSWER_FIRST_PROMPT + (typeof __tone !== 'undefined' && __tone && __tone.instruction ? '\n' + __tone.instruction : '') },
    ]
    if (sourcesContext) promptMessages.push({ role: 'system', content: sourcesContext })
    if (!hasImageUpload && wantsVideos(message)) promptMessages.push({ role: 'system', content: 'Video cards with real, working videos are shown automatically below your answer. Do NOT write any video titles, YouTube links or URLs, and never invent them. Write only a short 1-2 sentence helpful intro about the topic or channel, and mention that the videos are below.' })
    if (/\b(write|compose|make|give)\b[\s\S]*\b(poem|poetry|haiku|sonnet|verse|lyrics)\b/i.test(String(message))) promptMessages.push({ role: 'system', content: 'POEM FORMAT (follow exactly): Line 1 is the poem title in bold, like **Title**. Then a blank line. Then the poem in stanzas of 4 short lines (6 to 9 words per line) with a simple rhyme (ABAB or AABB). Put EVERY line of the poem on its own line, and end each line except the last of its stanza with two spaces so the line break is kept. Leave one blank line between stanzas. Start each line with a capital letter. Use 3 to 4 stanzas unless the user asks for a different length or form (haiku = 3 lines of 5/7/5 syllables). After the last stanza leave a blank line and add one short italic line offering another style or language. No sources, no citations, no explanation before or after the poem. If the user wrote in another language, write the poem in that language.' })
promptMessages.push(...getHistory(sessionId))
    const MATH_RE = /\b(solve|prove|find (the )?(minimum|maximum|value|all|smallest|largest)|integral|derivative|equation|inequality|probability|limit of|sum of|number theory|matrix|determinant|polynomial|modulo|divisor)\b/i // MATH-FORMAT
if (MATH_RE.test(message)) promptMessages.push({ role: 'system', content: "MATH FORMAT (follow exactly, like a textbook solution). LAYOUT RULE: leave one blank line between steps and one blank line before and after every \\[ \\] equation, never run steps together in one paragraph:\nLine 1: \"We need to ...\" restating the problem, with the key equation on its own line.\nThen for each step: a bold line \"**Step N: short title**\", then 1-2 short sentences, then the equation on its own line.\nUse \\( ... \\) for inline math and \\[ ... \\] for every important equation on its own line. Never put math in backticks or code blocks. Never use \\begin{align}; use \\begin{aligned} inside \\[ \\].\nAlways end with a line \"**Answer:**\" followed by the final result in \\[ \\boxed{...} \\]. Never leave the answer empty. Check the result with a small example before answering." })
if (MATH_RE.test(message) || (/\d/.test(message) && /\b(simplify|factor|expand|calculate|evaluate|differentiate|integrate|percent of)\b|[a-z0-9)]\^\d/i.test(message))) promptMessages.push({ role: 'system', content: 'MATHWORK OVERRIDE (this replaces the step headings of the MATH FORMAT above): Answer like a person working it out on paper. Reply in this exact order. 1) One short sentence saying what we are solving. 2) A fenced code block with language mathwork. Inside it, the FIRST line starts with Q: and restates the problem. Every following line is one move of the working in the form: equation | short side note. The equation is plain LaTeX without dollar signs or backslash brackets, for example x^2 - 5x + 6 = 0 or \\frac{a}{b} or \\sqrt{x}. The side note is 2 to 8 words in plain words saying what you did, for example factor it, move 6 to the other side, divide both sides by 2. One move per line, never skip a step, 4 to 12 lines. The LAST line starts with ANS: followed by the final result. For problems with no equation (word problems, counting, probability) use short plain phrases or numbers on the left. 3) After the block, 2 to 4 short sentences starting with Why this works, in plain words, plus a quick check by substituting the answer when useful. Never put the working outside the code block. Never use backslash brackets or dollar signs anywhere.' })
    promptMessages.push({ role: 'user', content: message })

    const attachments = getAttachments(sessionId)
    attachments.forEach(a => { if (!a.textContent) a.textContent = a.extractedText || a.text || '' }) // ATT-NORMALIZE
    console.log('ATTACH DEBUG session:', sessionId, 'count:', attachments.length, attachments.map(a => a.type + ':' + (a.mimetype || '') + ':' + (a.textContent ? 'hasText' : 'noText')).join(', '))
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

    const ATS_RE = /\b(ats|resume score|rate (my|this) (resume|cv)|review (my|this) (resume|cv)|resume (check|review))\b/i
    console.log('[ats] check', ATS_RE.test(message), 'files', attachments.length, 'withText', textAttachments.length, 'chars', textAttachments.reduce((n, a) => n + String(a.textContent || '').length, 0))
if (ATS_RE.test(message) && textAttachments.length > 0) {
      try {
        const rt = textAttachments.map((a) => a.textContent || a.extractedText || a.text || a.content || '').join('\n') || (typeof attachmentContext === 'string' ? attachmentContext : '')
        const jd = message.length > 300 ? message : ''
        const r = scoreResume(rt, jd)
        console.log('[ats] score', r.score, 'words', r.stats.words)
        try { res.locals.atsFence = buildAtsBlock(r, rt, jd) } catch (e) { console.error('[ats] widget build failed:', e.message) }
        const cats = r.categories.map((c) => c.name + ': ' + c.score + '/' + c.max).join('; ')
        const iss = r.issues.slice(0, 8).map((x) => '[' + x.severity + '] ' + x.message + ' -> Fix: ' + x.fix).join('\n')
        const kw = r.keywords ? 'Matched keywords: ' + r.keywords.matched.join(', ') + '\nMissing keywords: ' + r.keywords.missing.join(', ') : r.note
        res.locals.atsText = 'VERIFIED ATS RESULT, computed by code from the resume text. Use these exact numbers. Never estimate or change a score.\nOverall: ' + r.score + '/100 (' + r.grade + ')\nBreakdown: ' + cats + '\nIssues found:\n' + iss + '\n' + kw + '\nThe format instructions follow. Where they ask for scores, use the verified numbers above, and use the verified issues as the top fixes. '
      } catch (e) { console.error('[ats] scorer failed:', e.message) }
      promptMessages.push({ role: 'system', content: (res.locals.atsText || '') + 'The user wants an ATS review of the attached resume. Reply in this exact structure: 1) One short intro sentence. 2) Then this block, copied character for character with no changes and no extra text inside it: ' + (res.locals.atsFence || '') + ' 3) "What is strong" as 3 short bullets. 4) "What is holding the score back" as the top fixes, numbered, each specific and tied to the verified issues above. 5) One closing line telling the user to pick their target role in the Role fit tab of the card. If no job description was given, score against the role the resume targets and say so in one line. Be honest and strict, never inflate the score.' })
    }
    clearAttachments(sessionId)

    if (CODE_TASK_RE.test(message)) { promptMessages.unshift({ role: 'system', content: 'For coding requests, always give the complete working solution in a fenced code block first, then a short explanation. Never answer a coding request with search results or links. EXCEPTION: when asked to build a website, landing page, web app or game, output one complete page in a fenced block with language website (not html) and follow the WEBSITES rules.' }) }
  if (!hasImageUpload && wantsVideos(message)) promptMessages.push({ role: 'system', content: 'FINAL RULE: real video cards are shown automatically under your reply. Do not list any videos. Do not write video titles, quotation-marked names, YouTube links or URLs. Reply with 1-2 short sentences about the topic and say the videos are below.' })
  if (!hasImageUpload && wantsVideos(message)) promptMessages.push({ role: 'system', content: 'FINAL RULE: real video cards are shown automatically under your reply. Do not list any videos. Do not write video titles, quotation-marked names, YouTube links or URLs. Reply with 1-2 short sentences about the topic and say the videos are below.' })
  if (WEBSITE_RE.test(message) && !/resume|cv|attached|upload/i.test(String(message))) {
    promptMessages.splice(0, promptMessages.length, { role: 'system', content: (HOUSE_RE.test(String(message)) ? HOUSE_SLIM : WEBSITE_SLIM) }, { role: 'user', content: String(message) })
  }
  const _deep = isHardQuestion(message) && !WEBSITE_RE.test(message) && !CODE_TASK_RE.test(message)
  if (_deep && !MATH_RE.test(message)) promptMessages.push({ role: 'system', content: DEEP_THINK_PROMPT })
  const reasoningEffort = (WEBSITE_RE.test(message) ? 'low' : CODE_TASK_RE.test(message) ? 'high' : (_deep ? 'high' : pickReasoningEffort(message)))
    const desiredMaxTokens = (WEBSITE_RE.test(message) ? 14000 : CODE_TASK_RE.test(message) ? 8192 : pickMaxTokens(message))
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

    console.log(`âœ… Stream finished: ${chunkCount} chunks, ${fullContent.length} chars, ${fullReasoning.length} reasoning chars, effort=${reasoningEffort}, maxTokens=${maxTokens} (desired ${desiredMaxTokens}), sourcesGivenToModel=${sources.filter(s => s.domain).length}, model=${modelToUse}`)
    try {
      if (sessionId && sessionId !== 'voice') {
        const userRow = { session_id: sessionId, role: 'user', content: message }
        if (attachMeta.length) userRow.meta = { attachments: attachMeta }
        const asstRow = { session_id: sessionId, role: 'assistant', content: fullContent, sources: sources || [], images: (shouldShowImages(message) ? images : []) || [], ...(((res.locals.savedVideos || []).length) ? { meta: { videos: res.locals.savedVideos } } : {}) }
        let saveRes = await supabase.from('messages').insert([userRow, asstRow])
        if (saveRes.error && userRow.meta) { delete userRow.meta; saveRes = await supabase.from('messages').insert([userRow, asstRow]) }
        if (saveRes.error) console.error('save messages failed:', saveRes.error.message)
      }
    } catch (e) { console.error('save messages error:', e.message) }

    if (fullContent.trim().length === 0) {
      console.warn('âš ï¸ Empty response â€“ using fallback')
      send('token', { text: 'I could not generate a response. Please try again.' })
    }

    appendHistory(sessionId, 'user', message)
    appendHistory(sessionId, 'assistant', fullContent)

    const followUps = await generateFollowUps(message, fullContent)
    ;(async () => {
      try {
        if (sessionId && sessionId !== 'voice') {
          const { data: last } = await supabase.from('messages').select('id, meta').eq('session_id', sessionId).eq('role', 'assistant').order('created_at', { ascending: false }).limit(1)
          if (last && last[0]) await supabase.from('messages').update({ meta: { ...(last[0].meta || {}), followUps } }).eq('id', last[0].id)
        }
      } catch (e) { console.error('save followups failed:', e.message) }
    })()
    ;(async () => {
      try {
        if (sessionId && sessionId !== 'voice') {
          const { data: last } = await supabase.from('messages').select('id, meta').eq('session_id', sessionId).eq('role', 'assistant').order('created_at', { ascending: false }).limit(1)
          if (last && last[0]) await supabase.from('messages').update({ meta: { ...(last[0].meta || {}), followUps } }).eq('id', last[0].id)
        }
      } catch (e) { console.error('save followups failed:', e.message) }
    })()
    send('followups', { followUps })
    send('done', {})
    res.end()

  } catch (error) {
    console.error('ðŸ”¥ ERROR:', error)
    console.error('ðŸ“„ Full error:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2))
    send('error', { message: 'Internal error: ' + error.message })
    res.end()
  }
})

app.use('/api/games', gamesRouter)
app.listen(PORT, () => {
  console.log(`âœ… Stoic backend running on http://localhost:${PORT}`)
  console.log(`ðŸ”‘ API key present: ${!!process.env.GROQ_API_KEY}`)
  console.log(`ðŸ§  Answer model: ${ANSWER_MODEL} | Follow-up model: ${FOLLOWUP_MODEL} | Vision model: ${VISION_MODEL}`)
setInterval(() => {}, 1000 * 60 * 60)
})








function shortTopic(q = '') {
  const stop = new Set(['no','iam','im','i','am','is','are','was','the','a','an','of','in','on','at','to','for','and','or','but','that','this','they','them','tell','me','my','us','we','you','your','please','pls','can','could','would','what','who','whom','which','where','when','why','how','give','show','find','about','while','ask','asked','do','does','did','it','its','with','from','by','as','so','then','than','be','been','just','like']);
  const words = String(q).replace(/[^\p{L}\p{N}\s'-]/gu, ' ').split(/\s+/).filter(Boolean);
  const keep = words.filter((w) => !stop.has(w.toLowerCase()));
  const out = (keep.length ? keep : words).slice(0, 4).join(' ');
  return out.length > 32 ? out.slice(0, 32).trim() + '…' : out;
}