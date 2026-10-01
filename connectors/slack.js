// connectors/slack.js
import { getClient } from './authorizedClient.js'

async function client(userId) {
  return getClient(userId, 'slack', 'https://slack.com/api')
}

export async function listChannels(userId, { limit = 50 } = {}) {
  const c = await client(userId)
  const res = await c.get('/conversations.list', {
    params: { limit, types: 'public_channel,private_channel' },
  })
  if (!res.data.ok) throw new Error(`Slack error: ${res.data.error}`)
  return res.data.channels.map(ch => ({ id: ch.id, name: ch.name, is_private: ch.is_private }))
}

export async function getRecentMessages(userId, { channelId, limit = 20 }) {
  const c = await client(userId)
  const res = await c.get('/conversations.history', {
    params: { channel: channelId, limit },
  })
  if (!res.data.ok) throw new Error(`Slack error: ${res.data.error}`)
  return res.data.messages.map(m => ({ user: m.user, text: m.text, ts: m.ts }))
}

export async function sendMessage(userId, { channelId, text }) {
  const c = await client(userId)
  const res = await c.post('/chat.postMessage', { channel: channelId, text })
  if (!res.data.ok) throw new Error(`Slack error: ${res.data.error}`)
  return { ok: true, ts: res.data.ts, channel: res.data.channel }
}

export async function listUsers(userId, { limit = 50 } = {}) {
  const c = await client(userId)
  const res = await c.get('/users.list', { params: { limit } })
  if (!res.data.ok) throw new Error(`Slack error: ${res.data.error}`)
  return res.data.members
    .filter(u => !u.is_bot && !u.deleted)
    .map(u => ({ id: u.id, name: u.real_name || u.name }))
}

