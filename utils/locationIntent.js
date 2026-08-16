// utils/locationIntent.js
// Detects if a user query needs live map / location data.

const NEAR_ME_PATTERNS = /\b(near me|nearby|close by|around here|around me)\b/i;
const CATEGORY_MAP = {
  restaurant: /restaurants?|food|eat|dinner|lunch/i,
  cafe: /cafes?|coffee/i,
  hospital: /hospitals?|clinics?|doctor/i,
  atm: /\batms?\b|cash machine/i,
  pharmacy: /pharmac(y|ies)|medical store|chemist/i,
  fuel: /petrol|gas station|fuel/i,
};

const PLACE_QUERY_PATTERNS = /\b(where is|directions to|map of|show me|located)\b/i;

export function detectLocationIntent(message) {
  const isNearMe = NEAR_ME_PATTERNS.test(message);

  let category = null;
  for (const [key, pattern] of Object.entries(CATEGORY_MAP)) {
    if (pattern.test(message)) {
      category = key;
      break;
    }
  }

  const isPlaceQuery = PLACE_QUERY_PATTERNS.test(message) && !isNearMe;

  return {
    needsMap: isNearMe || isPlaceQuery,
    isNearMe,
    category: category || 'restaurant', // default category for "near me"
    isPlaceQuery,
  };
}