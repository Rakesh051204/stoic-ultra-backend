import express from 'express'
import crypto from 'crypto'
import { saveConnector, getConnector, listConnectors, deleteConnector } from '../lib/connectorsStore.js'

const router = express.Router()

function requireUser(req, res, next) {
  const userId = req.headers['x-user-id']
  if (!userId) return res.status(401).json({ error: 'Missing user' })
  req.userId = userId
  next()
}

const PROVIDERS = ['github', 'notion', 'slack']

const pkceStore = new Map()

function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

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

// ---- GitHub (existing) ----

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

// ---- Notion ----

router.get('/notion/connect', (req, res) => {
  const userId = req.query.userId
  if (!userId) return res.status(400).send('Missing user id')
  const params = new URLSearchParams({
    client_id: process.env.NOTION_CLIENT_ID,
    redirect_uri: process.env.NOTION_REDIRECT_URI,
    response_type: 'code',
    owner: 'user',
    state: userId,
  })
  res.redirect(`https://api.notion.com/v1/oauth/authorize?${params.toString()}`)
})

router.get('/notion/callback', async (req, res) => {
  const { code, state: userId } = req.query
  try {
    const basic = Buffer.from(`${process.env.NOTION_CLIENT_ID}:${process.env.NOTION_CLIENT_SECRET}`).toString('base64')
    const tokenRes = await fetch('https://api.notion.com/v1/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${basic}`,
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.NOTION_REDIRECT_URI,
      }),
    })
    const tokenData = await tokenRes.json()
    if (!tokenData.access_token) throw new Error(tokenData.error || 'No access token returned')

    await saveConnector({
      userId,
      provider: 'notion',
      accessToken: tokenData.access_token,
      scope: null,
      providerUsername: tokenData.workspace_name || tokenData.owner?.user?.name || null,
    })
    res.redirect(`${process.env.FRONTEND_URL}/connectors?connected=notion`)
  } catch (err) {
    console.error('Notion OAuth callback error:', err)
    res.redirect(`${process.env.FRONTEND_URL}/connectors?error=notion`)
  }
})

// ---- Slack ----

router.get('/slack/connect', (req, res) => {
  const userId = req.query.userId
  if (!userId) return res.status(400).send('Missing user id')

  const codeVerifier = base64url(crypto.randomBytes(32))
  const codeChallenge = base64url(crypto.createHash('sha256').update(codeVerifier).digest())
  pkceStore.set(userId, codeVerifier)

  const params = new URLSearchParams({
    client_id: process.env.SLACK_CLIENT_ID,
    redirect_uri: process.env.SLACK_REDIRECT_URI,
    scope: 'channels:read,chat:write,users:read',
    state: userId,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  })
  const authUrl = `https://slack.com/oauth/v2/authorize?${params.toString()}`
  console.log('SLACK AUTH URL >>>', authUrl)
  res.redirect(authUrl)
})

router.get('/slack/callback', async (req, res) => {
  const { code, state: userId } = req.query
  try {
    const codeVerifier = pkceStore.get(userId)
    pkceStore.delete(userId)

    const params = new URLSearchParams({
      client_id: process.env.SLACK_CLIENT_ID,
      client_secret: process.env.SLACK_CLIENT_SECRET,
      code,
      redirect_uri: process.env.SLACK_REDIRECT_URI,
    })
    if (codeVerifier) params.set('code_verifier', codeVerifier)

    const tokenRes = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    })
    const tokenData = await tokenRes.json()
    if (!tokenData.ok) throw new Error(tokenData.error || 'Slack OAuth failed')

    await saveConnector({
      userId,
      provider: 'slack',
      accessToken: tokenData.access_token,
      scope: tokenData.scope,
      providerUsername: tokenData.team?.name || null,
    })
    res.redirect(`${process.env.FRONTEND_URL}/connectors?connected=slack`)
  } catch (err) {
    console.error('Slack OAuth callback error:', err)
    res.redirect(`${process.env.FRONTEND_URL}/connectors?error=slack`)
  }
})
// ---- shared ----

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
