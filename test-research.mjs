import 'dotenv/config'
import { runResearch } from './lib/research.js'
const q = process.argv.slice(2).join(' ') || 'research how solid-state batteries work and when they will be in cars'
const send = function (ev, d) {
  if (ev === 'thinking') console.log('[progress] ' + d.text)
  else if (ev === 'token') process.stdout.write(d.text)
}
const r = await runResearch({ message: q, send: send })
console.log('\n--- finished, ok=' + (r && r.ok) + ' ---')
process.exit(r && r.ok ? 0 : 1)