const MATH_PROMPT = `For math: start with a one-line plan, then use "## Step N: title" headings.
Write every equation in $...$ (inline) or $$...$$ (own line). Never use \\( \\) or \\begin{align}.
End with "## Final answer" and put the result in $$\\boxed{...}$$.`;

const RESUME_PROMPT = `Resume review format (use markdown tables):
1. "Estimated ATS score: X/100" and a table: Category | Score | Comment
   (Formatting, Keywords, Projects, Experience, Role fit)
2. What is strong (3-5 points)
3. What is holding the score back: priority High/Medium/Low, quote the exact line, give a suggested rewrite
4. Top 6 changes table: Priority | Change | Why it helps
5. Ask target role and experience level.
Say the score is an estimate, not from a real ATS. Never invent skills the resume does not list.`;

const JOBS_PROMPT = `User is a fresher (0-1 year experience). Use ONLY the jobs provided.
Group by region (Finland/Europe, Remote, Asia, US/Canada). Table: Role | Company | Country | Experience | Apply link | Posted.
Every row needs a direct apply URL. Do not repeat jobs shown earlier in this chat. If fewer than requested, say so honestly.`;

module.exports = { MATH_PROMPT, RESUME_PROMPT, JOBS_PROMPT };
