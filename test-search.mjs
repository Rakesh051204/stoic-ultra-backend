import 'dotenv/config'
import { search } from './services/webSearchService.js'
const BAD = /porn|xxx|xvideos|xnxx|redtube|onlyfans|hentai|escort|casino|betting/i
async function one(q) {
  try {
    const r = await search(q, { maxResults: 5 })
    const arr = Array.isArray(r) ? r : ((r && (r.results || r.sources)) || [])
    const withUrl = arr.filter(function (x) { return /^https?:\/\//.test(String(x.url || x.link || '')) })
    const blocked = withUrl.filter(function (x) { return BAD.test(String(x.url || '') + ' ' + String(x.title || '') + ' ' + String(x.content || x.snippet || x.text || '')) })
    console.log(q + ' -> ' + (Array.isArray(r) ? 'array' : typeof r) + (r && !Array.isArray(r) ? ' keys=' + Object.keys(r).join(',') : '') + ' | items=' + arr.length + ' withUrl=' + withUrl.length + ' blocked=' + blocked.length + (arr[0] ? ' | itemKeys=' + Object.keys(arr[0]).join(',') : ''))
  } catch (e) { console.log(q + ' -> ERROR ' + e.message) }
}
console.log('--- one at a time ---')
await one('AI engineer jobs Finland graduates')
await one('machine learning graduate jobs Finland')
console.log('--- four at once ---')
await Promise.all(['data scientist jobs Finland', 'AI engineer salary Finland', 'junior machine learning Helsinki', 'graduate AI roles Finland'].map(one))
process.exit(0)