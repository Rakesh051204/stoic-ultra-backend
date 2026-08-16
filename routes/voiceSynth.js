// routes/voiceSynth.js
// Real TTS via Groq's Orpheus model (canopylabs/orpheus-v1-english).
// playai-tts is DEAD — Groq deprecated it Dec 23, 2025. This replaces it.
//
// Setup required before this works:
//   1. Set GROQ_API_KEY in your backend .env
//   2. Accept the Orpheus model terms once, here:
//      https://console.groq.com/playground?model=canopylabs/orpheus-v1-english
//   3. Mount this router in your server entry file (see bottom of this file)

import express from "express";

const router = express.Router();

const GROQ_TTS_URL = "https://api.groq.com/openai/v1/audio/speech";
const GROQ_MODEL = "canopylabs/orpheus-v1-english";

// English voices currently live on Groq's Orpheus deployment.
// Exact tonal character isn't documented by Groq (no official
// "husky" / "deep" labels) — preview each in the Settings drawer
// to hear them for yourself and pick.
const ALLOWED_VOICES = new Set(["autumn", "diana", "hannah", "austin", "daniel", "troy"]);
const DEFAULT_VOICE = "diana";

router.post("/api/voice/speak", async (req, res) => {
  try {
    const { text, voice = DEFAULT_VOICE, speed = 1.0 } = req.body || {};

    if (!text || !text.trim()) {
      return res.status(400).json({ error: "text is required" });
    }
    if (!process.env.GROQ_API_KEY) {
      return res.status(500).json({ error: "GROQ_API_KEY is not set on the server" });
    }

    const safeVoice = ALLOWED_VOICES.has(voice) ? voice : DEFAULT_VOICE;
    const safeSpeed = Math.min(Math.max(Number(speed) || 1.0, 0.5), 2.0);

    const groqRes = await fetch(GROQ_TTS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        input: text,
        voice: safeVoice,
        response_format: "mp3",
        speed: safeSpeed,
      }),
    });

    if (!groqRes.ok) {
      const errText = await groqRes.text();
      console.error("[voiceSynth] Groq TTS error:", groqRes.status, errText);
      return res.status(502).json({ error: "TTS provider failed", detail: errText });
    }

    const buffer = Buffer.from(await groqRes.arrayBuffer());
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", buffer.length);
    res.send(buffer);
  } catch (err) {
    console.error("[voiceSynth] route error:", err);
    res.status(500).json({ error: "Internal TTS error" });
  }
});

// GET list of available voices, so the frontend settings drawer doesn't
// need to hardcode them either.
router.get("/api/voice/voices", (req, res) => {
  res.json({ voices: Array.from(ALLOWED_VOICES), default: DEFAULT_VOICE });
});

export default router;

// ─── Add this to your server entry file (e.g. index.js / server.js) ───
//
//   import voiceSynthRouter from "./routes/voiceSynth.js";
//   app.use(voiceSynthRouter);
//
// That's it — /api/voice/speak and /api/voice/voices will be live.