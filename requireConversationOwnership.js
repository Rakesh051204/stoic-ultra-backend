// middleware/requireConversationOwnership.js
//
// Use this on routes that read/write a SPECIFIC conversation
// (e.g. GET /conversations/:conversationId, POST /chat with a
// conversationId in the body). Confirms the logged-in user
// actually owns that conversation before letting the request through.
//
// Must run AFTER requireAuth (needs req.user already set).

export async function requireConversationOwnership(req, res, next) {
  const conversationId =
    req.params.conversationId || req.body.conversationId || req.body.sessionId;

  if (!conversationId) {
    return res.status(400).json({ error: "conversationId is required." });
  }

  const { data, error } = await req.supabaseAdmin
    .from("conversations")
    .select("user_id")
    .eq("session_id", conversationId)
    .limit(1)
    .maybeSingle();

  if (error) {
    return res.status(500).json({ error: "Failed to verify conversation ownership." });
  }

  // New conversation (doesn't exist yet) — fine, it'll be created
  // and stamped with req.user.id when the message is saved.
  if (!data) {
    return next();
  }

  // Existing conversation — must belong to this user.
  if (data.user_id !== req.user.id) {
    return res.status(403).json({ error: "You don't have access to this conversation." });
  }

  next();
}
