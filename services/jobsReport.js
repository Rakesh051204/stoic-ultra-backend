import { randomUUID } from 'crypto'
import { searchJobs } from './jobsService.js'

const GH = { anthropic: 'Anthropic', databricks: 'Databricks', stripe: 'Stripe', cloudflare: 'Cloudflare', datadog: 'Datadog', figma: 'Figma', mongodb: 'MongoDB', elastic: 'Elastic', gitlab: 'GitLab', asana: 'Asana', discord: 'Discord', reddit: 'Reddit', pinterest: 'Pinterest', airbnb: 'Airbnb', coinbase: 'Coinbase', twilio: 'Twilio', instacart: 'Instacart', robinhood: 'Robinhood', celonis: 'Celonis', getyourguide: 'GetYourGuide', contentful: 'Contentful', taxfix: 'Taxfix', mollie: 'Mollie' }
const LV = { palantir: 'Palantir', plaid: 'Plaid', mistral: 'Mistral AI', whoop: 'WHOOP' }

const PLACES = {
  finland: /finland|helsinki|espoo|tampere|oulu/i,
  germany: /germany|berlin|munich|hamburg|frankfurt|cologne/i,
  uk: /united kingdom|\buk\b|london|england|scotland|manchester|edinburgh/i,
  usa: /united states|\busa\b|\bus\b|new york|san francisco|seattle|austin|boston|california/i,
  canada: /canada|toronto|vancouver|montreal/i,
  singapore: /singapore/i,
  australia: /australia|sydney|melbourne/i,
  netherlands: /netherlands|amsterdam|rotterdam/i,
  ireland: /ireland|dublin/i,
  france: /france|paris/i,
  sweden: /sweden|stockholm/i,
  switzerland: /switzerland|zurich/i,
  uae: /uae|dubai|emirates/i,
  europe: /europe|emea|germany|netherlands|ireland|france|sweden|finland|spain|poland|portugal|london|berlin|amsterdam|dublin|paris/i,
}
const ALIAS = { usa: /\b(usa|us|america|united states)\b/i, uk: /\b(uk|britain|united kingdom|england)\b/i }
const INDIA = /india|bengaluru|bangalore|hyderabad|mumbai|chennai|pune|delhi|gurgaon|gurugram|noida|kolkata/i
const SENIOR = /\b(senior|sr\.?|staff|principal|lead|director|head|vp|manager|architect)\b/i
const NON_ENG = /\b(account|sales|recruit\w*|marketing|counsel|legal|attorney|paralegal|accountant|customer success|partnerships?|business development|talent|coordinator|executive|compliance|technical writer|communications|procurement|payroll|designer)\b/i
const ROLE_RE = /(machine learning|ml engineer|ai engineer|generative ai|llm|data scien\w+|data analyst|data engineer|python|backend|frontend|full[- ]?stack|devops|software|java|react|node)/i
const JOB_RE = /\b(jobs?|vacanc(?:y|ies)|openings?|hiring|apply links?|job links?)\b/i
const NOT_JOB_RE = /\b(job descriptions?|ats|rate my resume|(cron|background|batch|spark|jenkins|scheduled|print) jobs?)\b/i

export const wantsJobs = (m = '') => JOB_RE.test(m) && !NOT_JOB_RE.test(m)

const getJson = (url) => fetch(url, { signal: AbortSignal.timeout(25000) }).then((r) => { if (!r.ok) throw new Error(r.status); return r.json() })

