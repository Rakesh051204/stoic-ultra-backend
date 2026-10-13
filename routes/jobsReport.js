import express from 'express'
import { buildJobsReport, getReport } from '../services/jobsReport.js'
import { toXlsx, toDocx, toPdf } from '../services/reportFiles.js'

const router = express.Router()
const MAKERS = {
  xlsx: [toXlsx, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  docx: [toDocx, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  pdf: [toPdf, 'application/pdf'],
}

router.post('/report', express.json(), async (req, res) => {
  try {
    const base = req.protocol + '://' + req.get('host')
    res.json(await buildJobsReport(String((req.body && req.body.message) || ''), { base }))
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.get('/file/:name', async (req, res) => {
  try {
    const [id, ext] = req.params.name.split('.')
    const r = getReport(id)
    const m = MAKERS[ext]
    if (!r || !m) return res.status(404).send('Report expired or format unknown. Ask for the jobs again.')
    const buf = await m[0](r)
    res.setHeader('Content-Type', m[1])
    res.setHeader('Content-Disposition', 'attachment; filename="job-openings-' + id + '.' + ext + '"')
    res.send(buf)
  } catch (e) {
    res.status(500).send(e.message)
  }
})

export default router