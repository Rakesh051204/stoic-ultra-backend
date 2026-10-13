// lib/searchGate.js - true when a message is personal chat, creative writing, a rewrite or a question about Stoic itself, i.e. no web search needed.
const PERSONAL_RE = /\b(i feel|i am feeling|i'?m feeling|im feeling|feeling (low|down|sad|tired|lonely|stressed|bored)|i'?m (so |really |very )?(sad|tired|bored|lonely|stressed|scared|upset|lost)|im (so |really |very )?(sad|tired|bored|lonely|stressed|scared|upset|lost)|cheer me up|motivate me|talk to me|i need (someone|a friend)|tell me a joke|how are you|good (morning|night|evening)|i love you|be my friend)\b/i;
const ADVICE_RE = /\b((give me|need|want) (some )?(advice|motivation|encouragement)|i (don'?t|dont) know what to do)\b/i;
const IDENTITY_RE = /\b(who (are|made|created|built|trained) you|what('?s| is) your name|what can you do|are you (real|alive|human|an? ai|conscious|sad|happy)|do you (have feelings|feel|get tired|get lonely))\b/i;
const CREATIVE_RE = /^\s*(please\s+)?(write|compose|make up)\b.*\b(poem|story|song|joke|haiku|riddle|speech|toast|caption)\b/i;
const REWRITE_RE = /^\s*(please\s+)?(translate|rewrite|rephrase|paraphrase|proofread|correct my grammar)\b/i;
const THANKS_RE = /^\s*(thanks|thank you|thx|ok|okay|cool|nice|great|got it|alright)\W*$/i;

export function skipSearch(message) {
  const m = String(message || '');
  return PERSONAL_RE.test(m) || ADVICE_RE.test(m) || IDENTITY_RE.test(m) || CREATIVE_RE.test(m) || REWRITE_RE.test(m) || THANKS_RE.test(m);
}