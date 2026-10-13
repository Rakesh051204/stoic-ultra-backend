const clean = (s = '') => String(s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
const terms = (q) => String(q).toLowerCase().split(/[^a-z0-9+#.]+/).filter((t) => t.length > 2)
const get = (url) => fetch(url, { signal: AbortSignal.timeout(8000) }).then((r) => r.json())

async function remotive(q, limit) {
  const j = await get('https://remotive.com/api/remote-jobs?search=' + encodeURIComponent(q) + '&limit=' + limit)
  return (j.jobs || []).map((x) => ({
    title: clean(x.title), company: clean(x.company_name),
    location: x.candidate_required_location || 'Remote',
    type: String(x.job_type || '').replace(/_/g, ' '),
    posted: x.publication_date || '', url: x.url, source: 'Remotive',
  }))
}

async function arbeitnow(q, limit) {
  const j = await get('https://www.arbeitnow.com/api/job-board-api')
  const t = terms(q)
  return (j.data || [])
    .filter((x) => { const h = (x.title + ' ' + (x.tags || []).join(' ')).toLowerCase(); return t.some((w) => h.includes(w)) })
    .slice(0, limit)
    .map((x) => ({
      title: clean(x.title), company: clean(x.company_name),
      location: (x.location || '') + (x.remote ? ' (Remote)' : ''),
      type: (x.job_types || []).join(', '),
      posted: typeof x.created_at === 'number' ? new Date(x.created_at * 1000).toISOString() : '',
      url: x.url, source: 'Arbeitnow',
    }))
}

export async function searchJobs(query, limit = 10) {
  const res = await Promise.allSettled([remotive(query, limit), arbeitnow(query, limit)])
  const seen = new Set()
  return res
    .flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
    .filter((j) => j.url && !seen.has(j.url) && seen.add(j.url))
    .slice(0, limit * 2)
}