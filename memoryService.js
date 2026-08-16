// stoic-ultra-backend/memoryService.js
//
// Supabase-backed conversation memory.
// - Incognito mode: skips all reads/writes, returns empty history.
// - Token budget enforcement: trims oldest messages first if history
//   would push the request over the model's context/TPM limit.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL; // must include .supabase.co
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.warn('[memoryService] Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars.');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Rough token estimate: ~4 chars per token (good enough for budget trimming,
// don't need exact tiktoken-level precision here).
function estimateTokens(text = '') {
  return Math.ceil(text.length / 4);
}

/**
 * Fetch conversation history for a given conversation/thread.
 * Returns [] immediately if incognito — no Supabase call made at all.
 */
async function getHistory(conversationId, { incognito = false } = {}) {
  if (incognito || !conversationId) return [];

  const { data, error } = await supabase
    .from('messages')
    .select('role, content, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[memoryService] getHistory error:', error.message);
    return []; // fail soft — better to answer with no memory than to crash
  }

  return (data || []).map((row) => ({
    role: row.role,
    content: row.content,
  }));
}

/**
 * Persist a single message (user or assistant) to Supabase.
 * No-op in incognito mode.
 */
async function saveMessage(conversationId, role, content, { incognito = false } = {}) {
  if (incognito || !conversationId) return;

  const { error } = await supabase.from('messages').insert({
    conversation_id: conversationId,
    role,
    content,
    created_at: new Date().toISOString(),
  });

  if (error) {
    console.error('[memoryService] saveMessage error:', error.message);
  }
}

/**
 * Ensures a conversation row exists (creates one if conversationId is new).
 * Call this once per new chat before saving messages.
 */
async function ensureConversation(conversationId, userId, { incognito = false } = {}) {
  if (incognito || !conversationId) return;

  const { error } = await supabase
    .from('conversations')
    .upsert(
      { id: conversationId, user_id: userId, updated_at: new Date().toISOString() },
      { onConflict: 'id' }
    );

  if (error) {
    console.error('[memoryService] ensureConversation error:', error.message);
  }
}

/**
 * Trims history to fit within a token budget, dropping OLDEST messages first
 * but always keeping the most recent turns intact (they matter most for
 * follow-up context like "tell me more").
 *
 * @param {Array<{role, content}>} history
 * @param {number} maxTokens - budget reserved for history (leave room for
 *   system prompt + new user message + expected completion tokens)
 */
function trimToTokenBudget(history, maxTokens = 4000) {
  if (!history.length) return [];

  let total = 0;
  const kept = [];

  // Walk backwards from most recent so we always keep the latest turns
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    const tokens = estimateTokens(msg.content);
    if (total + tokens > maxTokens) break;
    total += tokens;
    kept.unshift(msg);
  }

  return kept;
}

/**
 * Convenience: builds the full messages array ready to send to Groq —
 * [...trimmedHistory, newUserMessage] — respecting incognito + token budget.
 */
async function buildMessagesForCompletion({
  conversationId,
  userId,
  newUserMessage,
  systemPrompt,
  incognito = false,
  historyTokenBudget = 4000,
}) {
  await ensureConversation(conversationId, userId, { incognito });

  const rawHistory = await getHistory(conversationId, { incognito });
  const trimmedHistory = trimToTokenBudget(rawHistory, historyTokenBudget);

  const messages = [
    ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
    ...trimmedHistory,
    { role: 'user', content: newUserMessage },
  ];

  // Save the user's message now; assistant's reply gets saved separately
  // once streaming finishes (see saveMessage call in your stream route).
  await saveMessage(conversationId, 'user', newUserMessage, { incognito });

  return messages;
}

module.exports = {
  getHistory,
  saveMessage,
  ensureConversation,
  trimToTokenBudget,
  buildMessagesForCompletion,
  estimateTokens,
};