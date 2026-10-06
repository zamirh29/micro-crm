import { NextResponse } from "next/server"
import { z } from "zod"
import { requireApiUser } from "@/lib/api-auth"
import { jsonError } from "@/lib/api-utils"
import { canEditDocuments } from "@/lib/subscription"
import {
  parseCsv,
  parseXlsx,
  autoDetectColumns,
  buildDrafts,
  formToTable,
  isFormTable,
  IMPORT_FIELDS,
  type ColumnMap,
  type ImportKind,
} from "@/lib/import/parse"

// Uploads are parsed in memory, and the hosting platform drops any request over
// roughly 4MB with an opaque 413. Measured in production: 4MB reached the app,
// 4.4MB did not. Enforcing the same ceiling here means the app refuses with a
// readable message instead of the platform failing the request. The client
// splits a folder across several requests to stay under this.
const MAX_REQUEST_BYTES = 3.5 * 1024 * 1024

// A directory drop can pick up hundreds of files, so bound the batch as well as
// each individual file.
const MAX_FILES = 200
const MAX_BYTES = MAX_REQUEST_BYTES
const MAX_TOTAL_BYTES = MAX_REQUEST_BYTES

// Rows kept per file. Drafts are built from exactly this many rows so the
// returned grid and the preview can never disagree: re-parsing a corrected
// column map then still sees every row the user was shown.
//
// Capped well below what a 10k-row grid would weigh, because re-parsing posts
// that grid back as JSON and a wide sheet can otherwise approach the request
// ceiling on its own.
const MAX_ROWS = 5000

// The client re-posts the stored grid to change the column mapping, so this
// ceiling has to comfortably exceed MAX_ROWS for the worst single file.
const MAX_GRID_ROWS = MAX_ROWS + 100

const ALLOWED_EXTENSIONS = [".xlsx", ".xlsm", ".csv"]

/** One decimal place, so a 3.5MB limit is not reported as "3MB". */
function megabytes(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1).replace(/\.0$/, "")
}

const reparseSchema = z.object({
  kind: z.enum(["invoice", "quote"]),
  map: z.record(z.string(), z.number().int().nonnegative()),
  inPence: z.boolean(),
  sourceFile: z.string().max(255).optional(),
  grid: z.array(z.array(z.string())).max(MAX_GRID_ROWS),
})

/** One spreadsheet's worth of parsed state, returned per uploaded file. */
interface ParsedSheet {
  /** Stable within a response so the client can key rows without collisions. */
  id: number
  fileName: string
  headers: string[]
  drafts: ReturnType<typeof buildDrafts>["drafts"]
  autoDetected: ColumnMap
  grid: string[][]
  /** True when the file had more rows than MAX_ROWS and the tail was dropped. */
  truncated: boolean
}

