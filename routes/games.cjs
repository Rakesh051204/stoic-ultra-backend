const express = require('express')
const gb = require('../lib/gameBuild.cjs')
const g = require('../lib/gameSite.cjs')
const router = express.Router()
router.use(express.json({ limit: '100kb' }))

function base(req) {
  return process.env.PUBLIC_BACKEND_URL || process.env.RENDER_EXTERNAL_URL ||
    ((req.get('x-forwarded-proto') || req.protocol) + '://' + req.get('host'))
}

router.get('/list', function (req, res) { res.json({ games: g.list() }) })

router.get('/play/:id', function (req, res) {
  const html = gb.read(req.params.id)
  if (!html) return res.status(404).type('text/plain').send('This game link has expired. Ask Stoic to build a new one.')
  res.set({
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': "sandbox allow-scripts allow-pointer-lock; default-src 'none'; script-src 'unsafe-inline' https://cdnjs.cloudflare.com; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src data: blob:; base-uri 'none'; form-action 'none'",
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'public, max-age=300'
  })
  res.send(html)
})

router.post('/build', async function (req, res) {
  try {
    const text = String((req.body && req.body.prompt) || '').slice(0, 600)
    if (!text) return res.status(400).json({ ok: false, error: 'prompt is required' })
    const r = await gb.buildGame(text, base(req))
    res.status(r.ok ? 200 : 500).json(r)
  } catch (e) {
    res.status(500).json({ ok: false, error: String((e && e.message) || e) })
  }
})

module.exports = router