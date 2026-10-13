require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
s.from('messages').select('role,meta').eq('session_id', process.argv[2]).order('created_at', { ascending: true }).then(function (r) {
  if (r.error) { console.log('db error: ' + r.error.message); return }
  console.log('saved rows: ' + r.data.length)
  r.data.forEach(function (m) { console.log(m.role + ' | game in meta: ' + !!(m.meta && m.meta.game)) })
})