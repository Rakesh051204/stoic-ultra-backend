import { searchFreshJobs } from '../services/freshJobs.js';

const shown = new Map(); // sessionId -> Set(url)

const INTENT = /\b(jobs?|openings?|vacanc(?:y|ies)|hiring|positions?|internships?|roles?|careers?)\b/i;
const ASK = /\b(find|give|list|show|search|get|need|want|looking|look for|apply|fresh|latest|new|more|any|all|suggest|recommend|where|build)\b/i;
const NOT = /\b(rate|score|review|check|ats)\b.*\b(resume|cv)\b/i;
export const isJobRequest = (m = '') => INTENT.test(m) && ASK.test(m) && !NOT.test(m);

const FAMILIES = [
  { label: 'AI / ML', ask: /\b(ai|ml|machine learning|deep learning|nlp|llm|genai|gen ai|generative|computer vision|mlops)\b/i,
    title: /(machine learning|\bml\b|\bai\b|artificial intelligence|deep learning|\bnlp\b|\bllm\b|genai|generative|computer vision|mlops|applied scien|research (engineer|scientist)|data scien|prompt|agent)/i,
    terms: ['machine learning', 'ai engineer', 'llm', 'data scientist'] },
  { label: 'Data', ask: /(data (scien|analy|engineer)|analytics|\bbi\b|business intelligence)/i,
    title: /(data (scien|analy|engineer)|analytics|business intelligence|\bbi\b|statistic|machine learning)/i,
    terms: ['data scientist', 'data analyst', 'data engineer'] },
  { label: 'Software', ask: /(software|developer|backend|back-end|front-?end|full.?stack|web dev|\bsde\b|programmer)/i,
    title: /(software|developer|engineer|backend|front.?end|full.?stack|programmer|\bsde\b|web)/i, terms: ['software engineer', 'developer', 'backend'] },
  { label: 'DevOps / Cloud', ask: /(devops|cloud|\bsre\b|infrastructure|platform engineer)/i,
    title: /(devops|cloud|\bsre\b|infrastructure|platform|reliability|systems)/i, terms: ['devops', 'cloud engineer'] },
  { label: 'Security', ask: /(cyber|security|infosec|pentest|soc analyst)/i,
    title: /(security|cyber|infosec|pentest|\bsoc\b|threat)/i, terms: ['security engineer', 'cybersecurity'] },
  { label: 'Product / Design', ask: /(product manager|\bpm\b|\bux\b|\bui\b|designer|design)/i,
    title: /(product (manager|owner|analyst)|\bpm\b|design|\bux\b|\bui\b)/i, terms: ['product manager', 'designer'] },
  { label: 'Marketing / Sales', ask: /(marketing|\bseo\b|content|sales|business development|\bsdr\b|\bbdr\b|customer success)/i,
    title: /(marketing|\bseo\b|content|growth|sales|business development|account (exec|manager)|\bsdr\b|\bbdr\b|customer success)/i, terms: ['marketing', 'sales'] },
  { label: 'Finance / Ops / HR', ask: /(finance|accounting|\bhr\b|recruit|operations)/i,
    title: /(finance|account|audit|tax|operations|\bhr\b|recruit|people)/i, terms: ['finance', 'operations'] },
  { label: 'QA / Testing', ask: /(\bqa\b|tester|testing|sdet)/i, title: /(\bqa\b|quality|test|sdet)/i, terms: ['qa engineer'] },
  { label: 'Mobile', ask: /(android|\bios\b|mobile|flutter|react native)/i, title: /(android|\bios\b|mobile|flutter|react native)/i, terms: ['mobile developer'] },
];