const SKILLS = ['python', 'fastapi', 'flask', 'django', 'rag', 'llm', 'langchain', 'llamaindex', 'pytorch', 'tensorflow', 'scikit-learn', 'pandas', 'numpy', 'sql', 'postgresql', 'postgres', 'pgvector', 'supabase', 'docker', 'kubernetes', 'aws', 'gcp', 'azure', 'react', 'node', 'typescript', 'javascript', 'nlp', 'transformers', 'embeddings', 'openai', 'groq', 'vector', 'machine learning', 'deep learning', 'data science', 'mlops', 'rest']
function skillsFrom(text = '') {
  const t = String(text).toLowerCase()
  return SKILLS.filter((s) => new RegExp('(^|[^a-z])' + s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-z]|$)').test(t))
}
async function remotive(role) {
  const j = await getJson('https://remotive.com/api/remote-jobs?limit=100&search=' + encodeURIComponent(role))
  return (j.jobs || []).map((x) => ({ company: x.company_name, title: x.title, location: x.candidate_required_location || 'Remote', posted: (x.publication_date || '').slice(0, 10), url: x.url, source: 'Remotive', tags: (x.tags || []).join(' ') }))
}
async function arbeitnow() {
  const j = await getJson('https://www.arbeitnow.com/api/job-board-api')
  return (j.data || []).map((x) => ({ company: x.company_name, title: x.title, location: x.location || (x.remote ? 'Remote' : ''), posted: x.created_at ? new Date(x.created_at * 1000).toISOString().slice(0, 10) : '', url: x.url, source: 'Arbeitnow', tags: (x.tags || []).join(' ') + ' ' + String(x.description || '').replace(/<[^>]+>/g, ' ').slice(0, 600) }))
}
async function remoteok() {
  const j = await getJson('https://remoteok.com/api')
  return (Array.isArray(j) ? j : []).filter((x) => x && x.position).map((x) => ({ company: x.company, title: x.position, location: x.location || 'Remote', posted: (x.date || '').slice(0, 10), url: x.apply_url || x.url, source: 'RemoteOK', tags: (x.tags || []).join(' ') }))
}
async function greenhouse(slug, name) {
  const j = await getJson('https://boards-api.greenhouse.io/v1/boards/' + slug + '/jobs')
  return (j.jobs || []).map((x) => ({ company: name, title: x.title, location: (x.location && x.location.name) || '', posted: (x.updated_at || '').slice(0, 10), url: x.absolute_url, source: 'Greenhouse' }))
}
async function lever(slug, name) {
  const j = await getJson('https://api.lever.co/v0/postings/' + slug + '?mode=json')
  return (Array.isArray(j) ? j : []).map((x) => ({ company: name, title: x.text, location: (x.categories && x.categories.location) || '', posted: x.createdAt ? new Date(x.createdAt).toISOString().slice(0, 10) : '', url: x.hostedUrl, source: 'Lever' }))
}

function parse(message) {
  const m = String(message)
  const abroad = /\b(abroad|overseas|outside india|international|foreign|relocat\w*)\b/i.test(m)
  const places = Object.keys(PLACES).filter((k) => (ALIAS[k] || new RegExp('\\b' + k + '\\b', 'i')).test(m))
  const hit = m.match(ROLE_RE)
  const cm = m.match(/\b(\d{2,3})\s*\+?\s*(?:[a-z\/+-]+\s+){0,3}?(?:jobs?|roles?|openings?|links?|vacanc\w+|positions?|compan\w+)\b/i); const count = cm ? Math.min(150, Math.max(5, +cm[1])) : 30; return { abroad: abroad || places.length > 0, places, role: hit ? hit[0].toLowerCase() : 'ai engineer', count, cap: count > 30 ? Math.max(8, Math.ceil(count / 6)) : 4 }
}

function titleOk(role, title) {
  if (SENIOR.test(title) || NON_ENG.test(title)) return false
  if (/\b(ai|ml|llm|machine learning|generative|data scien\w*)\b/.test(role)) {
    return /\b(ai|ml|llm|genai|machine learning|generative|data scien\w*|applied scien\w*|nlp|deep learning)\b/i.test(title)
  }
  return role.split(/[\s-]+/).filter((w) => w.length > 2).every((w) => title.toLowerCase().includes(w))
}

const store = new Map()
export const getReport = (id) => store.get(id)

