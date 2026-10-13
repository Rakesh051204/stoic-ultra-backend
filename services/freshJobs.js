import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BOARDS_FILE = path.join(__dirname, '..', 'lib', 'jobBoards.json');
const UA = 'Mozilla/5.0 (compatible; StoicJobs/2.0)';

const BAD = /\b(senior|sr\.?|lead|staff|principal|manager|head of|director|vp|architect|distinguished|fellow|ii|iii|iv)\b/i;
const GOOD = /\b(junior|jr\.?|associate|graduate|grad|entry[- ]level|intern(ship)?|trainee|fresher|apprentice|early[- ]career|new grad|university|campus|working student|werkstudent|student)\b/i;
const INDIA = /india|bangalore|bengaluru|hyderabad|pune|chennai|mumbai|delhi|gurgaon|gurugram|noida|kolkata|ahmedabad/i;

const decode = (s = '') => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
const plain = (h = '') => decode(decode(String(h))).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 6000);
const pretty = (t) => String(t).replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
function toIso(v) {
  if (v == null || v === '') return '';
  const d = typeof v === 'number' ? new Date(v > 1e12 ? v : v * 1000) : new Date(v);
  return isNaN(d) ? '' : d.toISOString().slice(0, 10);
}
function years(text = '') {
  const out = [];
  const a = /(\d{1,2})\s*\+?\s*(?:(?:-|to)\s*\d{1,2}\s*)?(?:years?|yrs?)\b[^.\n]{0,50}?(?:experience|exp\b)/gi;
  const b = /experience[^.\n]{0,30}?(\d{1,2})\s*\+?\s*(?:years?|yrs?)/gi;
  let m;
  while ((m = a.exec(text))) out.push(+m[1]);
  while ((m = b.exec(text))) out.push(+m[1]);
  return out;
}
async function getJson(url, ms = 15000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: ctl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}
async function pool(items, size, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (i < items.length) { const it = items[i++]; await fn(it); }
  }));
}

async function greenhouse(t) {
  const d = await getJson(`https://boards-api.greenhouse.io/v1/boards/${t}/jobs?content=true`, 25000);
  return (d.jobs || []).map((j) => ({ title: j.title, company: j.company_name || pretty(t), location: j.location?.name || '', url: j.absolute_url, posted: toIso(j.first_published || j.updated_at), desc: plain(j.content), source: 'greenhouse' }));
}
async function lever(t) {
  const d = await getJson(`https://api.lever.co/v0/postings/${t}?mode=json`);
  return (Array.isArray(d) ? d : []).map((j) => ({ title: j.text, company: pretty(t), location: j.categories?.location || (j.categories?.allLocations || []).join(', '), url: j.hostedUrl || j.applyUrl, posted: toIso(j.createdAt), desc: String(j.descriptionPlain || '').slice(0, 6000), source: 'lever' }));
}
async function ashby(t) {
  const d = await getJson(`https://api.ashbyhq.com/posting-api/job-board/${t}`);
  return (d.jobs || []).filter((j) => j.isListed !== false).map((j) => ({ title: j.title, company: pretty(t), location: j.location || (j.address?.postalAddress?.addressCountry || ''), url: j.jobUrl || j.applyUrl, posted: toIso(j.publishedAt), desc: String(j.descriptionPlain || '').slice(0, 6000), source: 'ashby' }));
}
async function workable(t) {
  const d = await getJson(`https://apply.workable.com/api/v1/widget/accounts/${t}?details=true`);
  return (d.jobs || []).map((j) => ({ title: j.title, company: d.name || pretty(t), location: [j.city, j.country].filter(Boolean).join(', '), url: j.shortlink || j.url, posted: toIso(j.published_on || j.created_at), desc: plain(j.description), source: 'workable' }));
}
async function remotive(terms) {
  const all = [];
  for (const q of terms.slice(0, 6)) {
    try {
      const d = await getJson('https://remotive.com/api/remote-jobs?limit=200&search=' + encodeURIComponent(q));
      for (const j of d.jobs || []) all.push({ title: j.title, company: j.company_name, location: j.candidate_required_location || 'Remote', url: j.url, posted: toIso(j.publication_date), desc: plain(j.description), source: 'remotive' });
    } catch {}
  }
  return all;
}
async function remoteok() {
  const d = await getJson('https://remoteok.com/api');
  return (Array.isArray(d) ? d : []).filter((j) => j && j.position).map((j) => ({ title: j.position, company: j.company, location: j.location || 'Remote', url: j.apply_url || j.url, posted: toIso(j.date || j.epoch), desc: plain(j.description), source: 'remoteok' }));
}
async function arbeitnow() {
  const all = [];
  for (let p = 1; p <= 5; p++) {
    try {
      const d = await getJson('https://www.arbeitnow.com/api/job-board-api?page=' + p);
      for (const j of d.data || []) all.push({ title: j.title, company: j.company_name, location: j.location || (j.remote ? 'Remote' : ''), url: j.url, posted: toIso(j.created_at), desc: plain(j.description), source: 'arbeitnow' });
    } catch {}
  }
  return all;
}
async function jobicy(terms) {
  const all = [];
  for (const tag of terms.slice(0, 4)) {
    try {
      const d = await getJson('https://jobicy.com/api/v2/remote-jobs?count=50&tag=' + encodeURIComponent(tag));
      for (const j of d.jobs || []) all.push({ title: j.jobTitle, company: j.companyName, location: j.jobGeo || 'Remote', url: j.url, posted: toIso(j.pubDate), desc: plain(j.jobDescription) + ' ' + (j.jobLevel || ''), source: 'jobicy' });
    } catch {}
  }
  return all;
}
async function himalayas() {
  const all = [];
  for (let p = 0; p < 4; p++) {
    try {
      const d = await getJson('https://himalayas.app/jobs/api?limit=100&offset=' + p * 100);
      for (const j of d.jobs || []) all.push({ title: j.title, company: j.companyName || j.company, location: (j.locationRestrictions || []).join(', ') || 'Remote', url: j.applicationLink || j.url, posted: toIso(j.pubDate), desc: plain(j.description || j.excerpt) + ' ' + (j.seniority || []).join(' '), source: 'himalayas' });
    } catch {}
  }
  return all;
}

