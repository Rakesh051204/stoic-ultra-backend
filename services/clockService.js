const C = {
  'new york': ['New York', 'America/New_York', 40.7128, -74.006, 'New_York_City'],
  chicago: ['Chicago', 'America/Chicago', 41.8781, -87.6298, 'Chicago'],
  denver: ['Denver', 'America/Denver', 39.7392, -104.9903, 'Denver'],
  'los angeles': ['Los Angeles', 'America/Los_Angeles', 34.0522, -118.2437, 'Los_Angeles'],
  toronto: ['Toronto', 'America/Toronto', 43.6532, -79.3832, 'Toronto'],
  vancouver: ['Vancouver', 'America/Vancouver', 49.2827, -123.1207, 'Vancouver'],
  'mexico city': ['Mexico City', 'America/Mexico_City', 19.4326, -99.1332, 'Mexico_City'],
  'sao paulo': ['Sao Paulo', 'America/Sao_Paulo', -23.5505, -46.6333, 'S%C3%A3o_Paulo'],
  london: ['London', 'Europe/London', 51.5072, -0.1276, 'London'],
  paris: ['Paris', 'Europe/Paris', 48.8566, 2.3522, 'Paris'],
  berlin: ['Berlin', 'Europe/Berlin', 52.52, 13.405, 'Berlin'],
  helsinki: ['Helsinki', 'Europe/Helsinki', 60.1699, 24.9384, 'Helsinki'],
  moscow: ['Moscow', 'Europe/Moscow', 55.7558, 37.6173, 'Moscow'],
  cairo: ['Cairo', 'Africa/Cairo', 30.0444, 31.2357, 'Cairo'],
  johannesburg: ['Johannesburg', 'Africa/Johannesburg', -26.2041, 28.0473, 'Johannesburg'],
  dubai: ['Dubai', 'Asia/Dubai', 25.2048, 55.2708, 'Dubai'],
  delhi: ['Delhi', 'Asia/Kolkata', 28.6139, 77.209, 'Delhi'],
  mumbai: ['Mumbai', 'Asia/Kolkata', 19.076, 72.8777, 'Mumbai'],
  chennai: ['Chennai', 'Asia/Kolkata', 13.0827, 80.2707, 'Chennai'],
  singapore: ['Singapore', 'Asia/Singapore', 1.3521, 103.8198, 'Singapore'],
  beijing: ['Beijing', 'Asia/Shanghai', 39.9042, 116.4074, 'Beijing'],
  seoul: ['Seoul', 'Asia/Seoul', 37.5665, 126.978, 'Seoul'],
  tokyo: ['Tokyo', 'Asia/Tokyo', 35.6762, 139.6503, 'Tokyo'],
  sydney: ['Sydney', 'Australia/Sydney', -33.8688, 151.2093, 'Sydney'],
  brisbane: ['Brisbane', 'Australia/Brisbane', -27.4698, 153.0251, 'Brisbane'],
  perth: ['Perth', 'Australia/Perth', -31.9505, 115.8605, 'Perth'],
  auckland: ['Auckland', 'Pacific/Auckland', -36.8509, 174.7645, 'Auckland'],
  wellington: ['Wellington', 'Pacific/Auckland', -41.2866, 174.7756, 'Wellington'],
}

const GROUPS = [
  [['america', 'usa', 'united states', 'american', /\b(in|of|for)\s+(the\s+)?(us|u\.s\.)(?![a-z])/i], ['new york', 'chicago', 'denver', 'los angeles']],
  [['new zealand', 'new zeland', 'nz'], ['auckland', 'wellington']],
  [['australia'], ['sydney', 'brisbane', 'perth']],
  [['canada'], ['toronto', 'vancouver']],
  [['india'], ['delhi', 'chennai']],
  [['uk', 'britain', 'england', 'united kingdom'], ['london']],
  [['japan'], ['tokyo']],
  [['china'], ['beijing']],
  [['korea'], ['seoul']],
  [['uae', 'emirates'], ['dubai']],
  [['germany'], ['berlin']],
  [['france'], ['paris']],
  [['russia'], ['moscow']],
  [['finland'], ['helsinki']],
  [['brazil'], ['sao paulo']],
  [['mexico'], ['mexico city']],
  [['south africa'], ['johannesburg']],
  [['egypt'], ['cairo']],
  [['nyc'], ['new york']],
]

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s*')
const toRx = (a) => (a instanceof RegExp ? a : new RegExp('\\b' + esc(a) + '\\b', 'i'))
const ENTRIES = [...GROUPS, ...Object.keys(C).map((k) => [[k], [k]])].map(([al, keys]) => [al.map(toRx), keys])

const TIME_RE = /\b(times?|clocks?|time\s*zones?|timezones?)\b/i
const NOT_TIME_RE = /\b(time\s+complexity|time\s+management|real[\s-]?time|part[\s-]?time|full[\s-]?time|first\s+time|last\s+time|next\s+time|one\s+time|long\s+time|spend\s+time|waste\s+time|new\s+york\s+times)\b/i

export function wantsClocks(message = '') {
  return TIME_RE.test(message) && !NOT_TIME_RE.test(message)
}

export function detectClocks(message = '') {
  if (!wantsClocks(message)) return []
  const hits = []
  for (const [rxs, keys] of ENTRIES) {
    let best = -1
    for (const rx of rxs) {
      const m = rx.exec(message)
      if (m && (best < 0 || m.index < best)) best = m.index
    }
    if (best >= 0) hits.push([best, keys])
  }
  hits.sort((a, b) => a[0] - b[0])
  const seen = new Set()
  const out = []
  for (const [, keys] of hits) {
    for (const k of keys) {
      if (seen.has(k) || !C[k]) continue
      seen.add(k)
      const [city, tz, lat, lng, wiki] = C[k]
      out.push({ city, tz, lat, lng, wiki })
    }
  }
  return out.slice(0, 6)
}