// agentChat.js
import { STOIC_SYSTEM_PROMPT } from "./stoicSystemPrompt.js";
import express from "express";
import Groq from "groq-sdk";
import { runSearch } from "./searchPipeline.js";

const router = express.Router();
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// In-memory session store: sessionId -> { history: [{role, content}], lastQuery }
// Swap this for Redis/DB later if you need persistence across server restarts.
const userSessions = new Map();

function getSession(sessionId) {
  if (!userSessions.has(sessionId)) {
    userSessions.set(sessionId, { history: [], lastQuery: null });
  }
  return userSessions.get(sessionId);
}

// Detects "explain tamil", "in hindi", "translate to telugu" etc. as a
// follow-up asking to restate the PREVIOUS answer in another language,
// rather than a new topic to search/explain.
const LANGUAGE_NAMES = ["tamil", "hindi", "telugu", "kannada", "malayalam", "english", "bengali", "marathi", "gujarati", "punjabi", "urdu"];

function detectTranslationFollowUp(message, history) {
  if (!history || history.length === 0) return null;

  const cleaned = message.trim().toLowerCase().replace(/[.?!]+$/, "");
  const langPattern = LANGUAGE_NAMES.join("|");
  const regex = new RegExp(`^(explain|say|repeat|write|translate|reply|respond)?\\s*(?:this |that |it )?(?:in |to |into )?(${langPattern})$`, "i");

  const match = cleaned.match(regex);
  if (!match) return null;

  return match[2].toLowerCase();
}

function getLastAssistantMessage(history) {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === "assistant") return history[i].content;
  }
  return null;
}

// Rewrites short/ambiguous follow-ups ("what about him?") into a standalone
// query using recent chat history, so search + the model both get full context.
async function rewriteQuery(message, history) {
  if (history.length === 0) return message;

  const recentTurns = history
    .slice(-4)
    .map((h) => `${h.role}: ${h.content}`)
    .join("\n");

  try {
    const completion = await groq.chat.completions.create({
      model: "openai/gpt-oss-20b",
      messages: [
        {
          role: "system",
          content:
            "Rewrite the user's latest message as a fully standalone search query, resolving any pronouns or references using the conversation history. Reply with ONLY the rewritten query, nothing else.",
        },
        {
          role: "user",
          content: `Conversation so far:\n${recentTurns}\n\nLatest message: "${message}"\n\nStandalone query:`,
        },
      ],
      temperature: 0,
      max_tokens: 100,
    });

    const rewritten = completion.choices?.[0]?.message?.content?.trim();
    return rewritten && rewritten.length > 0 ? rewritten : message;
  } catch (err) {
    console.error("Query rewrite failed, using raw message:", err.message);
    return message;
  }
}

function buildContextPrompt(sources) {
  if (!sources || sources.length === 0) {
    return "No web search results were found for this query. Answer from general knowledge and say so if relevant.";
  }
  return sources
    .map(
      (s, i) =>
        `[${i + 1}] ${s.title}\nURL: ${s.url}\n${s.snippet || s.content || ""}`
    )
    .join("\n\n");
}

router.post("/chat", async (req, res) => {
  const { sessionId, message, mode = "balanced" } = req.body;

  if (!sessionId || !message || typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ error: "sessionId and message are required." });
  }

  const session = getSession(sessionId);

  try {
    // 0. Check for a "translate the last answer" follow-up BEFORE doing any
    // search/rewrite. If it matches, skip search entirely and just translate.
    const targetLang = detectTranslationFollowUp(message, session.history);

    if (targetLang) {
      const lastAnswer = getLastAssistantMessage(session.history);

      if (lastAnswer) {
        const translateMessages = [
          {
            role: "system",
            content: `Restate the following answer in ${targetLang}. Keep the meaning, structure, and any citations intact. Do not search for new information, do not add new facts, and do not explain what the language is — just translate/restate the content.`,
          },
          { role: "user", content: lastAnswer },
        ];

        const translateCompletion = await groq.chat.completions.create({
          model: "openai/gpt-oss-120b",
          messages: translateMessages,
          temperature: 0.2,
          max_tokens: 4096,
        });

        const translatedText = translateCompletion.choices?.[0]?.message?.content?.trim();

        if (translatedText) {
          session.history.push({ role: "user", content: message });
          session.history.push({ role: "assistant", content: translatedText });

          return res.json({
            answer: translatedText,
            sources: [],
            images: [],
            followUps: [],
          });
        }
      }
    }

    // 1. Rewrite query using conversation history for disambiguation
    const rewrittenQuery = await rewriteQuery(message, session.history);

    // 2. Run web search (Tavily) + optional reranking based on mode
    let sources = [];
    let images = [];
    try {
      const searchResult = await runSearch(rewrittenQuery, mode);
      sources = searchResult?.sources || [];
      images = searchResult?.images || [];
    } catch (searchErr) {
      console.error("runSearch failed:", searchErr.message);
      sources = [];
      images = [];
    }

    // 3. Build the prompt with search context injected
    const contextBlock = buildContextPrompt(sources);

    const messages = [
      {
        role: "system",
        content: STOIC_SYSTEM_PROMPT + "\n\nSearch results:\n" + contextBlock,
      },
      ...session.history.slice(-6),
      { role: "user", content: message },
    ];

    // 4. Call Groq for the final answer
    // max_tokens raised from 1200 -> 4096 so long/deep structured answers
    // (multi-section, headers, etc.) aren't cut short mid-way.
    const completion = await groq.chat.completions.create({
      model: "openai/gpt-oss-120b",
      messages,
      temperature: 0.4,
      max_tokens: 4096,
    });

    const finalAnswerText = completion.choices?.[0]?.message?.content?.trim();

    if (!finalAnswerText) {
      throw new Error("Groq returned an empty response.");
    }

    // 5. Generate follow-up question suggestions (best-effort, non-blocking)
    let followUpQuestions = [];
    try {
      const followUpCompletion = await groq.chat.completions.create({
        model: "openai/gpt-oss-20b",
        messages: [
          {
            role: "system",
            content:
              "Given the answer below, suggest exactly 3 short natural follow-up questions the user might ask next. Reply as a JSON array of strings only, nothing else.",
          },
          { role: "user", content: finalAnswerText },
        ],
        temperature: 0.5,
        max_tokens: 200,
      });
      const raw = followUpCompletion.choices?.[0]?.message?.content?.trim();
      followUpQuestions = JSON.parse(raw.replace(/```json|```/g, ""));
    } catch (followUpErr) {
      console.error("Follow-up generation failed:", followUpErr.message);
      followUpQuestions = [];
    }

    // 6. Update session memory
    session.history.push({ role: "user", content: message });
    session.history.push({ role: "assistant", content: finalAnswerText });
    session.lastQuery = rewrittenQuery;

    // 7. Send response — matches what AnswerCard.jsx / SourcesBar expect
    return res.json({
      answer: finalAnswerText,
      sources,
      images,
      followUps: followUpQuestions,
    });
  } catch (error) {
    console.error("Chat route error:", error);
    return res.status(500).json({
      error: error.message || "Something went wrong processing your request.",
    });
  }
});

export default router;