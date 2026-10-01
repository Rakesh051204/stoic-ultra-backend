export function makeApiKeySaveHandler(config, { saveConnector }) {
  return async (req, res) => {
    const { apiKey } = req.body
    if (!apiKey) return res.status(400).json({ error: 'Missing apiKey' })
    try {
      await saveConnector({
        userId: req.userId,
        provider: config.id,
        accessToken: apiKey,
        scope: null,
        providerUsername: null,
      })
      res.json({ success: true, provider: config.id })
    } catch (err) {
      console.error(`${config.id} key save error:`, err)
      res.status(500).json({ error: 'Failed to save key' })
    }
  }
}

function buildUrl(config, key, path) {
  let url = config.baseUrl + (path ?? config.testPath ?? '')
  if (config.keyLocation === 'path' && key) {
    url = `${config.baseUrl}/${key}${path ?? config.testPath ?? ''}`
  } else if (config.keyLocation === 'query' && key) {
    url += (url.includes('?') ? '&' : '?') + `${config.keyParam}=${encodeURIComponent(key)}`
  }
  return url
}

export function makeApiKeyCallHandler(config, { getConnector }) {
  return async (req, res) => {
    try {
      const connector = config.keyLocation === 'none' ? null : await getConnector(req.userId, config.id)
      if (config.keyLocation !== 'none' && !connector) {
        return res.status(404).json({ error: `${config.id} not connected` })
      }
      const key = connector?.access_token
      const path = req.query.path || ''
      const url = buildUrl(config, key, path)

      const headers = {}
      if (config.keyLocation === 'header' && key) {
        headers[config.keyParam] = (config.headerPrefix || '') + key
      }

      const apiRes = await fetch(url, { headers })
      const contentType = apiRes.headers.get('content-type') || ''
      const data = contentType.includes('application/json') ? await apiRes.json() : await apiRes.text()
      res.status(apiRes.status).send(data)
    } catch (err) {
      console.error(`${config.id} call error:`, err)
      res.status(500).json({ error: `Failed to call ${config.id}` })
    }
  }
}