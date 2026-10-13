const fs = require('fs');
const p = 'routes/upload.js';
let src = fs.readFileSync(p, 'utf8');
const start = src.indexOf('let _pdfParseFn = null;');
const imp = src.indexOf("import mammoth from 'mammoth';");
const end = src.lastIndexOf('\n//', imp);
if (start < 0 || imp < 0 || end < start) { console.log('PATCH FAILED: markers not found'); process.exit(1); }
const NEW = `let _pdfParseFn = null;
async function getPdfParseFn() {
  if (_pdfParseFn) return _pdfParseFn;
  const mod = await import('pdf-parse');
  if (mod.PDFParse) {
    _pdfParseFn = async (buf) => {
      const parser = new mod.PDFParse({ data: new Uint8Array(buf) });
      try {
        const r = await parser.getText();
        return { text: r.text || '', numpages: r.total || 0 };
      } finally { try { await parser.destroy(); } catch {} }
    };
    return _pdfParseFn;
  }
  const fn = typeof mod.default === 'function' ? mod.default : mod;
  if (typeof fn === 'function') { _pdfParseFn = fn; return fn; }
  throw new Error('pdf-parse: unsupported export shape');
}
`;
src = src.slice(0, start) + NEW + src.slice(end);
fs.writeFileSync(p, src, 'utf8');
console.log('PATCHED upload.js');
