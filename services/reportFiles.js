import ExcelJS from 'exceljs'
import PDFDocument from 'pdfkit'
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, ExternalHyperlink, PageOrientation } from 'docx'

const ascii = (s = '') => String(s).replace(/[^\x20-\x7E]/g, ' ').replace(/\s+/g, ' ').trim()

export async function toXlsx(r) {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Jobs')
  ws.columns = [
    { header: '#', key: 'n', width: 5 }, { header: 'Company', key: 'company', width: 24 },
    { header: 'Role (click to apply)', key: 'title', width: 50 }, { header: 'Location', key: 'location', width: 30 },
    { header: 'Source', key: 'source', width: 22 }, { header: 'Posted', key: 'posted', width: 12 },
    { header: 'Apply link', key: 'url', width: 60 },
  ]
  ws.getRow(1).font = { bold: true }
  ws.views = [{ state: 'frozen', ySplit: 1 }]
  r.rows.forEach((x) => {
    const row = ws.addRow({ n: x.n, company: x.company, title: { text: x.title, hyperlink: x.url }, location: x.location, source: x.source, posted: x.posted, url: x.url })
    row.getCell('title').font = { color: { argb: 'FF0563C1' }, underline: true }
  })
  ws.autoFilter = 'A1:G' + (r.rows.length + 1)
  return Buffer.from(await wb.xlsx.writeBuffer())
}

const txt = (t, o = {}) => new TextRun({ text: String(t == null ? '' : t), size: 18, ...o })
const link = (t, url) => new ExternalHyperlink({ link: url, children: [new TextRun({ text: String(t), size: 18, color: '0563C1', underline: {} })] })
const cell = (children) => new TableCell({ children: [new Paragraph({ children })] })

export async function toDocx(r) {
  const head = ['#', 'Company', 'Role (apply link)', 'Location', 'Source', 'Posted']
  const rows = [new TableRow({ tableHeader: true, children: head.map((h) => cell([txt(h, { bold: true })])) })]
  r.rows.forEach((x) => rows.push(new TableRow({ children: [cell([txt(x.n)]), cell([txt(x.company)]), cell([link(x.title, x.url)]), cell([txt(x.location)]), cell([txt(x.source)]), cell([txt(x.posted)])] })))
  const doc = new Document({
    sections: [{
      properties: { page: { size: { orientation: PageOrientation.LANDSCAPE } } },
      children: [
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: r.title })] }),
        new Paragraph({ children: [new TextRun({ text: 'Search checked: ' + r.checkedAt + '  |  Rows in this report: ' + r.rows.length, bold: true })] }),
        new Paragraph({ children: [new TextRun({ text: r.note, italics: true })], spacing: { before: 120, after: 120 } }),
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: 'Summary' })] }),
        new Paragraph({ children: [new TextRun({ text: r.summary })], spacing: { after: 200 } }),
        new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows }),
      ],
    }],
  })
  return Packer.toBuffer(doc)
}

export function toPdf(r) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' })
    const bufs = []
    doc.on('data', (b) => bufs.push(b))
    doc.on('end', () => resolve(Buffer.concat(bufs)))
    doc.on('error', reject)
    doc.font('Helvetica-Bold').fontSize(16).fillColor('#000').text(ascii(r.title))
    doc.moveDown(0.4).font('Helvetica-Bold').fontSize(9).text('Search checked: ' + r.checkedAt + '  |  Rows in this report: ' + r.rows.length)
    doc.moveDown(0.4).font('Helvetica-Oblique').fontSize(8.5).fillColor('#555').text(ascii(r.note))
    doc.moveDown(0.6).font('Helvetica-Bold').fontSize(12).fillColor('#000').text('Summary')
    doc.font('Helvetica').fontSize(9.5).text(ascii(r.summary))
    doc.moveDown(0.8)
    r.rows.forEach((x) => {
      doc.font('Helvetica').fontSize(9.5).fillColor('#000').text(x.n + '. ' + ascii(x.company) + '  -  ', { continued: true })
      doc.fillColor('#1a56db').text(ascii(x.title), { link: x.url, underline: true, continued: true })
      doc.fillColor('#555').text('   ' + ascii(x.location) + '  |  ' + ascii(x.source) + '  |  ' + x.posted, { underline: false })
      doc.fontSize(7).fillColor('#888').text(x.url, { link: x.url })
      doc.moveDown(0.5)
    })
    doc.end()
  })
}