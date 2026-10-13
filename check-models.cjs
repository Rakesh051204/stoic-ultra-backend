require('dotenv').config()
fetch('https://api.groq.com/openai/v1/models', { headers: { Authorization: 'Bearer ' + process.env.GROQ_API_KEY } }).then(function (r) { return r.json() }).then(function (j) {
  console.log((j.data || []).map(function (m) { return m.id }).join(', '))
}).catch(function (e) { console.log('models list failed: ' + e.message) })