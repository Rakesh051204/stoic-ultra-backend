// middleware/rateLimiter.js
//
// Rate limiting for Stoic Ultra backend.
// Protects Groq / Voyage AI credits from abuse (bots, scrapers, spam).
//
// Install first:
//   npm install express-rate-limit

import rateLimit from "express-rate-limit";

// General limiter — apply to all routes as a baseline safety net.
// 100 requests per 15 minutes per IP is generous for normal use,
// but stops a script from hammering your server.
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true, // return rate limit info in RateLimit-* headers
  legacyHeaders: false,
  message: {
    error: "Too many requests. Please slow down and try again shortly.",
  },
});

// Strict limiter for the chat/completion endpoint specifically —
// this is what actually costs you Groq/Voyage AI credits per call,
// so it needs a tighter window than general browsing.
export const chatLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 12, // ~1 message every 5 seconds sustained — adjust to taste
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "You're sending messages too quickly. Please wait a moment.",
  },
  // Optional: key by session/user instead of just IP, so shared
  // networks (offices, colleges) don't get punished as one client.
  // Uncomment and adapt once you have real user/session identification:
  //
  // keyGenerator: (req) => req.body?.sessionId || req.ip,
});

// Stricter limiter for expensive/heavy operations — file uploads,
// PDF generation, video processing (ffmpeg/Whisper). These cost more
// compute per request than a text chat message.
export const heavyOpLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many uploads/processing requests. Please wait a few minutes.",
  },
});
