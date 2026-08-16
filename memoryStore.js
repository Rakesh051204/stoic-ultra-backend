// src/memoryStore.js
// Persistent replacement for the in-memory `userSessions` object.
// Run memory_schema.sql in Supabase first, then this is imported by index.js.

import dotenv from "dotenv";
dotenv.config();

import { createClient } from "@supabase/supabase-js";
import Groq from "groq-sdk";
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Fetch recent turns + rolling summary for a session
export async function getSessionHistory(sessionId, limit = 10) {
  const { data: recent, error: recentErr } = await supabase
    .from("conversations")
    .select("role, content")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (recentErr) console.error("getSessionHistory recent error:", recentErr);

  const { data: summaryRow, error: summaryErr } = await supabase
    .from("conversation_summaries")
    .select("summary")
    .eq("session_id", sessionId)
    .maybeSingle();

  if (summaryErr) console.error("getSessionHistory summary error:", summaryErr);

  return {
    recentMessages: (recent || []).reverse(), // oldest first for prompt order
    summary: summaryRow?.summary || null,
  };
}

// Save one turn (call once for the user message, once for the assistant reply)
export async function saveMessage(sessionId, role, content) {
  const { error } = await supabase
    .from("conversations")
    .insert({ session_id: sessionId, role, content });

  if (error) console.error("saveMessage error:", error);
}

// Refresh the rolling summary every 10 messages so long chats stay cheap
// to prompt with instead of resending the entire history every turn.
export async function maybeUpdateSummary(sessionId) {
  const { count, error: countErr } = await supabase
    .from("conversations")
    .select("*", { count: "exact", head: true })
    .eq("session_id", sessionId);

  if (countErr) {
    console.error("maybeUpdateSummary count error:", countErr);
    return;
  }

  if (!count || count % 10 !== 0) return;

  const { data: allMsgs, error: allErr } = await supabase
    .from("conversations")
    .select("role, content")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  if (allErr) {
    console.error("maybeUpdateSummary fetch error:", allErr);
    return;
  }

  const transcript = allMsgs.map((m) => `${m.role}: ${m.content}`).join("\n");

  const summaryResp = await groq.chat.completions.create({
    model: "openai/gpt-oss-120b",
    messages: [
      {
        role: "system",
        content:
          "Summarize this conversation in 3-5 sentences, keeping key facts, names, and context the user would expect to be remembered.",
      },
      { role: "user", content: transcript },
    ],
  });

  const summary = summaryResp.choices[0].message.content;

  const { error: upsertErr } = await supabase
    .from("conversation_summaries")
    .upsert({ session_id: sessionId, summary, updated_at: new Date() });

  if (upsertErr) console.error("maybeUpdateSummary upsert error:", upsertErr);
}

// Wipe a session's history (used by /api/chat/clear)
export async function clearSessionHistory(sessionId) {
  const { error: convErr } = await supabase
    .from("conversations")
    .delete()
    .eq("session_id", sessionId);

  if (convErr) console.error("clearSessionHistory conversations error:", convErr);

  const { error: summErr } = await supabase
    .from("conversation_summaries")
    .delete()
    .eq("session_id", sessionId);

  if (summErr) console.error("clearSessionHistory summary error:", summErr);
}