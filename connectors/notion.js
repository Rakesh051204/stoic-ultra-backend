// connectors/notion.js
import { getClient } from './authorizedClient.js'

async function client(userId) {
  return getClient(userId, 'notion', 'https://api.notion.com/v1', {
    'Notion-Version': '2022-06-28',
  })
}

function extractTitle(page) {
  const titleProp = Object.values(page.properties || {}).find(p => p.type === 'title')
  return titleProp?.title?.map(t => t.plain_text).join('') || 'Untitled'
}

function blockToText(block) {
  const type = block.type
  const rich = block[type]?.rich_text
  if (!rich) return null
  return rich.map(t => t.plain_text).join('')
}

export async function searchPages(userId, { query = '', limit = 10 } = {}) {
  const c = await client(userId)
  const res = await c.post('/search', {
    query,
    page_size: limit,
    filter: { property: 'object', value: 'page' },
  })
  return res.data.results.map(p => ({
    id: p.id,
    title: extractTitle(p),
    url: p.url,
    last_edited: p.last_edited_time,
  }))
}

export async function getPage(userId, { pageId }) {
  const c = await client(userId)
  const [page, blocks] = await Promise.all([
    c.get(`/pages/${pageId}`),
    c.get(`/blocks/${pageId}/children`, { params: { page_size: 100 } }),
  ])
  return {
    id: page.data.id,
    title: extractTitle(page.data),
    url: page.data.url,
    blocks: blocks.data.results.map(blockToText).filter(Boolean),
  }
}

export async function createPage(userId, { parentPageId, title, content = '' }) {
  const c = await client(userId)
  const res = await c.post('/pages', {
    parent: { page_id: parentPageId },
    properties: { title: { title: [{ text: { content: title } }] } },
    children: content
      ? [{ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ text: { content } }] } }]
      : [],
  })
  return { id: res.data.id, url: res.data.url }
}

export async function appendBlock(userId, { pageId, text }) {
  const c = await client(userId)
  const res = await c.patch(`/blocks/${pageId}/children`, {
    children: [{ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ text: { content: text } }] } }],
  })
  return { ok: true, added: res.data.results.length }
}

