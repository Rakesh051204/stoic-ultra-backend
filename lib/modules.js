const MODELS = ['qwen/qwen3.8-27b', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b']

async function llm(system, user, max = 7000) {
  let lastErr = null
  for (const model of MODELS) {
    try {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
        body: JSON.stringify({
          model, temperature: 0.7, max_tokens: max,
          messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error?.message || 'llm error')
      return j.choices?.[0]?.message?.content || ''
    } catch (e) {
      console.error('[mod] llm failed on', model, '-', e.message)
      lastErr = e
    }
  }
  throw lastErr
}

const SITE_SYS = "You are a senior web designer building a REAL, launch-ready site. Output ONLY one complete HTML document (<!DOCTYPE html> to </html>) with inline CSS and minimal inline JS. Requirements: real, specific copy written for the person or business in the request (never lorem ipsum, never placeholder names like John Doe unless none are given); sticky nav with working anchor links; hero, about, skills or services, projects or products with realistic descriptions, testimonials or stats, and a contact section with a working mailto link; modern responsive layout with a clear type scale and a tasteful color palette; smooth hover and scroll effects; accessible contrast; images replaced by inline SVG illustrations or CSS gradients (no external images); Google Fonts allowed. For portfolios use the resume content exactly and do not invent employers, degrees or links. No explanations."
const MAIL_SYS = 'You write clear, human, professional emails. Output the Subject line first (format: "Subject: ..."), then a blank line, then the body. Keep it concise. Never use placeholders like [Your Name] or [Phone Number]. End the body with "Best regards," on its own line and nothing after it. No commentary.'

const DNA_SYS = 'Return ONLY a JSON array (max 6) of scientific species names for the organisms the user mentions or implies. For generic groups like "monkeys" return 3 species: Macaca mulatta, Papio anubis, Callithrix jacchus. For "human", "my dna" or no organism return ["Homo sapiens"]. For "all life" or "everything" return: Homo sapiens, Pan troglodytes, Mus musculus, Drosophila melanogaster, Arabidopsis thaliana, Saccharomyces cerevisiae. No commentary.'

async function ncbiGet(url, asJson) {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), 20000)
  try {
    const r = await fetch(url, { signal: ctl.signal })
    if (!r.ok) throw new Error('HTTP ' + r.status)
    return asJson ? await r.json() : await r.text()
  } finally { clearTimeout(t) }
}

async function genomeStats(name) {
  const base = 'https://api.ncbi.nlm.nih.gov/datasets/v2/genome/taxon/' + encodeURIComponent(name) + '/dataset_report?page_size=1'
  let j = await ncbiGet(base + '&filters.reference_only=true', true)
  if (!(j.reports && j.reports.length)) j = await ncbiGet(base, true)
  const r = (j.reports || [])[0]
  if (!r) return null
  const st = r.assembly_stats || {}
  const gc = (r.annotation_info && r.annotation_info.stats && r.annotation_info.stats.gene_counts) || {}
  return {
    accession: r.accession,
    name: (r.organism && r.organism.organism_name) || name,
    common: (r.organism && r.organism.common_name) || '',
    sizeBp: Number(st.total_sequence_length) || 0,
    gc: st.gc_percent,
    chromosomes: st.total_number_of_chromosomes,
    genes: gc.total || gc.protein_coding || null,
  }
}

async function refSequence(name) {
  const terms = [
    '"' + name + '"[Organism] AND srcdb_refseq[PROP] AND (mitochondrion[Title] OR chloroplast[Title]) AND "complete genome"[Title]',
    '"' + name + '"[Organism] AND srcdb_refseq[PROP] AND biomol_genomic[PROP]',
  ]
  for (const term of terms) {
    const s = await ncbiGet('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=nuccore&retmode=json&retmax=1&term=' + encodeURIComponent(term), true)
    const id = s.esearchresult && s.esearchresult.idlist && s.esearchresult.idlist[0]
    if (!id) continue
    const fa = await ncbiGet('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=nuccore&rettype=fasta&retmode=text&seq_start=1&seq_stop=240&id=' + id, false)
    const lines = fa.trim().split('\n')
    const head = lines[0].replace(/^>/, '')
    const seq = lines.slice(1).join('').replace(/[^ACGTNacgtn]/g, '').toUpperCase()
    if (seq.length > 20) return { title: head, seq }
  }
  return null
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms))

