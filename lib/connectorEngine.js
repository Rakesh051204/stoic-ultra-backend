import crypto from 'crypto'

const pkceStore = new Map()

function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function makeConnectHandler(config) {
  return (req, res) => {
    const userId = req.query.userId
    if (!userId) return res.status(400).send('Missing user id')

    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      state: userId,
      ...(config.scope ? { scope: config.scope } : {}),
      ...(config.extraAuthParams || {}),
    })

    if (config.usePKCE) {
      const codeVerifier = base64url(crypto.randomBytes(32))
      const codeChallenge = base64url(crypto.createHash('sha256').update(codeVerifier).digest())
      pkceStore.set(`${config.id}:${userId}`, codeVerifier)
      params.set('code_challenge', codeChallenge)
      params.set('code_challenge_method', 'S256')
    }

    res.redirect(`${config.authorizeUrl}?${params.toString()}`)
  }
}

export function makeCallbackHandler(config, { saveConnector }) {
  return async (req, res) => {
    const { code, state: userId } = req.query
    try {
      const tokenParams = {
        code,
        redirect_uri: config.redirectUri,
        grant_type: config.grantType || 'authorization_code',
        ...(config.extraTokenParams || {}),
      }

      const headers = { ...(config.tokenHeaders || {}) }

      if (config.tokenAuth === 'basic') {
        const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')
        headers['Authorization'] = `Basic ${basic}`
      } else {
        tokenParams.client_id = config.clientId
        tokenParams.client_secret = config.clientSecret
      }

      if (config.usePKCE) {
        const codeVerifier = pkceStore.get(`${config.id}:${userId}`)
        pkceStore.delete(`${config.id}:${userId}`)
        if (codeVerifier) tokenParams.code_verifier = codeVerifier
      }

      let body
      if (config.tokenBodyFormat === 'form') {
        headers['Content-Type'] = 'application/x-www-form-urlencoded'
        body = new URLSearchParams(tokenParams).toString()
      } else {
        headers['Content-Type'] = 'application/json'
        body = JSON.stringify(tokenParams)
      }

      const tokenRes = await fetch(config.tokenUrl, { method: 'POST', headers, body })
      const tokenData = await tokenRes.json()

      const accessToken = config.extractToken ? config.extractToken(tokenData) : tokenData.access_token
      if (!accessToken) {
        const errMsg = config.extractError ? config.extractError(tokenData) : (tokenData.error_description || tokenData.error)
        throw new Error(errMsg || 'No access token returned')
      }

      const providerUsername = config.getProviderUsername
        ? await config.getProviderUsername(tokenData, accessToken)
        : null

      await saveConnector({
        userId,
        provider: config.id,
        accessToken,
        scope: config.extractScope ? config.extractScope(tokenData) : (tokenData.scope || null),
        providerUsername,
      })

      res.redirect(`${process.env.FRONTEND_URL}/plugins?connected=${config.id}`)
    } catch (err) {
      console.error(`${config.id} OAuth callback error:`, err)
      res.redirect(`${process.env.FRONTEND_URL}/plugins?error=${config.id}`)
    }
  }
}