const rawCache = new Map();
const TTL = 20 * 60 * 1000;

async function fetchAll(terms, force) {
  const key = terms.join(',') + '|' + new Date().toISOString().slice(0, 10);
  const hit = rawCache.get(key);
  if (!force && hit && Date.now() - hit.t < TTL) return hit.v;
  const boards = JSON.parse(fs.readFileSync(BOARDS_FILE, 'utf8'));
  const tasks = [];
  for (const t of boards.greenhouse || []) tasks.push({ name: 'greenhouse:' + t, run: () => greenhouse(t) });
  for (const t of boards.lever || []) tasks.push({ name: 'lever:' + t, run: () => lever(t) });
  for (const t of boards.ashby || []) tasks.push({ name: 'ashby:' + t, run: () => ashby(t) });
  for (const t of boards.workable || []) tasks.push({ name: 'workable:' + t, run: () => workable(t) });
  tasks.push({ name: 'remotive', run: () => remotive(terms) }, { name: 'remoteok', run: remoteok }, { name: 'arbeitnow', run: arbeitnow },
    { name: 'jobicy', run: () => jobicy(terms) }, { name: 'himalayas', run: himalayas });
  const raw = []; const stats = {};
  await pool(tasks, 10, async (task) => {
    try { const arr = await task.run(); stats[task.name] = arr.length; raw.push(...arr); }
    catch (e) { stats[task.name] = 'ERR ' + e.message; }
  });
  const v = { raw, stats };
  rawCache.set(key, { t: Date.now(), v });
  return v;
}

export async function searchFreshJobs({ roleRe = null, terms = [], level = 'fresher', locRes = [], abroad = false, remoteOnly = false, maxAgeDays = 90, force = false } = {}) {
  const T = terms.length ? terms : ['machine learning', 'data scientist', 'ai engineer', 'data analyst'];
  const { raw, stats } = await fetchAll(T, force);
  const cutoff = Date.now() - maxAgeDays * 86400000;
  const seen = new Set(); const jobs = [];
  for (const j of raw) {
    if (!j.title || !j.url) continue;
    if (roleRe && !roleRe.test(j.title)) continue;
    const loc = j.location || '';
    const isRemote = /remote|anywhere|worldwide|distributed|work from home/i.test(loc + ' ' + j.title);
    if (remoteOnly && !isRemote) continue;
    if (locRes.length) {
      const inRegion = locRes.some((r) => r.test(loc));
      const noRestriction = remoteOnly && /^\s*(remote|anywhere|worldwide|global|distributed)?\s*$/i.test(loc.replace(/[(),-]/g, ' '));
      if (!inRegion && !noRestriction) continue;
    }
    if (abroad && (!j.location || INDIA.test(j.location))) continue;
    if (j.posted && new Date(j.posted).getTime() < cutoff) continue;
    let lvl = 'Any level';
    if (level === 'fresher') {
      if (BAD.test(j.title)) continue;
      const ys = years(j.desc || '');
      if (GOOD.test(j.title)) lvl = 'Entry-level / Intern';
      else { if (ys.some((n) => n >= 2)) continue; lvl = ys.length ? Math.min(...ys) + '+ yrs' : 'No experience stated'; }
    }
    const k = (j.company + '|' + j.title + '|' + j.location).toLowerCase();
    if (seen.has(k) || seen.has(j.url)) continue;
    seen.add(k); seen.add(j.url);
    jobs.push({ title: j.title, company: j.company, location: j.location || 'Not stated', url: j.url, posted: j.posted || '', level: lvl, source: j.source, desc: (j.desc || '').slice(0, 2500) });
  }
  jobs.sort((a, b) => (b.posted || '').localeCompare(a.posted || ''));
  const okSources = Object.values(stats).filter((v) => typeof v === 'number').length;
  return { jobs, total: jobs.length, fetched: raw.length, okSources, stats };
}