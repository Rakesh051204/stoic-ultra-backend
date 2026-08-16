import dns from 'dns'
dns.setDefaultResultOrder('ipv4first')

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config()

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

const candidates = [
  'conversations',
  'sessions',
  'user_conversations',
  'chat_sessions',
  'chats',
  'projects',
  'user_projects',
]

async function check(table) {
  const { data, error } = await supabase.from(table).select('*').limit(1)
  if (error) {
    console.log(`❌ "${table}" — ${error.message}`)
  } else {
    console.log(`✅ "${table}" exists`)
    if (data && data.length > 0) {
      console.log(`   columns: ${Object.keys(data[0]).join(', ')}`)
    } else {
      console.log(`   (table exists but is empty — can't infer columns from data)`)
    }
  }
}

for (const table of candidates) {
  await check(table)
}