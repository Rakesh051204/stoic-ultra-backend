import { handleJobRequest, parseJobRequest } from './lib/jobIntent.js';
const q = process.argv[2] || 'give me 200 fresher data analyst jobs in europe';
const p = parseJobRequest(q);
console.log('READ:', { role: p.roleLabel, level: p.level, where: p.locLabel, limit: p.limit });
const t0 = Date.now();
await handleJobRequest({ message: q, sessionId: 'test', send: (_, d) => process.stdout.write(d.text || '') });
console.log('\n\n[done in ' + Math.round((Date.now() - t0) / 1000) + 's]');