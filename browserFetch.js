import { chromium } from 'playwright'

let browserInstance = null

async function getBrowser() {
  if (!browserInstance) {
    browserInstance = await chromium.launch({ headless: true })
  }
  return browserInstance
}

export async function renderPage(url, { timeoutMs = 8000 } = {}) {
  const browser = await getBrowser()
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (compatible; StoicBot/1.0)',
  })
  const page = await context.newPage()

  await page.route('**/*', (route) => {
    const type = route.request().resourceType()
    if (['image', 'font', 'media', 'stylesheet'].includes(type)) {
      return route.abort()
    }
    route.continue()
  })

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs })
    const html = await page.content()
    return html
  } finally {
    await page.close()
    await context.close()
  }
}

export async function closeBrowser() {
  if (browserInstance) {
    await browserInstance.close()
    browserInstance = null
  }
}

// ─── PDF Generation ──────────────────────────────────────────────
export async function generatePDF(html, options = {}) {
  const browser = await getBrowser()
  const page = await browser.newPage()
  await page.setContent(html, { waitUntil: 'networkidle' })
  const pdfBuffer = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: '20mm', bottom: '20mm', left: '20mm', right: '20mm' },
    ...options
  })
  // We do NOT close the browser here – we reuse the shared instance.
  // The browser will be closed when closeBrowser() is called.
  await page.close()
  return pdfBuffer
}