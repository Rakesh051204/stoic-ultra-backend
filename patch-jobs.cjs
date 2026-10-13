const fs = require('fs');
let s = fs.readFileSync('index.js', 'utf8');
if (s.includes('JOBS-ENGINE')) { console.log('index.js already patched'); process.exit(0); }
const re = /^([ \t]*)const sourcesContext = buildSourcesContext\(sources\)[ \t]*\r?$/m;
const m = s.match(re);
if (!m) { console.log('PATCH FAILED: sourcesContext line not found'); process.exit(1); }
const ind = m[1];
const block =
ind + "// JOBS-ENGINE\n" +
ind + "try {\n" +
ind + "  const _resume = getAttachments(sessionId).map(a => a.textContent || a.extractedText || '').join('\\n')\n" +
ind + "  if (await handleJobRequest({ message, sessionId, send, resumeText: _resume })) { clearAttachments(sessionId); send('done', {}); return res.end() }\n" +
ind + "} catch (e) { console.error('[jobs] engine failed:', e.message) }\n";
s = s.replace(re, () => block + m[0]);
s = "import { handleJobRequest } from './lib/jobIntent.js'\n" + s;
fs.writeFileSync('index.js', s, 'utf8');
console.log('PATCHED index.js (jobs engine)');
