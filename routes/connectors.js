import express from 'express'
import { saveConnector, getConnector, listConnectors, deleteConnector } from '../lib/connectorsStore.js'

const router = express.Router()

function requireUser(req, res, next) {
  const userId = req.headers['x-user-id']
  if (!userId) return res.status(401).json({ error: 'Missing user' })
  req.userId = userId
  next()
}

const PROVIDERS = ['github']

// NOTE: requireUser is applied per-route below instead of globally.
// /github/connect is reached via window.location.href (a full page
// navigation), which cannot carry custom headers — so it can't use the
// x-user-id header like the fetch-based routes do. It reads userId from
// a query param instead. /github/callback already handles this correctly
// via GitHub's `state` param; this brings /connect in line with it.

router.get('/', requireUser, async (req, res) => {
  try {
    const connected = await listConnectors(req.userId)
    const connectedMap = Object.fromEntries(connected.map((c) => [c.provider, c]))
    const result = PROVIDERS.map((provider) => ({
      provider,
      connected: !!connectedMap[provider],
      providerUsername: connectedMap[provider]?.provider_username || null,
      connectedAt: connectedMap[provider]?.connected_at || null,
    }))
    res.json({ connectors: result })
  } catch (err) {
    console.error('List connectors error:', err)
    res.status(500).json({ error: 'Failed to list connectors' })
  }
})

router.get('/github/connect', (req, res) => {
  const userId = req.query.userId
  if (!userId) return res.status(400).send('Missing user id')

  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID,
    redirect_uri: process.env.GITHUB_REDIRECT_URI,
    scope: 'repo read:user',
    state: userId,
  })
  res.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`)
})

router.get('/github/callback', async (req, res) => {
  const { code, state: userId } = req.query
  try {
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: process.env.GITHUB_REDIRECT_URI,
      }),
    })
    const tokenData = await tokenRes.json()
    if (!tokenData.access_token) throw new Error(tokenData.error_description || 'No access token returned')

    const userRes = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    })
    const githubUser = await userRes.json()

    await saveConnector({
      userId,
      provider: 'github',
      accessToken: tokenData.access_token,
      scope: tokenData.scope,
      providerUsername: githubUser.login,
    })
    res.redirect(`${process.env.FRONTEND_URL}/connectors?connected=github`)
  } catch (err) {
    console.error('GitHub OAuth callback error:', err)
    res.redirect(`${process.env.FRONTEND_URL}/connectors?error=github`)
  }
})

router.get('/github/repos', requireUser, async (req, res) => {
  try {
    const connector = await getConnector(req.userId, 'github')
    if (!connector) return res.status(404).json({ error: 'GitHub not connected' })
    const repoRes = await fetch('https://api.github.com/user/repos?sort=updated&per_page=20', {
      headers: { Authorization: `Bearer ${connector.access_token}` },
    })
    if (!repoRes.ok) throw new Error(`GitHub API returned ${repoRes.status}`)
    const repos = await repoRes.json()
    res.json({
      repos: repos.map((r) => ({
        name: r.full_name,
        private: r.private,
        url: r.html_url,
        updatedAt: r.updated_at,
        language: r.language,
      })),
    })
  } catch (err) {
    console.error('GitHub repos error:', err)
    res.status(500).json({ error: 'Failed to fetch repos' })
  }
})

router.post('/:provider/disconnect', requireUser, async (req, res) => {
  try {
    await deleteConnector(req.userId, req.params.provider)
    res.json({ success: true })
  } catch (err) {
    console.error('Disconnect error:', err)
    res.status(500).json({ error: 'Failed to disconnect' })
  }
})

export default router