const fs = require('fs');
let ok = true;

// ---------- freshJobs.js: remote-only + keep description ----------
let f = fs.readFileSync('services/freshJobs.js', 'utf8');
const a1 = "locRes = [], abroad = false, maxAgeDays = 90, force = false } = {}) {";
const a2 = "    if (locRes.length && !locRes.some((r) => r.test(j.location || ''))) continue;";
const a3 = "source: j.source });";
if (!f.includes(a1) || !f.includes(a2) || !f.includes(a3)) { console.log('PATCH FAILED: freshJobs.js markers'); ok = false; }
else {
  f = f.replace(a1, "locRes = [], abroad = false, remoteOnly = false, maxAgeDays = 90, force = false } = {}) {");
  f = f.replace(a2, () => [
    "    const loc = j.location || '';",
    "    const isRemote = /remote|anywhere|worldwide|distributed|work from home/i.test(loc + ' ' + j.title);",
    "    if (remoteOnly && !isRemote) continue;",
    "    if (locRes.length) {",
    "      const inRegion = locRes.some((r) => r.test(loc));",
    "      const noRestriction = remoteOnly && /^\\s*(remote|anywhere|worldwide|global|distributed)?\\s*$/i.test(loc.replace(/[(),-]/g, ' '));",
    "      if (!inRegion && !noRestriction) continue;",
    "    }"
  ].join('\n'));
  f = f.replace(a3, "source: j.source, desc: (j.desc || '').slice(0, 2500) });");
  fs.writeFileSync('services/freshJobs.js', f, 'utf8');
  console.log('PATCHED freshJobs.js');
}

