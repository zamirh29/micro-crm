/**
 * Extract readable text from a text-based (born-digital) PDF.
 *
 * PDF.js hands back individual text runs with their position on the page. This
 * module rebuilds them into lines, inserting a double space wherever the gap
 * between runs is wide enough to be a column. `textToGrid` can then treat the
 * result exactly like spreadsheet rows.
 *
 * A scanned PDF has no text layer. Rather than let the importer report an empty
 * document, that case is refused with a message pointing at the photo option.
 */

/** Pages beyond this are almost never one invoice and would cost real memory. */
const MAX_PAGES = 25

/** Fewer visible characters than this means there is no usable text layer. */
const MIN_TEXT_CHARACTERS = 20

interface PositionedText {
  str: string
  x: number
  y: number
  width: number
  height: number
}

interface PdfTextItem {
  str?: string
  transform?: number[]
  width?: number
  height?: number
}

function toPositioned(item: PdfTextItem): PositionedText | null {
  const str = item.str ?? ""
  const transform = item.transform ?? []
  if (!str.trim()) return null

  const height = Math.abs(transform[3] || item.height || 10) || 10
  const width = item.width ?? str.length * height * 0.5

  return {
    str,
    x: transform[4] ?? 0,
    y: transform[5] ?? 0,
    width: width > 0 ? width : str.length * height * 0.5,
    height,
  }
}

/** Group text runs into visual lines, top of the page first. */
function groupLines(items: PositionedText[]): PositionedText[][] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x)
  const lines: PositionedText[][] = []

  for (const item of sorted) {
    const current = lines[lines.length - 1]
    if (!current) {
      lines.push([item])
      continue
    }

    const reference = current[0]
    const tolerance = Math.max(1.5, Math.min(reference.height, item.height) * 0.45)
    if (Math.abs(reference.y - item.y) <= tolerance) {
      current.push(item)
    } else {
      lines.push([item])
    }
  }

  return lines.map((line) => line.sort((a, b) => a.x - b.x))
}

/**
 * Join one line's runs. Gaps above roughly one em become a column separator;
 * smaller gaps are just the space between words in a sentence.
 */
function joinLine(items: PositionedText[]): string {
  let line = ""
  let previousEnd: number | null = null

  for (const item of items) {
    const text = item.str
    if (!text) continue

    if (!line) {
      line = text.trimStart()
      previousEnd = item.x + item.width
      continue
    }

    const gap = item.x - (previousEnd ?? item.x)
    const unit = Math.max(4, Math.min(item.height, 18))

    if (gap > unit * 1.1) {
      line = `${line.trimEnd()}  ${text.trimStart()}`
    } else if (gap > unit * 0.18 && !/\s$/.test(line) && !/^\s/.test(text)) {
      line = `${line} ${text.trimStart()}`
    } else {
      line += text
    }

    previousEnd = item.x + item.width
  }

  return line.trimEnd()
}

function pdfErrorMessage(error: unknown): string {
  const name = (error as { name?: string } | null)?.name ?? ""
  const message = error instanceof Error ? error.message : ""

  if (name === "PasswordException" || /password/i.test(message)) {
    return "That PDF is password-protected. Remove the password and try again."
  }
  if (name === "InvalidPDFException" || /invalid pdf/i.test(message)) {
    return "That file is not a valid PDF."
  }
  return "Could not read that PDF. Try saving it again, or upload the spreadsheet instead."
}

export async function extractPdfText(data: ArrayBuffer): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs")

  let loading: ReturnType<typeof pdfjs.getDocument> | null = null

  try {
    loading = pdfjs.getDocument({
      data: new Uint8Array(data),
      // The server has no worker file to fetch, no DOM and no canvas. Text
      // extraction needs none of them; disabling the extra work keeps this
      // route cheap and avoids worker setup failures.
      useWorkerFetch: false,
      disableFontFace: true,
      verbosity: 0,
    })
    const document = await loading.promise

    const pageCount = Math.min(document.numPages, MAX_PAGES)
    const lines: string[] = []

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
      const page = await document.getPage(pageNumber)
      const content = await page.getTextContent()
      const positioned = (content.items as PdfTextItem[])
        .map(toPositioned)
        .filter((item): item is PositionedText => item !== null)

      for (const line of groupLines(positioned)) {
        const text = joinLine(line)
        if (text.trim()) lines.push(text)
      }

      page.cleanup()
    }

    const text = lines.join("\n").trim()
    if (text.replace(/\s/g, "").length < MIN_TEXT_CHARACTERS) {
      throw new Error(
        "That PDF has no text layer, so it looks like a scan. Use the photo option to read it, or upload the spreadsheet instead."
      )
    }

    return text
  } catch (error) {
    if (error instanceof Error && error.message.includes("no text layer")) throw error
    throw new Error(pdfErrorMessage(error))
  } finally {
    await loading?.destroy().catch(() => {})
  }
}
