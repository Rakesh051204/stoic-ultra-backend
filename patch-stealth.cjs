const fs = require('fs')
let t = fs.readFileSync('lib/gameBuild.cjs', 'utf8')
if (t.includes('STEALTH_RE')) { console.log('already patched'); process.exit(0) }
t = t.replace('const STOP = new Set(', function () { return "const STEALTH_RE = /\\b(bond|007|spy|secret agent|stealth|hitman|assassin|infiltrat\\w*)\\b/i\nconst STEALTH_FILE = path.join(__dirname, 'games', 'stealth.html')\nconst STOP = new Set(" })
t = t.replace(/let res = null\r?\n/, function (m) { return m + "  if (STEALTH_RE.test(text) && fs.existsSync(STEALTH_FILE)) res = { html: fs.readFileSync(STEALTH_FILE, 'utf8'), game: 'stealth', matched: true, name: 'Operation Night Tide', headline: 'Infiltrate the villa and escape by boat', help: 'WASD move, Shift sneak, mouse aim, click shoot, E takedown or hack, 1-4 gadgets' }\n" })
t = t.replace('if (!p.matched && !isGeneric(text)) {', 'if (!res && !p.matched && !isGeneric(text)) {')
fs.writeFileSync('lib/gameBuild.cjs', t)
console.log('route added: ' + t.includes('STEALTH_FILE, ') + ' | AI skipped for spy games: ' + t.includes('if (!res && !p.matched'))