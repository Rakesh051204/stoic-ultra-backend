// stoic-ultra-backend/services/atsWidget.js
// Turns the real scorer result + extra code checks into one compact ```widget block.
const FENCE = '`'.repeat(3)
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
const has = (text, term) => new RegExp('(^|[^a-z0-9])' + esc(term) + '($|[^a-z0-9])', 'i').test(text)
const cut = (s, n) => { s = String(s ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '\u2026' : s }

export function sigOf(score, cats) {
  let h = 5381
  const s = `${score}|${cats.map((c) => c[1]).join(',')}`
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return h.toString(36)
}

const ROLES = [
  ['GenAI / LLM Engineer', ['llm', 'rag', 'prompt engineering', 'embeddings', 'vector', 'semantic search', 'langchain', 'fine-tuning', 'openai', 'groq', 'anthropic', 'structured outputs', 'evaluation', 'agents', 'tool calling', 'hugging face', 'transformers']],
  ['ML / AI Engineer', ['machine learning', 'scikit-learn', 'pytorch', 'tensorflow', 'deep learning', 'nlp', 'feature engineering', 'model evaluation', 'mlops', 'regression', 'classification', 'python', 'pandas', 'numpy', 'fastapi', 'sql', 'deployment']],
  ['Data Scientist', ['python', 'sql', 'pandas', 'numpy', 'statistics', 'regression', 'hypothesis testing', 'a/b testing', 'power bi', 'tableau', 'data visualization', 'eda', 'feature engineering', 'scikit-learn', 'excel', 'machine learning', 'data cleaning', 'dashboard']],
  ['Python Backend Engineer', ['python', 'fastapi', 'flask', 'django', 'rest api', 'postgresql', 'sql', 'docker', 'redis', 'git', 'ci/cd', 'microservices', 'authentication', 'jwt', 'testing', 'aws', 'linux']],
]

const SECTIONS = [
  ['Summary', /^\s*(professional\s+)?(summary|objective|profile)\b/im],
  ['Education', /^\s*education\b/im],
  ['Experience', /^\s*(work\s+)?(experience|internship)/im],
  ['Projects', /^\s*projects?\b/im],
  ['Skills', /^\s*(technical\s+)?skills\b/im],
]
const VERBS = /^(?:[\u2022\-*\u2013]\s*)?(built|designed|developed|implemented|created|led|improved|reduced|increased|deployed|optimized|automated|evaluated|analy[sz]ed|integrated|engineered|launched|trained|migrated|added|fixed|developed|enforced|identified|replaced)\b/i

function extras(rt) {
  const strengths = [], issues = []
  const words = (rt.match(/\S+/g) || []).length
  const bare = rt.replace(/https?:\/\/\S+/g, ' ').replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, ' ').replace(/\+?\d[\d\s().-]{8,}\d/g, ' ').replace(/\b(19|20)\d{2}\b/g, ' ')
  const metrics = (bare.match(/\b\d[\d,]*(?:\.\d+)?\s?(?:%|\+|k\b|x\b|ms\b)?/g) || []).filter((m) => /\d/.test(m)).length
  const lines = rt.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const bullets = lines.filter((l) => /^[\u2022\-*\u2013]/.test(l))
  const verbLines = lines.filter((l) => VERBS.test(l)).length
  const email = /[\w.+-]+@[\w-]+\.[\w.-]+/.test(rt), phone = /\+?\d[\d\s().-]{8,}\d/.test(rt)
  const links = /linkedin\.com|github\.com/i.test(rt)
  const missing = SECTIONS.filter(([, re]) => !re.test(rt)).map(([n]) => n)

  if (email && phone) strengths.push('Contact details (email and phone) are easy to find')
  if (links) strengths.push('LinkedIn / GitHub links included')
  if (metrics >= 8) strengths.push(`${metrics} numbers and metrics found, which shows measurable impact`)
  if (verbLines >= 6) strengths.push('Bullets start with strong action verbs')
  if (!missing.length) strengths.push('All standard sections are present (summary, education, experience, projects, skills)')

  if (!email) issues.push(['high', 'No email address detected.', 'Put your email in the header as plain text.'])
  if (!phone) issues.push(['medium', 'No phone number detected.', 'Add a phone number with country code to the header.'])
  if (!links) issues.push(['low', 'No LinkedIn or GitHub link found.', 'Add both links; recruiters check them.'])
  if (missing.length) issues.push([missing.includes('Experience') || missing.includes('Skills') ? 'high' : 'medium', `Missing section heading: ${missing.join(', ')}.`, 'Use standard headings so the ATS can parse each section.'])
  if (metrics < 5) issues.push(['high', 'Very few numbers or results in your bullets.', 'Add measurable results (accuracy, users, records, time saved).'])
  if (bullets.length && verbLines < Math.min(6, bullets.length)) issues.push(['medium', 'Many bullets do not start with an action verb.', 'Start each bullet with Built, Designed, Improved, Reduced, etc.'])
  if (words < 300) issues.push(['medium', `Resume is short (${words} words).`, 'Add project and internship detail, aim for 400 to 700 words.'])
  if (words > 900) issues.push(['medium', `Resume is long (${words} words).`, 'Trim to one page: remove older or weak items.'])
  return { strengths, issues, words }
}

const sev = (s) => { const x = String(s || '').toLowerCase(); return /high|crit|error|major/.test(x) ? 'high' : /med|warn|moder/.test(x) ? 'medium' : 'low' }

export function buildAtsBlock(r, rt = '', jd = '') {
  const ex = extras(rt)
  const cats = (r.categories || []).map((c) => [cut(c.name, 28), Math.round(Number(c.score) || 0), Math.round(Number(c.max) || 0)])
  const score = Math.round(Number(r.score) || cats.reduce((s, c) => s + c[1], 0))
  const scorerIssues = (r.issues || []).map((x) => [sev(x.severity), cut(x.message, 90), cut(x.fix, 110)])
  const seen = new Set(), issues = []
  for (const it of [...scorerIssues.slice(0, 6), ...ex.issues]) {
    const k = it[1].toLowerCase().slice(0, 24)
    if (!seen.has(k) && issues.length < 7) { seen.add(k); issues.push(it) }
  }
  const order = { high: 0, medium: 1, low: 2 }
  issues.sort((a, b) => order[a[0]] - order[b[0]])

  const roles = ROLES.map(([name, bank]) => {
    const have = bank.filter((t) => has(rt, t)), miss = bank.filter((t) => !has(rt, t))
    return [name, Math.round((100 * have.length) / bank.length), have.slice(0, 6), miss.slice(0, 6)]
  })
  let kw
  if (r.keywords && Array.isArray(r.keywords.matched)) kw = { src: 'jd', m: r.keywords.matched.slice(0, 12), x: (r.keywords.missing || []).slice(0, 12) }
  else { const best = roles.reduce((a, b) => (b[1] > a[1] ? b : a)); kw = { src: 'role', m: best[2], x: best[3] } }

  const obj = { type: 'ats', score, grade: r.grade || '', words: ex.words, cats, issues, str: ex.strengths.slice(0, 5), kw, roles, sig: sigOf(score, cats) }
  return FENCE + 'widget\n' + JSON.stringify(obj) + '\n' + FENCE
}
