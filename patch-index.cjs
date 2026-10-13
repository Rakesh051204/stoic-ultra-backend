const fs = require('fs');
let s = fs.readFileSync('index.js', 'utf8');
if (s.includes('ATT-NORMALIZE')) { console.log('index.js already patched'); process.exit(0); }
const re = /^([ \t]*)const attachments = getAttachments\(sessionId\)[ \t]*\r?$/m;
const m = s.match(re);
if (!m) { console.log('PATCH FAILED: getAttachments line not found'); process.exit(1); }
const add = m[0] + '\n' + m[1] + "attachments.forEach(a => { if (!a.textContent) a.textContent = a.extractedText || a.text || '' }) // ATT-NORMALIZE";
s = s.replace(re, add);
fs.writeFileSync('index.js', s, 'utf8');
console.log('PATCHED index.js');
