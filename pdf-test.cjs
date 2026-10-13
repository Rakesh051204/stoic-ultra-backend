const fs = require('fs');
const { pdfToText } = require('./lib/pdfText.cjs');
const { cleanResume } = require('./lib/cleanResume.cjs');
(async () => {
  const p = process.argv[2];
  if (!p) { console.log('no pdf path'); return; }
  const t = await pdfToText(fs.readFileSync(p));
  console.log('PDF:', p);
  console.log('chars:', t.length);
  console.log('first 400:', t.slice(0, 400));
  console.log('after cleanResume chars:', cleanResume(t).length);
})().catch(e => console.error('FAILED:', e.message));
