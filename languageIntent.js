// Maps every alias/spelling users might type to a canonical display name
// used in the prompt sent to Groq (e.g. "re-written entirely in Tamil").
const LANGUAGE_MAP = {
  tamil: 'Tamil', tamizh: 'Tamil',
  english: 'English',
  hindi: 'Hindi',
  telugu: 'Telugu',
  kannada: 'Kannada',
  malayalam: 'Malayalam',
  french: 'French',
  spanish: 'Spanish',
  german: 'German',
  japanese: 'Japanese',
  chinese: 'Chinese', mandarin: 'Chinese',
  arabic: 'Arabic',
  russian: 'Russian',
  portuguese: 'Portuguese',
  bengali: 'Bengali',
  marathi: 'Marathi',
  gujarati: 'Gujarati',
  punjabi: 'Punjabi',
  urdu: 'Urdu',
  korean: 'Korean',
  italian: 'Italian',
};

// Longest keys first so "chinese" matches before any shorter overlapping key would.
const LANG_KEYS_PATTERN = Object.keys(LANGUAGE_MAP)
  .sort((a, b) => b.length - a.length)
  .join('|');

// Covers common phrasings:
//  "explain in tamil", "explain tamil", "reply in hindi", "in french please",
//  "switch to spanish", "translate to german", "tamil la sollu", "hindi mein bolo"
const SWITCH_PATTERNS = [
  new RegExp(`\\b(?:in|to)\\s+(${LANG_KEYS_PATTERN})\\b`, 'i'),
  new RegExp(`\\bexplain\\s+(${LANG_KEYS_PATTERN})\\b`, 'i'),
  new RegExp(`\\b(${LANG_KEYS_PATTERN})\\s+(?:la|ku|il|mein|me)\\b`, 'i'),
  new RegExp(`\\bswitch\\s+to\\s+(${LANG_KEYS_PATTERN})\\b`, 'i'),
  new RegExp(`\\btranslate\\s*(?:to|into)?\\s*(${LANG_KEYS_PATTERN})\\b`, 'i'),
];

// Fallback: if someone just types directly in a non-Latin script with no
// English phrasing at all, detect the language from the script itself.
const SCRIPT_RANGES = {
  Tamil: /[\u0B80-\u0BFF]/,
  Hindi: /[\u0900-\u097F]/,
  Telugu: /[\u0C00-\u0C7F]/,
  Kannada: /[\u0C80-\u0CFF]/,
  Malayalam: /[\u0D00-\u0D7F]/,
  Bengali: /[\u0980-\u09FF]/,
  Arabic: /[\u0600-\u06FF]/,
};

function detectLanguageSwitch(message) {
  if (!message || typeof message !== 'string') {
    return { isLanguageSwitch: false, targetLanguage: null };
  }

  const lower = message.toLowerCase();

  for (const pattern of SWITCH_PATTERNS) {
    const match = lower.match(pattern);
    if (match) {
      const key = match.slice(1).find((g) => g && LANGUAGE_MAP[g.toLowerCase()]);
      if (key) {
        return { isLanguageSwitch: true, targetLanguage: LANGUAGE_MAP[key.toLowerCase()] };
      }
    }
  }

  for (const [lang, regex] of Object.entries(SCRIPT_RANGES)) {
    if (regex.test(message)) {
      return { isLanguageSwitch: true, targetLanguage: lang };
    }
  }

  return { isLanguageSwitch: false, targetLanguage: null };
}

export { detectLanguageSwitch };