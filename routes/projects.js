import express from 'express'
import { createClient } from '@supabase/supabase-js'

const router = express.Router()

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

const DEV_USER_ID = process.env.DEV_USER_ID || null

function scopeToUser(query) {
  if (DEV_USER_ID) return query.eq('user_id', DEV_USER_ID)
  return query
}

// GET /api/projects — list all projects for the sidebar
router.get('/', async (req, res) => {
  let query = supabase
    .from('projects')
    .select('*')
    .order('updated_at', { ascending: false })

  query = scopeToUser(query)

  const { data, error } = await query
  if (error) return res.status(500).json({ error: error.message })
  res.json({ projects: data })
})

// POST /api/projects — create a new project
router.post('/', async (req, res) => {
  const { name } = req.body
  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' })

  const insertPayload = { name: name.trim() }
  if (DEV_USER_ID) insertPayload.user_id = DEV_USER_ID

  const { data, error } = await supabase
    .from('projects')
    .insert(insertPayload)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json({ project: data })
})

export default router