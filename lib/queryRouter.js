// lib/queryRouter.js
// Decides: does this query need a NEW search, or just a regeneration
// of the previous answer (translate/shorten/rephrase/change language)?

const LANGUAGE_SWITCH_PATTERNS = [
  /\bexplain\s+(in\s+)?(tamil|hindi|telugu|kannada|malayalam|french|spanish|german|japanese|korean|chinese)\b/i,
  /\bin\s+(tamil|hindi|telugu|kannada|malayalam|french|spanish|german|japanese|korean|chinese)\b/i,
  /\btranslate\s+(this|it|that)?\s*(to|into)\s+\w+/i,
  /\b(tamil|hindi|telugu|kannada|malayalam)\s+(la|ல)?\s*(explain|sollu|solu)/i, // Tanglish patterns
];

const META_INSTRUCTION_PATTERNS = [
  /\b(shorter|shorten|summarize|summarise|in short|briefly)\b/i,
  /\b(simpler|simplify|explain like|eli5)\b/i,
  /\b(rephrase|reword|say it differently)\b/i,
  /\b(more detail|elaborate|expand)\b/i,
];

const LANGUAGE_MAP = {
  tamil: 'Tamil', hindi: 'Hindi', telugu: 'Telugu', kannada: 'Kannada',
  malayalam: 'Malayalam', french: 'French', spanish: 'Spanish',
  german: 'German', japanese: 'Japanese', korean: 'Korean', chinese: 'Chinese',
};

/**
 * @param {string} query - current user message
 * @param {Array} history - prior conversation turns [{role, content}, ...]
 * @returns {{ mode: 'search'|'regenerate', targetLanguage: string|null, reason: string }}
 */
function classifyQuery(query, history = []) {
  const trimmed = query.trim();
  const hasPriorAssistantTurn = history.some(m => m.role === 'assistant');

  // Check for explicit language switch request
  for (const pattern of LANGUAGE_SWITCH_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match && hasPriorAssistantTurn) {
      const langWord = (match[2] || match[1] || '').toLowerCase().trim();
      const targetLanguage = LANGUAGE_MAP[langWord] || null;
      return {
        mode: 'regenerate',
        targetLanguage,
        reason: 'language_switch',
      };
    }
  }

  // Check for meta-instructions on existing answer (no new info needed)
  if (hasPriorAssistantTurn) {
    for (const pattern of META_INSTRUCTION_PATTERNS) {
      if (pattern.test(trimmed)) {
        return {
          mode: 'regenerate',
          targetLanguage: null,
          reason: 'meta_instruction',
        };
      }
    }
  }

  // Very short queries that only make sense as follow-ups to prior context
  // e.g. "can you please explain tamil" with no subject
  const wordCount = trimmed.split(/\s+/).length;
  const hasNoConcreteSubject = !/[A-Z][a-z]{3,}/.test(trimmed.replace(/^(can|please|you|explain|in)\s+/gi, ''));
  if (hasPriorAssistantTurn && wordCount <= 6 && hasNoConcreteSubject) {
    return {
      mode: 'regenerate',
      targetLanguage: null,
      reason: 'short_followup_no_subject',
    };
  }

  return {
    mode: 'search',
    targetLanguage: null,
    reason: 'new_information_need',
  };
}

module.exports = { classifyQuery, LANGUAGE_MAP };
