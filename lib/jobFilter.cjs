const BAD  = /\b(senior|sr\.?|lead|staff|principal|manager|head|director|vp|architect|II|III|IV)\b/i;
const GOOD = /\b(junior|jr\.?|associate|graduate|grad|entry[- ]level|intern|internship|trainee|fresher|apprentice|early career|new grad)\b/i;
const MANY_YEARS = /\b([2-9]|\d{2})\+?\s*(years|yrs)\b/i;
const DIRECT = /(greenhouse\.io|lever\.co|ashbyhq\.com|workable\.com|smartrecruiters\.com|myworkdayjobs\.com|wellfound\.com\/.*jobs|\/jobs?\/|\/apply|\/positions?\/|\/openings?\/)/i;
const GENERIC = /\/(careers?|jobs?)\/?$/i;

// jobs: [{title, company, location, url, description?, posted?}]
function filterJobs(jobs = [], { fresher = true } = {}) {
  const seen = new Set();
  return jobs.filter(j => {
    if (!j || !j.url || !j.title) return false;
    if (!DIRECT.test(j.url) || GENERIC.test(j.url)) return false;
    if (fresher) {
      if (BAD.test(j.title)) return false;
      if (!GOOD.test(j.title) && MANY_YEARS.test(j.description || "")) return false;
    }
    const key = `${j.company}|${j.title}|${j.location}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Use in your cache key so every day/search is fresh
const jobCacheKey = (q, level, loc) =>
  [q, level, loc, new Date().toISOString().slice(0, 10)].join("|").toLowerCase();

module.exports = { filterJobs, jobCacheKey };
