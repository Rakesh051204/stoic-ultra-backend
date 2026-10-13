import express from 'express'
import multer from 'multer'
import mammoth from 'mammoth'
import { scoreResume } from '../services/atsScorer.js'
import { searchJobs } from '../services/jobsService.js'

const router = express.Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } })

async function pdfToText(buf) {
  const mod = await import('pdf-parse')
  if (mod.PDFParse) {
    const parser = new mod.PDFParse({ data: new Uint8Array(buf) })
    try {
      const r = await parser.getText()
      return r.text || ''
    } finally {
      try { await parser.destroy() } catch {}
    }
  }
  const fn = mod.default || mod
  const r = await fn(buf)
  return r.text || ''
}

async function extractText(file) {
  const name = (file.originalname || '').toLowerCase()
  if (name.endsWith('.pdf') || file.mimetype === 'application/pdf') return pdfToText(file.buffer)
  if (name.endsWith('.docx')) {
    const r = await mammoth.extractRawText({ buffer: file.buffer })
    return r.value || ''
  }
  if (name.endsWith('.txt')) return file.buffer.toString('utf8')
  throw new Error('Please upload a PDF, DOCX or TXT file')
}

const ROLE_HINTS = [
  ['machine learning', 'machine learning engineer'], ['deep learning', 'machine learning engineer'],
  ['data science', 'data scientist'], ['data scientist', 'data scientist'],
  ['data analyst', 'data analyst'], ['data engineer', 'data engineer'],
  ['ai engineer', 'ai engineer'], ['llm', 'ai engineer'],
  ['full stack', 'full stack developer'], ['react', 'frontend developer'],
  ['node', 'backend developer'], ['devops', 'devops engineer'],
  ['python', 'python developer'], ['java ', 'java developer'],
]

function guessRole(text) {
  const t = text.toLowerCase()
  let best = 'software engineer'
  let top = 0
  for (const [phrase, role] of ROLE_HINTS) {
    const n = t.split(phrase).length - 1
    if (n > top) { top = n; best = role }
  }
  return best
}

router.post('/analyze', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded. Send a form field named "file".' })
    const text = (await extractText(req.file)).replace(/\u0000/g, '').trim()
    const jobDescription = String((req.body && req.body.jobDescription) || '')
    const role = String((req.body && req.body.role) || '').trim() || guessRole(text)
    const result = scoreResume(text, jobDescription)

    let jobs = []
    try {
      const all = await searchJobs(role, 10)
      const terms = role.toLowerCase().split(/\s+/).filter((w) => w.length > 2)
      const rel = all.filter((j) => terms.some((w) => j.title.toLowerCase().includes(w)))
      jobs = (rel.length ? rel : all).slice(0, 10)
    } catch {}

    res.json({ ...result, role, jobs, text })
  } catch (e) {
    res.status(400).json({ error: e.message || 'Could not read the resume' })
  }
})

export default router