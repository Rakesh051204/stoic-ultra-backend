import express from 'express'
import { createClient } from '@supabase/supabase-js'
import { detectLocationIntent } from '../utils/locationIntent.js';
import { geocodePlace, findNearby } from '../services/geoService.js';
import dotenv from 'dotenv'
dotenv.config()

const router = express.Router()

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

// NOTE: there's no auth/session-user wiring yet in this backend (no JWT/user
// context middleware found in index.js), so for now we scope by a fixed
// placeholder user id pulled from query/body if provided, falling back to
// listing everything. Once real auth exists, replace DEV_USER_ID usage with
// the authenticated user's id.
const DEV_USER_ID = process.env.DEV_USER_ID || null

function scopeToUser(query) {
  if (DEV_USER_ID) return query.eq('user_id', DEV_USER_ID)
  return query
}

// GET /api/conversations — list all sessions for the sidebar
router.get('/', async (req, res) => {
  let query = supabase
    .from('sessions')
    .select('*')
    .order('pinned', { ascending: false })
    .order('updated_at', { ascending: false })

  query = scopeToUser(query)

  const { data, error } = await query
  if (error) return res.status(500).json({ error: error.message })
  res.json({ conversations: data })
})

// POST /api/conversations/:id/share
router.post('/:id/share', async (req, res) => {
  // No sharing mechanism exists yet (no share tokens table). Returning a
  // placeholder shareable reference for now so the frontend doesn't break;
  // replace with real share-link generation once that feature is designed.
  res.json({ id: req.params.id, shared: true, url: `${req.protocol}://${req.get('host')}/shared/${req.params.id}` })
})

// PATCH /api/conversations/:id/rename
router.patch('/:id/rename', async (req, res) => {
  const { title } = req.body
  if (!title || !title.trim()) return res.status(400).json({ error: 'title is required' })

  const { data, error } = await supabase
    .from('sessions')
    .update({ title: title.trim(), updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json({ conversation: data })
})

// PATCH /api/conversations/:id/pin
router.patch('/:id/pin', async (req, res) => {
  const { pinned } = req.body
  const { data, error } = await supabase
    .from('sessions')
    .update({ pinned: !!pinned, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json({ conversation: data })
})

// PATCH /api/conversations/:id/favorite
router.patch('/:id/favorite', async (req, res) => {
  const { favorite } = req.body
  const { data, error } = await supabase
    .from('sessions')
    .update({ favorite: !!favorite, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json({ conversation: data })
})

// PATCH /api/conversations/:id/archive
router.patch('/:id/archive', async (req, res) => {
  const { archived } = req.body
  const { data, error } = await supabase
    .from('sessions')
    .update({ archived: !!archived, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json({ conversation: data })
})

// PATCH /api/conversations/:id/move-to-project
router.patch('/:id/move-to-project', async (req, res) => {
  const { projectId } = req.body
  const { data, error } = await supabase
    .from('sessions')
    .update({ project_id: projectId ?? null, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json({ conversation: data })
})

// DELETE /api/conversations/:id
router.delete('/:id', async (req, res) => {
  const { error } = await supabase
    .from('sessions')
    .delete()
    .eq('id', req.params.id)

  if (error) return res.status(500).json({ error: error.message })
  res.json({ success: true })
})

export default router