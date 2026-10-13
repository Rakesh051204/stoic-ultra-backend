const CITY_TZ = {
  'new york': 'America/New_York', 'chicago': 'America/Chicago', 'denver': 'America/Denver',
  'los angeles': 'America/Los_Angeles', 'san francisco': 'America/Los_Angeles', 'seattle': 'America/Los_Angeles',
  'houston': 'America/Chicago', 'miami': 'America/New_York', 'washington': 'America/New_York',
  'toronto': 'America/Toronto', 'vancouver': 'America/Vancouver', 'mexico city': 'America/Mexico_City',
  'sao paulo': 'America/Sao_Paulo', 'buenos aires': 'America/Argentina/Buenos_Aires',
  'london': 'Europe/London', 'paris': 'Europe/Paris', 'berlin': 'Europe/Berlin', 'helsinki': 'Europe/Helsinki',
  'madrid': 'Europe/Madrid', 'rome': 'Europe/Rome', 'amsterdam': 'Europe/Amsterdam', 'dublin': 'Europe/Dublin',
  'moscow': 'Europe/Moscow', 'istanbul': 'Europe/Istanbul', 'dubai': 'Asia/Dubai', 'riyadh': 'Asia/Riyadh',
  'karachi': 'Asia/Karachi', 'kolkata': 'Asia/Kolkata', 'delhi': 'Asia/Kolkata', 'mumbai': 'Asia/Kolkata',
  'bangalore': 'Asia/Kolkata', 'chennai': 'Asia/Kolkata', 'salem': 'Asia/Kolkata', 'dhaka': 'Asia/Dhaka',
  'colombo': 'Asia/Colombo', 'kathmandu': 'Asia/Kathmandu', 'bangkok': 'Asia/Bangkok', 'singapore': 'Asia/Singapore',
  'kuala lumpur': 'Asia/Kuala_Lumpur', 'jakarta': 'Asia/Jakarta', 'hong kong': 'Asia/Hong_Kong',
  'shanghai': 'Asia/Shanghai', 'beijing': 'Asia/Shanghai', 'tokyo': 'Asia/Tokyo', 'seoul': 'Asia/Seoul',
  'sydney': 'Australia/Sydney', 'melbourne': 'Australia/Melbourne', 'auckland': 'Pacific/Auckland',
  'cairo': 'Africa/Cairo', 'lagos': 'Africa/Lagos', 'nairobi': 'Africa/Nairobi', 'johannesburg': 'Africa/Johannesburg',
}

const COUNTRY = {
  'usa': ['new york', 'chicago', 'denver', 'los angeles'],
  'united states': ['new york', 'chicago', 'denver', 'los angeles'],
  'america': ['new york', 'chicago', 'denver', 'los angeles'],
  'canada': ['toronto', 'vancouver'], 'uk': ['london'], 'britain': ['london'], 'united kingdom': ['london'],
  'india': ['kolkata'], 'finland': ['helsinki'], 'germany': ['berlin'], 'france': ['paris'],
  'japan': ['tokyo'], 'china': ['shanghai'], 'australia': ['sydney', 'melbourne'], 'uae': ['dubai'],
  'russia': ['moscow'], 'brazil': ['sao paulo'],
}

const TIME_RE = /\b(what('s| is)? (the )?(current |local )?time|time (in|at|now|there)|current time|local time|clocks?|what time)\b/i

const hasWord = (text, key) => new RegExp('\\b' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(text)
const pretty = (key) => key.split(' ').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')

export function detectClocks(message = '') {
  if (!TIME_RE.test(message)) return []
  const m = message.toLowerCase()
  const found = []
  const seen = new Set()
  const add = (key) => {
    const tz = CITY_TZ[key]
    if (!tz || seen.has(key)) return
    seen.add(key)
    found.push({ label: pretty(key), tz })
  }
  for (const key of Object.keys(CITY_TZ).sort((a, b) => b.length - a.length)) if (hasWord(m, key)) add(key)
  if (!found.length) for (const [c, cities] of Object.entries(COUNTRY)) if (hasWord(m, c)) cities.forEach(add)
  if (!found.length) add('kolkata')
  return found.slice(0, 6)
}