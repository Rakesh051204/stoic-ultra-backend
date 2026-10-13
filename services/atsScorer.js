const ACTION = new Set(['built','developed','designed','implemented','created','led','managed','improved','increased','reduced','optimized','deployed','automated','launched','analyzed','trained','engineered','delivered','integrated','migrated','architected','established','streamlined','collaborated','researched','achieved','produced','maintained','resolved','tested','refactored','scaled','mentored','presented','published','generated','evaluated','configured','wrote','processed','extracted','visualized','fine-tuned','cleaned','modeled','predicted','secured','shipped'])
const WEAK = [/responsible for/i, /worked on/i, /helped (with|to)/i, /duties include/i, /involved in/i, /assisted/i, /tasked with/i]
const SECTIONS = {
  summary: /^(professional\s+)?(summary|profile|objective|about( me)?)$/i,
  experience: /^(work\s+|professional\s+)?(experience|employment( history)?|work history|internships?)$/i,
  education: /^(education|academic( background| qualifications)?)$/i,
  skills: /^(technical\s+|key\s+|core\s+)?(skills|technologies|competencies|tech stack)( (&|and) \w+)?$/i,
  projects: /^(personal\s+|academic\s+|key\s+)?projects?$/i,
  certifications: /^(certifications?|certificates?|licenses?|courses?)$/i,
}
const STOP = new Set('a an the and or but of to in on at for with by from as is are was were be been being this that these those it its you your we our they their will would can could should may might must have has had do does did not no yes if then than so such into out up down over under about across per via etc including include includes able ability strong good great excellent plus preferred required requirements responsibilities qualifications role job candidate looking join company team work working experience years year skills skill knowledge understanding using use used new more most other any all each both well also while who what when where which how why get make one two three'.split(' '))
const tokens = (s) => (String(s).toLowerCase().match(/[a-z][a-z0-9+#.]*/g) || []).map((t) => t.replace(/\.+$/, '')).filter((t) => t.length >= 3 && !STOP.has(t))

export function scoreResume(rawText = '', jobDescription = '') {
  const text = String(rawText).replace(/\r/g, '')
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  const words = text.split(/\s+/).filter(Boolean)
  const issues = []
  const cats = []
  const flag = (severity, message, fix) => issues.push({ severity, message, fix })
  const cat = (name, weight, f) => cats.push({ name, weight, f: Math.max(0, Math.min(1, f)) })

  if (words.length < 80) flag('high', 'Almost no text could be read from this resume', 'If it is a scanned PDF or an image, export a text-based PDF or DOCX. An ATS cannot read images.')

  // 1. Contact info (10)
  const email = /[\w.+-]+@[\w-]+\.[\w.-]+/.test(text)
  const phone = /\+?\d[\d\s().-]{8,}\d/.test(text)
  const link = /linkedin\.com\/in\//i.test(text) || /github\.com\/[\w-]+/i.test(text)
  let c = 0
  if (email) c += 0.4; else flag('high', 'No email address found', 'Put a professional email at the top of the page, not in a header or image.')
  if (phone) c += 0.3; else flag('high', 'No phone number found', 'Add your phone number with country code at the top.')
  if (link) c += 0.3; else flag('low', 'No LinkedIn or GitHub link found', 'Add your LinkedIn and GitHub as plain text links.')
  cat('Contact info', 10, c)

  // 2. Sections (20)
  const found = {}
  for (const l of lines) {
    const t = l.replace(/[:\-–_|•*#]+/g, ' ').replace(/\s+/g, ' ').trim()
    if (!t || t.length > 40) continue
    for (const [k, rx] of Object.entries(SECTIONS)) if (rx.test(t)) found[k] = true
  }
  const expOrProj = found.experience || found.projects
  if (!expOrProj) flag('high', 'No Experience or Projects section heading found', 'Use a standard heading such as "Experience" or "Projects". ATS software looks for these exact names.')
  if (!found.education) flag('high', 'No Education section heading found', 'Add a heading named "Education".')
  if (!found.skills) flag('high', 'No Skills section heading found', 'Add a "Skills" section with plain text skills, grouped by type.')
  if (!found.summary) flag('low', 'No Summary section found', 'Add a 2-3 line summary with your target role and main skills.')
  cat('Standard sections', 20, ((expOrProj ? 1 : 0) + (found.education ? 1 : 0) + (found.skills ? 1 : 0)) / 3 * 0.85 + (found.summary ? 0.15 : 0))

  // 3. Length (5)
  const wc = words.length
  let lf = wc < 200 ? 0.3 : wc < 350 ? 0.7 : wc <= 800 ? 1 : wc <= 1000 ? 0.8 : 0.5
  if (wc < 350 && wc >= 80) flag('medium', 'Resume is short (' + wc + ' words)', 'Add detail to your projects and experience. Aim for 400-700 words for a one-page resume.')
  if (wc > 1000) flag('medium', 'Resume is long (' + wc + ' words)', 'Cut it to 1 page (fresher) or 2 pages (experienced).')
  cat('Length', 5, lf)

  // 4. Formatting and readability (20)
  const colLines = lines.filter((l) => /\S {4,}\S/.test(l) || /\t/.test(l)).length
  const colRatio = colLines / Math.max(1, lines.length)
  if (colRatio > 0.15) flag('high', 'Resume may use columns or tables', 'ATS often reads columns in the wrong order. Use a single-column layout with no tables.')
  const odd = (text.replace(/[•–—‘’“”●▪◦·➢➤✔►■]/g, '').match(/[^\x00-\x7F]/g) || []).length
  if (odd > 5) flag('medium', 'Icons or special symbols found (' + odd + ')', 'Remove icons, emojis and decorative symbols. Use plain text labels.')
  const longLines = lines.filter((l) => l.split(/\s+/).length > 40).length
  if (longLines > 2) flag('medium', 'Long paragraphs found', 'Split paragraphs into bullet points of 1-2 lines each.')
  const dk = new Set()
  if (/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}/i.test(text)) dk.add('January 2024')
  if (/\b(jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\.?\s+\d{4}/i.test(text)) dk.add('Jan 2024')
  if (/\b\d{1,2}\/\d{4}\b/.test(text)) dk.add('01/2024')
  if (/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/.test(text)) dk.add('01/01/2024')
  if (dk.size > 1) flag('medium', 'Mixed date formats: ' + [...dk].join(', '), 'Use one format everywhere, for example "Jan 2024 - Mar 2025".')
  if (dk.size === 0 && found.experience) flag('medium', 'No dates found in experience', 'Add start and end dates (Mon YYYY) to every role.')
  cat('Formatting and readability', 20,
    (colRatio > 0.15 ? 0.3 : 1) * 0.35 + (odd > 5 ? 0.3 : 1) * 0.25 + (longLines > 2 ? 0.4 : 1) * 0.2 + (dk.size > 1 ? 0.4 : dk.size === 0 ? 0.6 : 1) * 0.2)

  // 5. Content quality (30)
  const BUL = /^[•\-–—*▪●◦·➢➤✔►■]\s*/
  let bullets = lines.filter((l) => BUL.test(l)).map((l) => l.replace(BUL, ''))
  if (bullets.length < 3) bullets = lines.filter((l) => l.split(/\s+/).length >= 8 && !/@/.test(l))
  const nb = Math.max(1, bullets.length)
  const first = (b) => b.split(/\s+/)[0].toLowerCase().replace(/[^a-z-]/g, '')
  const actionN = bullets.filter((b) => { const w = first(b); return ACTION.has(w) || /ed$/.test(w) }).length
  const quantN = bullets.filter((b) => /\d+\s?%|\$\s?\d|\b\d{2,}\b|\b\d+x\b/i.test(b)).length
  const weakN = WEAK.reduce((n, rx) => n + (rx.test(text) ? 1 : 0), 0)
  const pron = (text.match(/\b(I|my|me)\b/g) || []).length
  const avg = bullets.reduce((s, b) => s + b.split(/\s+/).length, 0) / nb
  if (actionN / nb < 0.6) flag('medium', 'Only ' + actionN + ' of ' + bullets.length + ' bullets start with a strong action verb', 'Start each bullet with a verb like Built, Developed, Reduced, Deployed.')
  if (quantN / nb < 0.3) flag('high', 'Only ' + quantN + ' of ' + bullets.length + ' bullets include numbers', 'Add results with numbers: "Improved model accuracy from 82% to 91%", "Handled 10,000+ requests/day".')
  if (weakN > 0) flag('medium', 'Weak phrases found (like "responsible for", "worked on")', 'Replace them with a direct action verb and a result.')
  if (pron > 0) flag('low', 'First-person words found (I, my, me)', 'Remove them. Resumes use implied first person.')
  if (avg > 28) flag('low', 'Bullets are long (about ' + Math.round(avg) + ' words on average)', 'Keep bullets to 12-25 words.')
  cat('Content quality', 30, 0.35 * (actionN / nb) + 0.35 * Math.min(1, quantN / nb / 0.3) + 0.15 * (weakN === 0 ? 1 : weakN <= 2 ? 0.5 : 0.2) + 0.15 * (pron === 0 ? 1 : 0.4))

  // 6. Keyword match (15, only with a job description)
  let keywords = null
  if (String(jobDescription).trim().length > 40) {
    const freq = {}
    tokens(jobDescription).forEach((t) => { freq[t] = (freq[t] || 0) + 1 })
    const terms = Object.keys(freq).sort((a, b) => freq[b] - freq[a]).slice(0, 30)
    const have = new Set(tokens(text))
    const matched = terms.filter((t) => have.has(t))
    const missing = terms.filter((t) => !have.has(t))
    keywords = { matched, missing: missing.slice(0, 15) }
    if (missing.length / Math.max(1, terms.length) > 0.5) flag('high', 'Many job description keywords are missing from your resume', 'Add the ones that are true for you: ' + missing.slice(0, 8).join(', '))
    cat('Keyword match', 15, matched.length / Math.max(1, terms.length))
  }

  const total = cats.reduce((s, x) => s + x.weight, 0)
  const score = Math.round(cats.reduce((s, x) => s + x.f * x.weight, 0) / total * 100)
  const order = { high: 0, medium: 1, low: 2 }
  issues.sort((a, b) => order[a.severity] - order[b.severity])
  return {
    score,
    grade: score >= 85 ? 'Excellent' : score >= 70 ? 'Good' : score >= 50 ? 'Needs work' : 'Poor',
    categories: cats.map((x) => ({ name: x.name, score: Math.round(x.f * x.weight / total * 100), max: Math.round(x.weight / total * 100) })),
    issues,
    keywords,
    stats: { words: wc, bullets: bullets.length },
    note: keywords ? '' : 'Paste a job description to get an exact keyword match score.',
  }
}