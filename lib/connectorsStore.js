import { createClient } from '@supabase/supabase-js'
import { encrypt, decrypt } from './tokenCrypto.js'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

export async function saveConnector({ userId, provider, accessToken, refreshToken, scope, providerUsername }) {
  const { error } = await supabase.from('user_connectors').upsert({
    user_id: userId,
    provider,
    access_token: encrypt(accessToken),
    refresh_token: refreshToken ? encrypt(refreshToken) : null,
    scope,
    provider_username: providerUsername || null,
    connected_at: new Date().toISOString(),
  }, { onConflict: 'user_id,provider' })
  if (error) throw error
}

export async function getConnector(userId, provider) {
  const { data, error } = await supabase
    .from('user_connectors')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', provider)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return {
    ...data,
    access_token: decrypt(data.access_token),
    refresh_token: data.refresh_token ? decrypt(data.refresh_token) : null,
  }
}

export async function listConnectors(userId) {
  const { data, error } = await supabase
    .from('user_connectors')
    .select('provider, provider_username, connected_at')
    .eq('user_id', userId)
  if (error) throw error
  return data || []
}

export async function deleteConnector(userId, provider) {
  const { error } = await supabase
    .from('user_connectors')
    .delete()
    .eq('user_id', userId)
    .eq('provider', provider)
  if (error) throw error
}