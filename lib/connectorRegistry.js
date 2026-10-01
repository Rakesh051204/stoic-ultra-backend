export const CONNECTORS = [
  {
    id: 'github',
    authorizeUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    redirectUri: process.env.GITHUB_REDIRECT_URI,
    scope: 'repo read:user',
    tokenAuth: 'body',
    tokenBodyFormat: 'json',
    tokenHeaders: { Accept: 'application/json' },
    extractError: (d) => d.error_description,
    getProviderUsername: async (tokenData, accessToken) => {
      const res = await fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const user = await res.json()
      return user.login
    },
  },
  {
    id: 'notion',
    authorizeUrl: 'https://api.notion.com/v1/oauth/authorize',
    tokenUrl: 'https://api.notion.com/v1/oauth/token',
    clientId: process.env.NOTION_CLIENT_ID,
    clientSecret: process.env.NOTION_CLIENT_SECRET,
    redirectUri: process.env.NOTION_REDIRECT_URI,
    extraAuthParams: { response_type: 'code', owner: 'user' },
    tokenAuth: 'basic',
    tokenBodyFormat: 'json',
    extractError: (d) => d.error,
    extractScope: () => null,
    getProviderUsername: async (tokenData) =>
      tokenData.workspace_name || tokenData.owner?.user?.name || null,
  },
  {
    id: 'slack',
    authorizeUrl: 'https://slack.com/oauth/v2/authorize',
    tokenUrl: 'https://slack.com/api/oauth.v2.access',
    clientId: process.env.SLACK_CLIENT_ID,
    clientSecret: process.env.SLACK_CLIENT_SECRET,
    redirectUri: process.env.SLACK_REDIRECT_URI,
    scope: 'channels:read,chat:write,users:read',
    usePKCE: true,
    tokenAuth: 'body',
    tokenBodyFormat: 'form',
    extractToken: (d) => (d.ok ? d.access_token : null),
    extractError: (d) => d.error,
    getProviderUsername: async (tokenData) => tokenData.team?.name || null,
  },
]