const EU = /europe|emea|germany|france|netherlands|spain|sweden|finland|ireland|poland|portugal|\buk\b|united kingdom|london|berlin|amsterdam|paris|denmark|norway|estonia|switzerland|austria|belgium|italy|czech|lithuania|latvia|romania|dublin|stockholm|helsinki|zurich|madrid|barcelona|lisbon|warsaw|copenhagen|oslo|vienna|munich|hamburg|remote.{0,12}(eu|europe)/i;
const REGIONS = [
  ['Finland', /finland|helsinki|espoo|tampere|oulu|turku/i, /finland|helsinki|espoo|tampere|oulu|turku|vantaa|nordic/i],
  ['Nordics', /nordic|sweden|norway|denmark|iceland/i, /nordic|sweden|norway|denmark|iceland|stockholm|oslo|copenhagen|finland|helsinki/i],
  ['Europe', /\beurope|\beu\b|emea/i, EU],
  ['Germany', /german|berlin|munich/i, /germany|berlin|munich|hamburg|frankfurt/i],
  ['UK', /\buk\b|united kingdom|london|england/i, /\buk\b|united kingdom|london|england|manchester|edinburgh/i],
  ['Ireland', /ireland|dublin/i, /ireland|dublin/i],
  ['Netherlands', /netherlands|amsterdam|dutch/i, /netherlands|amsterdam|rotterdam|utrecht/i],
  ['France', /france|paris/i, /france|paris|lyon/i],
  ['Spain', /spain|madrid|barcelona/i, /spain|madrid|barcelona/i],
  ['Switzerland', /switzerland|zurich|swiss/i, /switzerland|zurich|geneva/i],
  ['Poland', /poland|warsaw/i, /poland|warsaw|krakow/i],
  ['USA', /\busa\b|united states|\bus\b|america/i, /united states|\busa\b|\bu\.s\.|\bus\b|new york|san francisco|california|texas|seattle|boston|austin|chicago|washington|\bnyc\b|\bsf\b|remote.{0,10}\bus/i],
  ['Canada', /canada|toronto|vancouver/i, /canada|toronto|vancouver|montreal/i],
  ['India', /\bindia\b|bangalore|bengaluru|hyderabad|pune|chennai/i, INDIA_RE()],
  ['Singapore', /singapore/i, /singapore/i],
  ['UAE', /\buae\b|dubai|abu dhabi/i, /dubai|uae|united arab|abu dhabi/i],
  ['Australia', /australia|sydney|melbourne/i, /australia|sydney|melbourne/i],
  ['Japan', /japan|tokyo/i, /japan|tokyo/i],
  ['English-speaking countries', /english[- ]speaking|english countr|english[- ]country|english[- ]speaking countrys|english countrys/i, /united states|\busa\b|\bus\b|canada|united kingdom|\buk\b|ireland|australia|new zealand|singapore|london|toronto|vancouver|new york|san francisco|california|texas|seattle|boston|austin|chicago|dublin|sydney|melbourne|england|scotland/i],
  ['Remote', /remote|work from home|wfh|anywhere/i, /remote|anywhere|worldwide|distributed/i],
];
function INDIA_RE() { return /india|bangalore|bengaluru|hyderabad|pune|chennai|mumbai|delhi|gurgaon|noida/i; }