export async function buildJobsReport(message, { base = '', resumeText = '' } = {}) {
  const q = parse(message)
  const jobs = [...Object.entries(GH).map(([s, n]) => () => greenhouse(s, n)), ...Object.entries(LV).map(([s, n]) => () => lever(s, n))]
  const res = []
  for (let i = 0; i < jobs.length; i += 9) res.push(...(await Promise.allSettled(jobs.slice(i, i + 9).map((f) => f().catch(() => f())))))
  console.log('[jobs] boards ok: ' + res.filter((r) => r.status === 'fulfilled').length + '/' + res.length)
  res.filter((r) => r.status === 'rejected').slice(0, 3).forEach((r) => console.log('[jobs] fail:', (r.reason && r.reason.cause && r.reason.cause.code) || (r.reason && (r.reason.name + ' ' + r.reason.message))))
  const placeRx = q.places.map((p) => PLACES[p])
  const locOk = (loc = '') => {
    if (!q.abroad) return true
    if (INDIA.test(loc)) return false
    return placeRx.length ? placeRx.some((rx) => rx.test(loc)) : true
  }
  let rows = res.flatMap((r) => (r.status === 'fulfilled' ? r.value : [])).filter((x) => x.url && titleOk(q.role, x.title) && locOk(x.location))
  const direct = rows.length
  const extra = await Promise.allSettled([remotive(q.role), arbeitnow(), remoteok()])
  console.log('[jobs] extra boards ok: ' + extra.filter((r) => r.status === 'fulfilled').length + '/3')
  rows = rows.concat(extra.flatMap((r) => (r.status === 'fulfilled' ? r.value : [])).filter((x) => x.url && titleOk(q.role, x.title) && locOk(x.location)))
  const mySkills = skillsFrom(resumeText)
  const score = (x) => {
    const hay = (x.title + ' ' + (x.tags || '')).toLowerCase()
    const hits = mySkills.filter((s) => hay.includes(s)).length
    const junior = /\b(junior|graduate|entry|intern|associate|fresher|trainee|early career)\b/i.test(x.title) ? 12 : 0
    const days = x.posted ? Math.max(0, (Date.now() - new Date(x.posted).getTime()) / 864e5) : 60
    const fresh = days <= 7 ? 15 : days <= 30 ? 8 : 0
    return { ...x, match: mySkills.length ? Math.min(98, 40 + Math.min(30, hits * 10) + junior + fresh) : null }
  }
  if (rows.length < Math.min(q.count, 40)) {
    try {
      const more = (await searchJobs(q.role, Math.min(50, Math.max(15, q.count))))
        .filter((x) => titleOk(q.role, x.title) && locOk(x.location))
        .map((x) => ({ company: x.company, title: x.title, location: x.location, posted: (x.posted || '').slice(0, 10), url: x.url, source: x.source + ' (job board)' }))
      rows = rows.concat(more)
    } catch {}
  }
  const seen = new Set()
  rows = rows.filter((x) => !seen.has(x.url) && seen.add(x.url)).map(score).sort((a, b) => ((b.match || 0) - (a.match || 0)) || (b.posted || '').localeCompare(a.posted || '')).filter(((c) => (x) => (c[x.company] = (c[x.company] || 0) + 1) <= q.cap)({})).slice(0, q.count).map(({ tags, ...x }, i) => ({ n: i + 1, ...x }))

  const roleTitle = q.role.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\b(Ai|Ml|Llm)\b/g, (s) => s.toUpperCase())
  const id = randomUUID().slice(0, 8)
  const report = {
    id,
    title: 'Recent ' + roleTitle + ' Job Openings' + (q.places.length ? ' in ' + q.places.map((p) => p.toUpperCase()).join(', ') : q.abroad ? ' Abroad' : ''),
    checkedAt: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
    summary: 'Found ' + rows.length + ' recent openings matching "' + q.role + '"' + (q.abroad ? ' outside India' : '') + ' (senior and management roles are removed). ' + Math.min(direct, rows.length) + ' links go straight to the employer\'s own application page (Greenhouse or Lever). Any others come from job boards.',
    note: 'This is a shortlist, not a guarantee of eligibility. Postings can close at any time. Check visa, relocation, language and work-authorization requirements before applying.',
    rows,
    files: { docx: base + '/api/jobs/file/' + id + '.docx', pdf: base + '/api/jobs/file/' + id + '.pdf', xlsx: base + '/api/jobs/file/' + id + '.xlsx' },
  }
  store.set(id, report)
  if (store.size > 50) store.delete(store.keys().next().value)
  return report
}
export function friendlyText(r) {
  const n = r.rows.length
  const companies = [...new Set(r.rows.map((x) => x.company))]
  const direct = r.rows.filter((x) => /^(Greenhouse|Lever)$/.test(x.source)).length
  return 'Done! I checked company career pages and found **' + n + ' open roles** for you: **' + r.title + '**.\n\n' +
    '**What I found**\n' +
    '- ' + n + ' roles from ' + companies.length + ' companies, including ' + companies.slice(0, 6).join(', ') + '\n' +
    '- ' + direct + ' links go straight to the company\'s own application page\n' +
    '- Senior, manager, sales and recruiting roles are filtered out\n' + (r.rows.some((x) => x.match != null) ? '- Sorted by how well each role fits your resume skills and how recent it is\n' : '') + '\n' +
    '**How to use it**\n' +
    'Click the report card to open the full list on the right side. Every role title is a direct Apply link. You can also download it as Word, PDF or Excel with the buttons on the card.\n\n' +
    '**Before you apply:** check visa, relocation and work-authorization rules for each job. Postings can close at any time, so start with the newest ones.\n\n' +
    'Want me to narrow this to fresher roles, one country, or more than ' + n + ' jobs? Just tell me.'
}