// Works with pdf-parse v2 (PDFParse class) and v1 (function)
async function pdfToText(buffer) {
  const mod = await import('pdf-parse');
  const PDFParse = mod.PDFParse || (mod.default && mod.default.PDFParse);
  if (PDFParse) {
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const r = await parser.getText();
      return String(r.text || '').trim();
    } finally {
      try { await parser.destroy(); } catch {}
    }
  }
  const fn = typeof mod.default === 'function' ? mod.default : (typeof mod === 'function' ? mod : null);
  if (fn) { const r = await fn(buffer); return String(r.text || '').trim(); }
  throw new Error('pdf-parse: unknown export shape: ' + Object.keys(mod).join(','));
}
module.exports = { pdfToText };