const DNA_MODULE = {
  id: 'dna',
  test: (m) => /\b(dna|genome|genomes|chromosomes?)\b/i.test(m),
  async run({ message, send }) {
    send('thinking', { text: 'Reading real genome data from NCBI' })
    let names = []
    try {
      const out = await llm(DNA_SYS, message, 300)
      const mm = out.match(/\[[\s\S]*\]/)
      names = JSON.parse(mm ? mm[0] : '[]')
    } catch (e) { console.error('[mod] dna names failed:', e.message) }
    names = names.filter((n) => typeof n === 'string').slice(0, 6)
    if (!names.length) names = ['Homo sapiens']
    const items = []
    for (const n of names) {
      try {
        const g = await genomeStats(n)
        await pause(350)
        const s = await refSequence(n).catch(() => null)
        if (g || s) items.push({ query: n, ...(g || {}), seq: s ? s.seq : '', seqTitle: s ? s.title : '' })
      } catch (e) { console.error('[mod] dna failed for', n, '-', e.message) }
      await pause(350)
    }
    if (!items.length) { send('token', { text: "I couldn't reach the NCBI genome database right now. Please try again in a moment." }); return }
    send('token', { text: 'Here is the real DNA data from NCBI for ' + items.map((i) => i.name || i.query).join(', ') + '.\n\n```dna\n' + JSON.stringify(items) + '\n```\n\nGenome size, chromosomes, GC percent and genes come from the NCBI reference genome. The letters shown are the first 240 bases of the NCBI reference record named on each card.' })
  },
}
const BIZ_SYS = "You are a brand designer and small-business consultant. Output ONLY one complete HTML document (<!DOCTYPE html> to </html>) with inline CSS only, responsive, dark-friendly, with real copy and real numbers, no lorem ipsum, no external images or libraries (Google Fonts allowed). Build a BRAND AND LAUNCH KIT for the business in the request with these sections: 1) Six name ideas, each with a one-line tagline. 2) Color palette of five swatches with hex codes and where to use each. 3) A big shop banner drawn with inline SVG or CSS (name, tagline, shapes) plus two more banner variants. 4) Product mockups drawn in inline SVG (for a coffee shop: three mug designs with different colors and logos). 5) A menu with realistic prices in the currency of the user's country (use INR if the request mentions India or Tamil Nadu, otherwise USD) with short margin notes. 6) Template ideas for signboard, menu card, social post and loyalty card with sizes. 7) Interior and layout tips and a launch checklist with rough startup cost ranges marked as approximate. Make it beautiful."
const HOME_SYS = "You are an architect and interior designer. Output ONLY one complete HTML document (<!DOCTYPE html> to </html>) with inline CSS and inline SVG only, responsive, dark-friendly, with real copy and real numbers, no external images or libraries (Google Fonts allowed). Build a HOME DESIGN CONCEPT for the request with these sections: 1) Design summary with plot size assumptions stated clearly. 2) A floor plan drawn as inline SVG with labeled rooms and dimensions. 3) An exterior front elevation sketch drawn as inline SVG. 4) Room-by-room layout and furniture placement ideas. 5) Color palette with hex codes and material suggestions for floor, walls and roof, chosen for the local climate if a place is mentioned. 6) A rough cost range per square foot or square meter marked as approximate. 7) A note that this is a concept and a licensed architect and structural engineer must prepare final drawings. Make it beautiful."

