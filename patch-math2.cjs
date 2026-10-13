const fs = require('fs');
let s = fs.readFileSync('index.js', 'utf8');
const re = /^[ \t]*if \(MATH_RE\.test\(message\)\) promptMessages\.push\(.*$/m;
if (!re.test(s)) { console.log('PATCH FAILED: math rule line not found'); process.exit(1); }
const rule = [
  'MATH FORMAT (follow exactly, like a textbook solution):',
  'Line 1: "We need to ..." restating the problem, with the key equation on its own line.',
  'Then for each step: a bold line "**Step N: short title**", then 1-2 short sentences, then the equation on its own line.',
  'Use \\( ... \\) for inline math and \\[ ... \\] for every important equation on its own line. Never put math in backticks or code blocks. Never use \\begin{align}; use \\begin{aligned} inside \\[ \\].',
  'Always end with a line "**Answer:**" followed by the final result in \\[ \\boxed{...} \\]. Never leave the answer empty. Check the result with a small example before answering.'
].join('\n');
const line = "if (MATH_RE.test(message)) promptMessages.push({ role: 'system', content: " + JSON.stringify(rule) + " })";
s = s.replace(re, () => line);
fs.writeFileSync('index.js', s, 'utf8');
console.log('PATCHED math rule');
