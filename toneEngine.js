import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Five moods is enough to be useful without becoming a fake-psychology gimmick.
const MOOD_LABELS = ["neutral", "rushed", "frustrated", "exploratory", "discouraged"];

/**
 * Classifies the emotional tone of the latest user message using a fast model.
 * Fails safe to "neutral" so a classification error never blocks the main response.
 */
export async function classifyTone(message, recentHistory = []) {
  const historyContext = recentHistory
    .slice(-4)
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  const prompt = `Classify the emotional tone of the LATEST user message into exactly one label: ${MOOD_LABELS.join(", ")}.

Recent conversation:
${historyContext || "(no prior context)"}

Latest user message: "${message}"

Respond with ONLY the label, nothing else.`;

  try {
    const completion = await groq.chat.completions.create({
      model: "openai/gpt-oss-20b", // small/fast model — this call must not add real latency
      messages: [{ role: "user", content: prompt }],
      max_tokens: 10,
      temperature: 0,
    });

    const raw = completion.choices[0]?.message?.content?.trim().toLowerCase() || "neutral";
    return MOOD_LABELS.find((label) => raw.includes(label)) || "neutral";
  } catch (err) {
    console.error("[toneEngine] classification failed:", err.message);
    return "neutral";
  }
}

/**
 * Converts a mood label into a system-prompt instruction fragment.
 * Kept subtle on purpose — the goal is adapting delivery, not performing empathy.
 */
export function toneToSystemInstruction(mood) {
  const instructions = {
    neutral: "",
    rushed: "The user seems pressed for time. Be concise and direct — lead with the answer, skip preamble.",
    frustrated: "The user seems frustrated. Be clear, calm, and solution-focused. Don't over-apologize — just help efficiently.",
    exploratory: "The user is browsing and exploring. Feel free to add relevant context or interesting related angles.",
    discouraged: "The user may feel discouraged about this topic. Be encouraging and constructive without being saccharine — stay useful first.",
  };
  return instructions[mood] || "";
}

/**
 * Convenience wrapper: classify + return both the mood and its instruction in one call.
 */
export async function getToneContext(message, recentHistory = []) {
  const mood = await classifyTone(message, recentHistory);
  return { mood, instruction: toneToSystemInstruction(mood) };
}
