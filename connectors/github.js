// connectors/github.js
import { getClient } from './authorizedClient.js'

async function client(userId) {
  return getClient(userId, 'github', 'https://api.github.com', {
    Accept: 'application/vnd.github+json',
  })
}

export async function listRepos(userId, { limit = 20 } = {}) {
  const c = await client(userId)
  const res = await c.get('/user/repos', { params: { per_page: limit, sort: 'updated' } })
  return res.data.map(r => ({
    full_name: r.full_name,
    private: r.private,
    url: r.html_url,
    updated_at: r.updated_at,
  }))
}

export async function getRepoIssues(userId, { owner, repo, state = 'open', limit = 20 }) {
  const c = await client(userId)
  const res = await c.get(`/repos/${owner}/${repo}/issues`, { params: { state, per_page: limit } })
  return res.data
    .filter(i => !i.pull_request)
    .map(i => ({ number: i.number, title: i.title, state: i.state, url: i.html_url }))
}

export async function createIssue(userId, { owner, repo, title, body = '' }) {
  const c = await client(userId)
  const res = await c.post(`/repos/${owner}/${repo}/issues`, { title, body })
  return { number: res.data.number, url: res.data.html_url }
}

export async function createComment(userId, { owner, repo, issueNumber, body }) {
  const c = await client(userId)
  const res = await c.post(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, { body })
  return { id: res.data.id, url: res.data.html_url }
}

