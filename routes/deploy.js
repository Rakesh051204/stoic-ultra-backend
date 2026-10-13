import express from 'express'
import { getClient } from '../connectors/authorizedClient.js'

const router = express.Router()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

router.post('/github', express.json({ limit: '5mb' }), async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] || req.query.userId || (req.body && req.body.userId) || process.env.DEV_USER_ID
    const html = String((req.body && req.body.html) || '')
    if (!/<\/html>/i.test(html)) return res.status(400).json({ error: 'No complete HTML page to deploy' })

    const c = await getClient(userId, 'github', 'https://api.github.com', { Accept: 'application/vnd.github+json' })
    const me = await c.get('/user')
    const owner = me.data.login

    const slug = String((req.body && req.body.name) || 'site').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'site'
    const repo = 'stoic-' + slug + '-' + Math.random().toString(36).slice(2, 6)

    const created = await c.post('/user/repos', { name: repo, description: 'Built with Stoic', private: false, auto_init: true })
    const branch = (created.data && created.data.default_branch) || 'main'
    const content = Buffer.from(html, 'utf8').toString('base64')

    let uploaded = false
    let lastErr = null
    for (let i = 0; i < 6 && !uploaded; i++) {
      try {
        await c.put('/repos/' + owner + '/' + repo + '/contents/index.html', { message: 'Add site', content, branch })
        uploaded = true
      } catch (e) {
        lastErr = e
        await sleep(1500)
      }
    }
    if (!uploaded) throw lastErr

    let note = ''
    try {
      await c.post('/repos/' + owner + '/' + repo + '/pages', { source: { branch, path: '/' } })
    } catch (e) {
      const st = e.response && e.response.status
      if (st !== 409 && st !== 422) note = 'Repo created but GitHub Pages could not be switched on automatically: ' + ((e.response && e.response.data && e.response.data.message) || e.message)
    }

    console.log('[deploy] ok', owner + '/' + repo)
    res.json({ url: 'https://' + owner + '.github.io/' + repo + '/', repoUrl: created.data.html_url, note })
  } catch (e) {
    const msg = (e.response && e.response.data && e.response.data.message) || e.message
    console.error('[deploy] failed:', msg)
    const status = e.response && (e.response.status === 401 || e.response.status === 403) ? 400 : 500
    res.status(status).json({ error: status === 400 ? 'GitHub is not connected or lacks permission. Connect it in Plugins first. (' + msg + ')' : msg })
  }
})

export default router