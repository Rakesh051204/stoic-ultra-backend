// middleware/requireAuth.js
//
// Verifies the Supabase JWT sent from the frontend and attaches
// the authenticated user to req.user. Rejects the request with
// 401 if no valid token is present.
//
// Frontend sends the token like this on every request:
//   fetch('/api/chat', {
//     headers: { Authorization: `Bearer ${session.access_token}` }
//   })
//
// Requires your Supabase client already set up server-side
// (the same one your services use), imported here.

import 'dotenv/config';
import { createClient } from "@supabase/supabase-js";

// Server-side Supabase client using the SERVICE ROLE key.
// This key bypasses RLS — keep it only in backend env vars,
// NEVER expose it to the frontend.
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY)
);

export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({ error: "Missing or invalid Authorization header." });
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data?.user) {
    return res.status(401).json({ error: "Invalid or expired session. Please log in again." });
  }

  // Attach the authenticated user to the request for downstream handlers.
  req.user = data.user; // { id, email, ... }
  req.supabaseAdmin = supabaseAdmin; // reuse the same client downstream if needed

  next();
}
