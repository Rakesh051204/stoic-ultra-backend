try { require('dotenv').config() } catch (e) {}
require('./lib/gameAI.cjs').generateGame('make a james bond spy game').then(function (r) {
  console.log('RESULT ok=' + r.ok + ' name=' + (r.name || '') + ' size=' + (r.html ? r.html.length : 0))
  process.exit(r.ok ? 0 : 2)
})