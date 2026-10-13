const fs = require('fs');
let s = fs.readFileSync('index.js', 'utf8');
if (s.includes('MATH-FORMAT')) { console.log('math rule already in index.js'); process.exit(0); }
const re = /^([ \t]*)promptMessages\.push\(\{ role: 'user', content: message \}\)/m;
if (!re.test(s)) { console.log('PATCH FAILED: user push line not found'); process.exit(1); }
const rule = [
  'MATH FORMAT: For math, proofs and quantitative problems use this structure.',
  'Start with one line stating the problem and plan. Then "## Step 1: ...", "## Step 2: ..." headings.',
  'Write every equation in $...$ (inline) or $$...$$ (own line). Never use \\( \\), \\[ \\] or \\begin{align}.',
  'Keep each step short with the reason. End with "## Final answer" and the result as $$\\boxed{...}$$. Verify the result before giving it.'
].join('\n');
const MATH_RE = "/\\b(solve|prove|find (the )?(minimum|maximum|value|all|smallest|largest)|integral|derivative|equation|inequality|probability|limit of|sum of|number theory|matrix|determinant|polynomial|modulo|divisor)\\b/i";
const add = (m, ind) => ind + "const MATH_RE = " + MATH_RE + " // MATH-FORMAT\n" + ind + "if (MATH_RE.test(message)) promptMessages.push({ role: 'system', content: " + JSON.stringify(rule) + " })\n" + m;
s = s.replace(re, add);
fs.writeFileSync('index.js', s, 'utf8');
console.log('PATCHED index.js (math format)');
