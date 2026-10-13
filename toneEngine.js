// toneEngine.js - emotional intelligence layer for Stoic.
// Rules first (instant, free), model only for "I feel ..." messages the rules miss.
import Groq from "groq-sdk";

let _client = null;
function client() {
  if (!_client) _client = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return _client;
}

const MOOD_LABELS = ["neutral", "rushed", "frustrated", "exploratory", "discouraged", "sad", "anxious", "excited"];

const CRISIS_RE = /\b(kill myself|killing myself|end my life|end it all|want to die|wanna die|dont want to live|don'?t want to live|suicid(e|al)|self[- ]?harm|hurt myself|cut myself|no reason to live|better off dead|take my own life)\b/i;

const RULES = [
  ["sad", /\b(sad|depressed|lonely|heartbroken|crying|grief|grieving|hopeless|empty inside|broke up|breakup|miss (him|her|them)|feeling low|feel low)\b/i],
  ["anxious", /\b(anxious|anxiety|nervous|worried|worrying|scared|afraid|panic|panicking|stressed|overthinking|can'?t sleep|cant sleep)\b/i],
  ["frustrated", /\b(frustrated|frustrating|annoyed|annoying|angry|fed up|useless|not working|doesn'?t work|doesnt work|still not|again and again|wtf|waste of time)\b/i],
  ["discouraged", /\b(give up|giving up|no use|i failed|i keep failing|got rejected|i was rejected|rejection|not good enough|worthless|demotivated|lost hope|can'?t do this|cant do this|unemployed|no job)\b/i],
  ["excited", /\b(excited|amazing|awesome|yay|i got (the|a) (job|offer)|got selected|i passed|promoted|so happy|can'?t wait|cant wait)\b/i],
  ["rushed", /\b(urgent|urgently|asap|quickly|hurry|in a hurry|immediately|right now|deadline)\b/i],
];

const FEELING_RE = /\b(i feel|i am feeling|i'?m feeling|im feeling|feeling)\b/i;

export const CRISIS_PROMPT = "You are Stoic, a warm and caring AI. The user's message suggests they may be thinking about ending their life or hurting themselves. Respond only with care. Rules: 1) Be human and gentle, 3 to 6 short sentences, no bullet points, no headings, no search, no citations. 2) Tell them you are glad they said it and that you take it seriously. Say the pain, tiredness or loss they feel is real, but never say that wanting to die makes sense and never call it their choice. 3) Encourage them to reach out right now to someone they trust (a friend or family member) and to a crisis line. If they may be in India: Tele-MANAS is free and open 24x7 on 14416 (or 1-800-891-4416). If they are in immediate danger, tell them to call their local emergency number now (112 in India). For other countries, say findahelpline.com lists free helplines by country. 4) Invite them to keep talking with you, using at most one gentle open line, not a list of questions. 5) Never lecture, never mention methods, never minimize what they feel, never promise outcomes.";

export const CRISIS_FALLBACK = "I'm really glad you told me this, and I'm taking it seriously. What you're feeling is real, and you don't have to carry it alone. Please reach out to someone you trust right now, and consider calling a crisis line: in India, Tele-MANAS is free and open 24x7 on 14416. If you might act on these thoughts or you are in danger, call 112 (or your local emergency number) now. I'm here to keep talking with you.";

export async function classifyTone(message, recentHistory = [], model) {
  const text = String(message || "");
  if (CRISIS_RE.test(text)) return "crisis";
  for (const [mood, re] of RULES) {
    if (re.test(text)) return mood;
  }
  if (!model || !FEELING_RE.test(text)) return "neutral";

  try {
    const historyContext = recentHistory.slice(-4).map((m) => m.role + ": " + m.content).join("\n");
    const prompt = "Classify the emotional tone of the LATEST user message into exactly one label: " + MOOD_LABELS.join(", ") + ".\n\nRecent conversation:\n" + (historyContext || "(none)") + "\n\nLatest user message: \"" + text + "\"\n\nRespond with ONLY the label.";
    const completion = await client().chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 40,
      temperature: 0,
    });
    const raw = (completion.choices[0]?.message?.content || "").trim().toLowerCase();
    return MOOD_LABELS.find((label) => raw.includes(label)) || "neutral";
  } catch (err) {
    console.error("[toneEngine] classification failed:", err.message);
    return "neutral";
  }
}

const TAIL = " Do not mention that you noticed their mood.";

export function toneToSystemInstruction(mood) {
  const instructions = {
    neutral: "",
    crisis: "",
    rushed: "TONE: The user seems pressed for time. Be concise and direct, lead with the answer, skip preamble." + TAIL,
    frustrated: "TONE: The user seems frustrated. Be calm, clear and solution-focused. Do not over-apologize, just help efficiently." + TAIL,
    exploratory: "TONE: The user is exploring. Feel free to add useful context or interesting related angles." + TAIL,
    discouraged: "TONE: The user seems discouraged. Be encouraging and honest, never fake-cheerful. Name one real strength or next step, then stay useful." + TAIL,
    sad: "TONE: The user seems sad. Start with one warm, genuine sentence that acknowledges how they feel. Do not rush to fix things, avoid lists and headings, keep it gentle. Then offer one small helpful thing." + TAIL,
    anxious: "TONE: The user seems anxious. Be calm and steady. Break things into small manageable steps, avoid alarming wording, and reassure only with things that are true." + TAIL,
    excited: "TONE: The user is excited. Match their energy, celebrate briefly and sincerely, then be useful." + TAIL,
  };
  return instructions[mood] || "";
}

export async function getToneContext(message, recentHistory = [], model) {
  const mood = await classifyTone(message, recentHistory, model);
  return { mood, instruction: toneToSystemInstruction(mood) };
}