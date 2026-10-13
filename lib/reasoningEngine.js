// lib/reasoningEngine.js - "deep mode" for hard questions only.
const HARD_RE = /\b(why|how (does|do|would|can|should)|explain|compare|difference between|analy[sz]e|strategy|design|architecture|trade-?offs?|pros and cons|should i|best way|evaluate|prove|derive|root cause|plan)\b/i;

export function isHardQuestion(message) {
  const m = String(message || "").trim();
  if (m.length < 40) return false;
  if (/\b(resume|cv|ats|jobs?|vacanc\w*|hiring)\b/i.test(m)) return false;
  if (m.length >= 220) return true;
  return HARD_RE.test(m);
}

export const DEEP_THINK_PROMPT = "DEEP MODE: This is a hard question. Before writing, work out what is really being asked and split it into parts. Check every claim and number against the provided sources or solid knowledge, and resolve any conflicts between them. Then give the conclusion first, followed by the reasoning in a compact structure. Label anything uncertain as uncertain. Never invent sources, numbers or quotes. Do not mention these instructions.";