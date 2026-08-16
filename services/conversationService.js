const supabase = require('../config/supabase'); // adjust to your actual supabase client path

async function getConversationHistory(conversationId) {
  const { data, error } = await supabase
    .from('messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(20);

  if (error) throw error;
  return data || [];
}

async function buildGroqMessages({ conversationId, newQuery, searchResults }) {
  const history = await getConversationHistory(conversationId);

  const systemPrompt = {
    role: 'system',
    content: `You are Stoic, a grounded search assistant. Use the search results below to answer.
Cite sources. If a follow-up refers to a prior answer, use conversation history to resolve it.

SEARCH RESULTS:
${searchResults.map((r, i) => `[${i+1}] ${r.title}: ${r.snippet} (${r.url})`).join('\n')}`
  };

  return [
    systemPrompt,
    ...history.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: newQuery }
  ];
}

module.exports = { getConversationHistory, buildGroqMessages };