const SITE_PHOTO_SYS = `You are an expert web designer. Output ONLY one complete HTML document (<!DOCTYPE html> to </html>), no markdown and no explanation. Single file, no external files except Google Fonts. Design it like a premium real brand website (Starbucks or Apple level): sticky header, full-width hero with a dark gradient overlay and a big headline, product or menu cards with prices, an about section, a visit-our-outlet section, and a footer with address and hours. For a portfolio: hero with name and role, project cards, skills, contact. REAL PHOTOS: use 6 img tags written exactly like <img class="ph" data-photo="DESCRIPTION"> where DESCRIPTION is a specific 12 to 20 word photo description (subject, setting, lighting, camera angle). Never write a src attribute and never draw scenes with SVG or CSS art. The .ph rule has width 100%, a fixed height, object-fit cover and rounded corners. The hero also uses a photo: a position relative box with the img absolutely filling it, a dark gradient overlay, and the headline on top. Nav links use href="#section-id" with matching ids. Responsive. Real specific copy (real item names, prices, address, hours), no lorem ipsum. If the user gives a shop or brand name, use it. HARD LIMIT: the WHOLE page must be under 10000 characters so it finishes. CSS ORDER: only a tiny style in the head (CSS variables, body font, the .ph rule, max 12 lines), then the complete body content, then ALL remaining CSS in a second style tag at the very END of the body, before the script, so a cut-off page still shows its content. JS max 12 lines. Emoji for icons, no SVG path data. Content visible by default: never use opacity 0 waiting for a script.`
const HOME_PHOTO_SYS = `You are a residential architect and interior designer. Output ONLY one complete HTML document (<!DOCTYPE html> to </html>), no markdown and no explanation. Single file, no external files except Google Fonts. It is a realistic architectural concept presentation with these sections in order, each with an id and a nav link href="#id": (1) full-width hero with a photo of the exterior and the project name; (2) key facts row (style, bedrooms, bathrooms, built-up area, plot size, pool) and a short design summary that states plot assumptions clearly; (3) Floor plan: ONE clean inline SVG with viewBox 0 0 800 500 drawn only with rect, line and text elements: thick wall outlines, every room labeled with its name and size in feet, door gaps, rooms scaled sensibly to the plot and the room counts the user asked for, white lines on a deep blue blueprint background, at most 30 elements; (4) room schedule table with sizes; (5) photo gallery; (6) materials and finishes for floor, walls and roof chosen for the local climate if a place is mentioned, plus an approximate cost range (INR if the request mentions India or Tamil Nadu, otherwise USD); (7) one-line note that this is an idea sketch and a licensed architect and structural engineer must prepare final drawings. REAL PHOTOS: use 6 img tags written exactly like <img class="ph" data-photo="DESCRIPTION"> with a specific 12 to 20 word photo description each: exterior at dusk with pool, living room, open kitchen, master bedroom, pool and garden aerial view, entrance courtyard. Never write a src attribute. NEVER draw the house, rooms or landscape with SVG shapes or CSS art: the ONLY SVG allowed is the floor plan. The .ph rule has width 100%, a fixed height, object-fit cover and rounded corners. HARD LIMIT: the WHOLE page must be under 11000 characters so it finishes. CSS ORDER: only a tiny style in the head (variables, font, .ph rule, max 12 lines), then the complete body content, then ALL remaining CSS in a second style tag at the very END of the body so a cut-off page still shows its content. Emoji for icons. Content visible by default: never use opacity 0 waiting for a script.`
const BIZ_PHOTO_SYS = `You are a brand designer and small-business consultant. Output ONLY one complete HTML document (<!DOCTYPE html> to </html>), no markdown and no explanation. Single file, no external files except Google Fonts, responsive, real copy and real numbers, no lorem ipsum. Build a premium BRAND AND LAUNCH KIT for the business in the request, each section with an id and a nav link href="#id": (1) full-width hero banner with a photo, the shop name and tagline; (2) six name ideas with one-line taglines; (3) color palette of five swatches with hex codes and where to use each; (4) outlet and product photo gallery: shop exterior at dusk with signboard, cozy interior, branded mug on a wooden table, signature drink and pastry; (5) menu with realistic prices (INR if the request mentions India or Tamil Nadu, otherwise USD); (6) template ideas for signboard, menu card, social post and loyalty card with sizes; (7) launch checklist with rough startup cost ranges marked as approximate. REAL PHOTOS: use 6 img tags written exactly like <img class="ph" data-photo="DESCRIPTION"> with a specific 12 to 20 word photo description each. Never write a src attribute and never draw scenes with SVG or CSS art. The .ph rule has width 100%, a fixed height, object-fit cover and rounded corners. HARD LIMIT: the WHOLE page must be under 11000 characters so it finishes. CSS ORDER: only a tiny style in the head (variables, font, .ph rule, max 12 lines), then the complete body, then ALL remaining CSS in a second style tag at the very END of the body. Emoji for icons. Content visible by default: never use opacity 0 waiting for a script.`