export async function POST(request: Request) {
  const auth = await requireApiUser(request)
  if (!auth.ok) return auth.response

  // Import creates documents, so it follows the same edit gate as everything else.
  const allowed = await canEditDocuments(auth.supabase, auth.user)
  if (!allowed) {
    return jsonError(
      "Importing historical invoices and quotes is a Pro feature",
      403
    )
  }

  const contentType = request.headers.get("content-type") ?? ""

  // Second call: re-shape an already-uploaded grid with a corrected column map.
  if (contentType.includes("application/json")) {
    // A wide sheet at MAX_ROWS can approach the platform ceiling as JSON, which
    // would fail with an opaque 413, so refuse it here where we can explain.
    const declared = Number(request.headers.get("content-length") ?? 0)
    if (declared > MAX_REQUEST_BYTES) {
      return jsonError(
        "That file is too wide or too long to re-map. Split it into smaller spreadsheets.",
        400
      )
    }

    const parsed = reparseSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return jsonError("Invalid re-parse request", 400)

    const { kind, grid, inPence } = parsed.data
    const map = sanitizeMap(parsed.data.map)
    const { drafts, headers } = buildDrafts(grid, {
      kind,
      map,
      // A converted form is already major units, whatever the toggle says.
      inPence: isFormTable(grid) ? false : inPence,
      sourceFile: parsed.data.sourceFile,
    })

    return NextResponse.json({ headers, drafts, autoDetected: autoDetectColumns(headers) })
  }

  // First call: parse the uploaded files. A directory drop posts every file
  // under the same field name, with the single-file picker posting one.
  const form = await request.formData()
  const kind = (form.get("kind") as ImportKind | null) ?? "invoice"
  const inPence = form.get("inPence") === "true"

  if (kind !== "invoice" && kind !== "quote") {
    return jsonError("Invalid document type", 400)
  }

  const files = form
    .getAll("files")
    .filter((entry): entry is File => entry instanceof File)
  const single = form.get("file")
  const uploads = files.length > 0 ? files : single instanceof File ? [single] : []

  if (uploads.length === 0) {
    return jsonError("No file uploaded", 400)
  }
  if (uploads.length > MAX_FILES) {
    return jsonError(`Please upload ${MAX_FILES} files or fewer at a time`, 400)
  }

  let totalBytes = 0
  for (const file of uploads) {
    if (file.size > MAX_BYTES) {
      return jsonError(
        `${file.name} is too large (${(file.size / 1024 / 1024).toFixed(1)}MB, limit is ${megabytes(MAX_BYTES)}MB). Split it into smaller files.`,
        400
      )
    }
    const name = file.name.toLowerCase()
    if (!ALLOWED_EXTENSIONS.some((ext) => name.endsWith(ext))) {
      return jsonError(`${file.name} is not an .xlsx or .csv file`, 400)
    }
    totalBytes += file.size
  }
  if (totalBytes > MAX_TOTAL_BYTES) {
    return jsonError(
      "That selection is too large for one upload. Try fewer files at a time.",
      400
    )
  }

  const sheets: ParsedSheet[] = []
  const rejected: { fileName: string; reason: string }[] = []

  for (const [id, file] of uploads.entries()) {
    const name = file.name.toLowerCase()

    let grid: string[][]
    try {
      const buffer = await file.arrayBuffer()
      const raw = name.endsWith(".csv")
        ? parseCsv(new TextDecoder().decode(buffer))
        : await parseXlsx(buffer)
      // A printed form has no columns to detect, so it is rewritten into a
      // table first and then handled exactly like every other upload.
      grid = formToTable(raw) ?? raw
    } catch (e) {
      // One unreadable file must not abandon the rest of the directory, so it
      // is collected and reported alongside the files that did parse.
      rejected.push({
        fileName: file.name,
        reason: e instanceof Error ? e.message : "Could not read that file",
      })
      continue
    }

    if (grid.length < 2) {
      rejected.push({
        fileName: file.name,
        reason: "No data rows below the header",
      })
      continue
    }

    const truncated = grid.length > MAX_ROWS
    const usedGrid = truncated ? grid.slice(0, MAX_ROWS) : grid
    const headers = (usedGrid[0] ?? []).map((h) => h.trim())
    const autoDetected = autoDetectColumns(headers)

    sheets.push({
      id,
      fileName: file.name,
      headers,
      // Drafted per file: see buildDrafts for why numbers are not merged across
      // files.
      drafts: buildDrafts(usedGrid, {
        kind,
        map: autoDetected,
        // A converted form is already major units, whatever the toggle says.
        inPence: isFormTable(usedGrid) ? false : inPence,
        sourceFile: file.name,
      }).drafts,
      autoDetected,
      grid: usedGrid,
      truncated,
    })
  }

  if (sheets.length === 0) {
    const detail = rejected[0]?.reason ?? "That file has a header row but no data rows"
    return jsonError(`Nothing could be imported: ${detail}`, 400)
  }

  return NextResponse.json({ sheets, rejected })
}

/** Drop unknown field names and out-of-range column indexes. */
function sanitizeMap(raw: Record<string, number>): ColumnMap {
  const allowed = new Set<string>(IMPORT_FIELDS)
  const out: ColumnMap = {}

  for (const [field, index] of Object.entries(raw)) {
    if (!allowed.has(field)) continue
    if (!Number.isInteger(index) || index < 0) continue
    out[field as keyof ColumnMap] = index
  }

  return out
}