// ---------- jobIntent.js ----------
let s = fs.readFileSync('lib/jobIntent.js', 'utf8');
const b1 = "  ['Remote', /remote|work from home|wfh|anywhere/i,";
const b2 = "  const regs = REGIONS.filter((r) => r[1].test(m) && !(abroad && r[0] === 'India'));";
const b3 = "  const locLabel = regs.length ? regs.map((r) => r[0]).join(', ') : abroad ? 'abroad (outside India)' : 'worldwide';";
const b4 = "  return { roleRe, roleLabel, terms, level, locRes, locLabel, abroad, limit, again };";
const fnStart = s.indexOf('export async function handleJobRequest');
if (![b1, b2, b3, b4].every((x) => s.includes(x)) || fnStart < 0) { console.log('PATCH FAILED: jobIntent.js markers'); ok = false; }
else {
  s = s.replace(b1, () => "  ['English-speaking countries', /english[- ]speaking|english countr|english[- ]country|english[- ]speaking countrys|english countrys/i, /united states|\\busa\\b|\\bus\\b|canada|united kingdom|\\buk\\b|ireland|australia|new zealand|singapore|london|toronto|vancouver|new york|san francisco|california|texas|seattle|boston|austin|chicago|dublin|sydney|melbourne|england|scotland/i],\n" + b1);
  s = s.replace(b2, () => "  const remoteOnly = /\\bremote|work from home|wfh|work from anywhere\\b/.test(m);\n  const regs = REGIONS.filter((r) => r[1].test(m) && r[0] !== 'Remote' && !(abroad && r[0] === 'India'));");
  s = s.replace(b3, () => "  const placeLabel = regs.length ? regs.map((r) => r[0]).join(', ') : '';\n  const locLabel = remoteOnly ? ('remote' + (placeLabel ? ' (' + placeLabel + ')' : ' (worldwide)')) : (placeLabel || (abroad ? 'abroad (outside India)' : 'worldwide'));");
  s = s.replace(b4, () => "  return { roleRe, roleLabel, terms, level, locRes, locLabel, abroad, remoteOnly, limit, again };");
  const idx = s.indexOf('export async function handleJobRequest');
  s = s.slice(0, idx) + `const SKILLS = ['python','sql','pytorch','tensorflow','keras','scikit-learn','sklearn','pandas','numpy','machine learning','deep learning','nlp','llm','rag','langchain','transformers','hugging face','computer vision','opencv','fastapi','flask','django','node','react','javascript','typescript','java','c++','aws','azure','gcp','spark','power bi','tableau','excel','statistics','postgres','mongodb','vector','embeddings','whisper','mlops','data analysis','data science','generative ai','prompt','api','linux'];
const resumeSkills = (t = '') => { const x = t.toLowerCase(); return SKILLS.filter((s) => x.includes(s)); };

export async function handleJobRequest({ message, sessionId, send, resumeText = '' }) {
  if (!isJobRequest(message)) return false;
  console.log('[jobs] engine hit:', message.slice(0, 90));
  const req = parseJobRequest(message);
  const r = await searchFreshJobs(req);
  const skills = resumeSkills(resumeText);
  const useResume = skills.length >= 3;
  const seen = shown.get(sessionId) || new Set();
  let pool = r.jobs;
  let note = '';
  if (!req.again) {
    const fresh = pool.filter((j) => !seen.has(j.url));
    if (fresh.length) pool = fresh;
    else if (pool.length) note = 'No new roles since your last list, so these are the same ones again.\\n\\n';
  }
  if (useResume) {
    const cap = Math.min(skills.length, 10);
    pool = pool.map((j) => {
      const hay = (j.title + ' ' + (j.desc || '')).toLowerCase();
      const hits = skills.filter((s) => hay.includes(s));
      return { ...j, match: Math.min(100, Math.round((100 * hits.length) / cap)) };
    }).sort((a, b) => b.match - a.match || (b.posted || '').localeCompare(a.posted || ''));
  }
  const list = pool.slice(0, req.limit);
  const when = new Date().toISOString().slice(0, 10);
  const lvl = req.level === 'fresher' ? 'fresher (0-1 year)' : 'all-level';

  if (!list.length) {
    send('token', { text: 'I checked ' + r.okSources + ' live career boards and job sites (' + when + ') and found **0** ' + lvl + ' **' + req.roleLabel + '** roles for **' + req.locLabel + '** right now.\\n\\nTry a wider place (for example "Europe" or "remote worldwide"), a different role, or say "any level".' });
    return true;
  }
  send('token', { text: note + 'Found **' + pool.length + '** ' + lvl + ' **' + req.roleLabel + '** roles for **' + req.locLabel + '**, live from ' + r.okSources + ' career boards and job sites (' + when + '). Showing **' + list.length + '**' + (useResume ? ', best match to your resume first' : ', newest first') + '. Every link opens the company\\'s own apply page.\\n' + (useResume ? '\\nResume skills used for matching: ' + skills.slice(0, 12).join(', ') + '.\\n' : '') + '\\n' });
  send('token', { text: useResume
    ? '| # | Role | Company | Location | Match | Posted | Apply |\\n|---|---|---|---|---|---|---|\\n'
    : '| # | Role | Company | Location | Level | Posted | Apply |\\n|---|---|---|---|---|---|---|\\n' });
  let buf = '';
  list.forEach((j, i) => {
    seen.add(j.url);
    buf += '| ' + (i + 1) + ' | **' + esc(j.title) + '** | ' + esc(j.company) + ' | ' + esc(j.location) + ' | ' + (useResume ? j.match + '%' : esc(j.level)) + ' | ' + (j.posted || '-') + ' | ' + link(j.url) + ' |\\n';
    if ((i + 1) % 25 === 0 || i === list.length - 1) { send('token', { text: buf }); buf = ''; }
  });
  shown.set(sessionId, seen);
  const more = pool.length - list.length;
  send('token', { text: '\\n' + (more > 0 ? '**' + more + ' more** matched. Say "show all" or a number like "300 jobs" to see them. ' : '') + 'You can change the role, country, remote or level in your next message, for example "200 remote data analyst jobs in Canada".' });
  return true;
}
`;
  fs.writeFileSync('lib/jobIntent.js', s, 'utf8');
  console.log('PATCHED jobIntent.js');
}
process.exit(ok ? 0 : 1);