function makeHtmlModule(id, test, thinking, sys, intro) {
  return {
    id,
    test,
    async run({ message, send }) {
      send('thinking', { text: thinking })
      const out = await llm(sys, message, 5500)
      const fenced = out.match(/```(?:html)?\s*([\s\S]*?)```/i)
      let html = fenced ? fenced[1] : out
      const i = html.search(/<!DOCTYPE html>|<html/i)
      if (i > 0) html = html.slice(i)
      send('token', { text: intro + '\n\n```website\n' + html.trim() + '\n```' })
    },
  }
}

const BIZ_MODULE = makeHtmlModule(
  'bizkit',
  (m) => /\b(coffee shop|cafe|caf\u00e9|bakery|restaurant|boutique|salon|tea shop|juice shop|shop)\b/i.test(m) && /\b(banner|logo|brand|menu|mug|poster|template|templates|idea|ideas|open|start|build|launch|design)\b/i.test(m),
  'Designing your brand and launch kit',
  BIZ_PHOTO_SYS,
  'Here is your brand and launch kit. All prices and costs are approximate starting points.'
)
const HOME_MODULE = makeHtmlModule(
  'homedesign',
  (m) => /\b(house|villa|apartment|flat|duplex|bedroom|kitchen|living room|interior|architecture|floor ?plan|blueprint)\b/i.test(m) && /\b(design|plan|layout|build|idea|ideas|interior|architect|blueprint|vastu)\b/i.test(m),
  'Designing your home concept',
  HOME_PHOTO_SYS,
  'Here is your home design concept. This is an idea sketch, not a construction drawing.'
)
// ---- add new modules here: { id, test(message), run({message, send, resumeText}) } ----
const MODULES = [
  DNA_MODULE,
  {
    id: 'website',
    test: (m) => /\b(buil\w*|creat\w*|mak\w*|generat\w*|design\w*|develop\w*)\b[^.\n]{0,40}\b(web\s?sit\w*|landing page|portfolio|web ?page|homepage)\b/i.test(m),
    async run({ message, send, resumeText }) {
      const isPf = /portfolio/i.test(message)
      send('thinking', { text: isPf ? 'Designing your portfolio' : 'Designing your website' })
      let user = message
      if (isPf && resumeText) user += '\n\nUse this resume as the content source:\n' + String(resumeText).slice(0, 6000)
      const out = await llm(SITE_PHOTO_SYS, user, 5500)
      const fenced = out.match(/```(?:html)?\s*([\s\S]*?)```/i)
      let html = fenced ? fenced[1] : out
      const i = html.search(/<!DOCTYPE html>|<html/i)
      if (i > 0) html = html.slice(i)
      const title = isPf ? 'Portfolio website' : 'Website'
      send('token', { text: 'Here is your ' + title.toLowerCase() + '.\n\n```website\n' + html.trim() + '\n```' })
      
    },
  },
  {
    id: 'email',
    test: (m) => /\b(write|draft|generate|compose|create)\b[^.\n]{0,30}\b(e-?mail|cover letter|follow[- ]?up mail|mail)\b/i.test(m),
    async run({ message, send }) {
      send('thinking', { text: 'Drafting your email' })
      try {
        const out = await llm(MAIL_SYS, message, 1500)
        const mm = out.trim().match(/^Subject:\s*(.*)\r?\n+([\s\S]*)$/i)
        const to = (message.match(/[\w.+-]+@[\w-]+\.[\w.-]+/) || [''])[0]
        const _d = { to, subject: mm ? mm[1].trim() : '', body: (mm ? mm[2] : out).trim() }
        send('token', { text: "Alright, I've created this for you. Do you want to send it now?\n\n```email\n" + JSON.stringify(_d) + "\n```" })
      } catch (e) {
        console.error('[mod] email failed:', e.message)
        send('token', { text: "I couldn't draft the email right now (" + e.message + "). Please try again in a moment." })
      }
    },
  },
  BIZ_MODULE,
  HOME_MODULE,
]

export async function handleModuleRequest({ message, send, resumeText }) {
  const m = MODULES.find((x) => x.test(message || ''))
  if (!m) return false
  console.log('[mod] hit', m.id)
  await m.run({ message, send, resumeText })
  return true
}