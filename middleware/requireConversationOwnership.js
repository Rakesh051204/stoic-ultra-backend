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

  if (!data) {
    return next();
  }

  if (data.user_id !== req.user.id) {
    return res.status(403).json({ error: "You don't have access to this conversation." });
  }

  next();
}