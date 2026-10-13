const fs = require('fs')
let t = fs.readFileSync('lib/gameAI.cjs', 'utf8')
const anchor = "'If the user names a commercial game,"
const rich = "'Make it look and feel like a real game: draw the player, enemies and vehicles as recognizable characters built from several ctx shapes (never plain squares or circles), add a themed animated background with depth, at least 3 enemy or obstacle types, power-ups, a health or lives bar, levels or waves that get harder, particles and screen shake on hits, and show the story goal in the first seconds.',\n  "
if (t.indexOf(anchor) < 0) { console.log('anchor not found'); process.exit(1) }
t = t.replace(anchor, rich + anchor)
t = t.replace('Keep it under 180 lines.', 'Keep it between 200 and 320 lines.')
t = t.replace('chat(models[mi], msgs, 3500)', 'chat(models[mi], msgs, 6000)')
t = t.replace('Keep it under 110 lines with simple graphics. The last answer was cut off.', 'Keep it under 220 lines. The last answer was cut off.')
fs.writeFileSync('lib/gameAI.cjs', t)
console.log('richer prompt: ' + t.includes('real game: draw the player'))
console.log('longer limit: ' + t.includes('msgs, 6000'))
console.log('line range: ' + t.includes('between 200 and 320'))