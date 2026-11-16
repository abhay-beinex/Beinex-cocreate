// Client-side file text extraction for chat attachments and knowledge uploads (supports PDF and plain text).

export type ReadFileOpts = {
  maxTextBytes?: number
  maxPdfBytes?: number
}

const isPdf = (file: File) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name)

const looksBinary = (text: string): boolean => {
  if (!text) return false
  if (text.includes('\u0000')) return true
  const sample = text.slice(0, 4000)
  let bad = 0
  for (let i = 0; i < sample.length; i++) {
    const code = sample.charCodeAt(i)
    if (code === 0xfffd || (code < 32 && code !== 9 && code !== 10 && code !== 13)) bad++
  }
  return bad / sample.length > 0.05
}

let workerReady = false

async function extractPdfText(buffer: ArrayBuffer, fileName: string): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  if (!workerReady) {
    const { default: workerSrc } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
    pdfjs.GlobalWorkerOptions.workerSrc = workerSrc
    workerReady = true
  }

  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer) })
  let doc: Awaited<typeof loadingTask.promise> | null = null
  try {
    doc = await loadingTask.promise
    const pages: string[] = []
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p)
      const content = await page.getTextContent()
      let pageText = ''
      let lastY: number | null = null
      for (const item of content.items) {
        if (!('str' in item)) continue
        const y = Array.isArray(item.transform) ? item.transform[5] : null
        if (lastY !== null && y !== null && Math.abs(y - lastY) > 2 && pageText && !pageText.endsWith('\n')) {
          pageText += '\n'
        }
        pageText += item.str
        if (item.hasEOL) pageText += '\n'
        else if (item.str && !item.str.endsWith(' ')) pageText += ' '
        if (y !== null) lastY = y
      }
      const trimmed = pageText.trim()
      if (trimmed) pages.push(doc.numPages > 1 ? `[Page ${p}]\n${trimmed}` : trimmed)
    }
    const text = pages.join('\n\n').trim()
    if (!text) {
      throw new Error(`"${fileName}" has no selectable text (it may be a scanned PDF).`)
    }
    return text
  } catch (err: any) {
    if (err?.name === 'PasswordException') {
      throw new Error(`"${fileName}" is password-protected and cannot be read.`)
    }
    if (err instanceof Error && err.message.includes('selectable text')) throw err
    throw new Error(`Could not read PDF "${fileName}": ${err?.message ?? 'invalid or corrupted file'}`)
  } finally {
    await doc?.cleanup().catch(() => {})
    await loadingTask.destroy().catch(() => {})
  }
}

/** Extracts readable text from a PDF or text-based file, throwing a user-facing error if unsupported or unreadable. */
export async function readFileText(file: File, opts: ReadFileOpts = {}): Promise<string> {
  const maxTextBytes = opts.maxTextBytes ?? 1_500_000
  const maxPdfBytes = opts.maxPdfBytes ?? 10_000_000
  const pdf = isPdf(file) || (await file.slice(0, 5).text()) === '%PDF-'

  if (pdf) {
    if (file.size > maxPdfBytes) {
      throw new Error(`${file.name} is over ${Math.round(maxPdfBytes / 1_000_000)} MB.`)
    }
    return extractPdfText(await file.arrayBuffer(), file.name)
  }

  if (file.size > maxTextBytes) {
    throw new Error(`${file.name} is over ${(maxTextBytes / 1_000_000).toFixed(1).replace(/\.0$/, '')} MB. Paste the relevant part instead.`)
  }

  const text = await file.text()
  if (looksBinary(text)) {
    throw new Error(`"${file.name}" is not a supported text or PDF file.`)
  }
  return text
}
