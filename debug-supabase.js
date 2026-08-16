import dns from 'dns'
dns.setDefaultResultOrder('ipv4first')

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config()

console.log('SUPABASE_URL loaded:', process.env.SUPABASE_URL ? process.env.SUPABASE_URL.slice(0, 30) + '...' : 'MISSING')
console.log('SUPABASE_SERVICE_KEY loaded:', process.env.SUPABASE_SERVICE_KEY ? 'yes (' + process.env.SUPABASE_SERVICE_KEY.length + ' chars)' : 'MISSING')

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

console.log('\nTesting known-working table: user_connectors')
const { data, error } = await supabase.from('user_connectors').select('*').limit(1)
if (error) {
  console.log('❌ user_connectors failed too:', error.message)
  console.log('   Full error:', JSON.stringify(error, null, 2))
} else {
  console.log('✅ user_connectors reachable, rows:', data.length)
}