export function parseJobRequest(message = '') {
  const m = message.toLowerCase();
  // role
  const fams = FAMILIES.filter((f) => f.ask.test(m));
  let roleRe = null, roleLabel = '', terms = [];
  if (/\b(any|all|every)\s+(kind of\s+)?(jobs?|roles?)\b/.test(m) && !fams.length) { roleLabel = 'all'; }
  else if (fams.length) {
    roleRe = new RegExp(fams.map((f) => f.title.source).join('|'), 'i');
    roleLabel = fams.map((f) => f.label).join(' + ');
    terms = fams.flatMap((f) => f.terms);
  } else {
    const stop = new Set('fresher freshers junior entry level remote latest new fresh give me find list show some any the a an for in at of and with top best good more all my i want need please direct apply links link abroad startup startups companies company jobs job roles role positions position openings internships internship matching match this resume cv'.split(' '));
    const mm = m.match(/([a-z][a-z+#\/ -]{2,50}?)\s+(?:jobs?|roles?|positions?|openings?|internships?)\b/);
    const words = mm ? mm[1].split(/\s+/).filter((w) => w && !stop.has(w) && !/^\d+\+?$/.test(w)) : [];
    if (words.length && words.length <= 3) {
      const phrase = words.join(' ');
      roleRe = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      roleLabel = phrase; terms = [phrase];
    } else {
      roleRe = new RegExp(FAMILIES[0].title.source + '|' + FAMILIES[1].title.source, 'i');
      roleLabel = 'AI / ML / Data'; terms = ['machine learning', 'data scientist', 'ai engineer', 'data analyst'];
    }
  }
  // level
  const level = /\b(any level|all levels|senior|mid[- ]?level|experienced|[2-9]\+?\s*(years|yrs))\b/.test(m) ? 'any' : 'fresher';
  // places
  const abroad = /\babroad|overseas|outside india|foreign\b/.test(m);
  const remoteOnly = /\bremote|work from home|wfh|work from anywhere\b/.test(m);
  const regs = REGIONS.filter((r) => r[1].test(m) && r[0] !== 'Remote' && !(abroad && r[0] === 'India'));
  const locRes = regs.map((r) => r[2]);
  const placeLabel = regs.length ? regs.map((r) => r[0]).join(', ') : '';
  const locLabel = remoteOnly ? ('remote' + (placeLabel ? ' (' + placeLabel + ')' : ' (worldwide)')) : (placeLabel || (abroad ? 'abroad (outside India)' : 'worldwide'));
  // how many
  let limit = 100;
  if (/(show|give|list|find|get)\s+(me\s+)?(all|every)\b|\ball (the )?(jobs|roles|openings|available)\b|\bno limits?\b|\bunlimited\b|\bshow all\b|\beverything\b/.test(m)) limit = Infinity;
  else {
    const n = m.match(/(\d{1,4})\s*\+?\s*(?:(?:fresh|latest|new|more|junior|entry[- ]level|remote|direct|open)\s+)*(?:jobs?|roles?|openings?|positions?|links?|listings?|internships?)/) || m.match(/top\s+(\d{1,4})/);
    if (n) limit = Math.min(5000, parseInt(n[1], 10));
  }
  const again = /\b(again|repeat|same|all)\b/.test(m);
  return { roleRe, roleLabel, terms, level, locRes, locLabel, abroad, remoteOnly, limit, again };
}

const esc = (s) => String(s || '').replace(/\|/g, '/').replace(/\s+/g, ' ').trim();
const link = (u) => '[Apply](' + String(u).replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/\s/g, '%20') + ')';

const SKILLS = ['python','sql','pytorch','tensorflow','keras','scikit-learn','sklearn','pandas','numpy','machine learning','deep learning','nlp','llm','rag','langchain','transformers','hugging face','computer vision','opencv','fastapi','flask','django','node','react','javascript','typescript','java','c++','aws','azure','gcp','spark','power bi','tableau','excel','statistics','postgres','mongodb','vector','embeddings','whisper','mlops','data analysis','data science','generative ai','prompt','api','linux'];
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
    else if (pool.length) note = 'No new roles since your last list, so these are the same ones again.\n\n';
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
    send('token', { text: 'I checked ' + r.okSources + ' live career boards and job sites (' + when + ') and found **0** ' + lvl + ' **' + req.roleLabel + '** roles for **' + req.locLabel + '** right now.\n\nTry a wider place (for example "Europe" or "remote worldwide"), a different role, or say "any level".' });
    return true;
  }
  send('token', { text: note + 'Found **' + pool.length + '** ' + lvl + ' **' + req.roleLabel + '** roles for **' + req.locLabel + '**, live from ' + r.okSources + ' career boards and job sites (' + when + '). Showing **' + list.length + '**' + (useResume ? ', best match to your resume first' : ', newest first') + '. Every link opens the company\'s own apply page.\n' + (useResume ? '\nResume skills used for matching: ' + skills.slice(0, 12).join(', ') + '.\n' : '') + '\n' });
  send('token', { text: useResume
    ? '| # | Role | Company | Location | Match | Posted | Apply |\n|---|---|---|---|---|---|---|\n'
    : '| # | Role | Company | Location | Level | Posted | Apply |\n|---|---|---|---|---|---|---|\n' });
  let buf = '';
  list.forEach((j, i) => {
    seen.add(j.url);
    buf += '| ' + (i + 1) + ' | **' + esc(j.title) + '** | ' + esc(j.company) + ' | ' + esc(j.location) + ' | ' + (useResume ? j.match + '%' : esc(j.level)) + ' | ' + (j.posted || '-') + ' | ' + link(j.url) + ' |\n';
    if ((i + 1) % 25 === 0 || i === list.length - 1) { send('token', { text: buf }); buf = ''; }
  });
  shown.set(sessionId, seen);
  const more = pool.length - list.length;
  send('token', { text: '\n' + (more > 0 ? '**' + more + ' more** matched. Say "show all" or a number like "300 jobs" to see them. ' : '') + 'You can change the role, country, remote or level in your next message, for example "200 remote data analyst jobs in Canada".' });
  return true;
}
