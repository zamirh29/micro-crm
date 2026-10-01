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
  IMPORT_FIELDS,
  type ColumnMap,
  type ImportKind,
} from "@/lib/import/parse"

// Uploads are parsed in memory; keep a ceiling so a huge file cannot exhaust
// the serverless function.
const MAX_BYTES = 10 * 1024 * 1024

const ALLOWED_EXTENSIONS = [".xlsx", ".xlsm", ".csv"]

const reparseSchema = z.object({
  kind: z.enum(["invoice", "quote"]),
  map: z.record(z.string(), z.number().int().nonnegative()),
  inPence: z.boolean(),
  grid: z.array(z.array(z.string())).max(5000),
})

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
    const parsed = reparseSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return jsonError("Invalid re-parse request", 400)

    const { kind, grid, inPence } = parsed.data
    const map = sanitizeMap(parsed.data.map)
    const { drafts, headers } = buildDrafts(grid, { kind, map, inPence })

    return NextResponse.json({
      headers,
      drafts,
      autoDetected: autoDetectColumns(headers),
    })
  }

  // First call: parse the uploaded file.
  const form = await request.formData()
  const file = form.get("file")
  const kind = (form.get("kind") as ImportKind | null) ?? "invoice"

  if (kind !== "invoice" && kind !== "quote") {
    return jsonError("Invalid document type", 400)
  }
  if (!(file instanceof File)) {
    return jsonError("No file uploaded", 400)
  }
  if (file.size > MAX_BYTES) {
    return jsonError("That file is larger than 10MB", 400)
  }

  const name = file.name.toLowerCase()
  if (!ALLOWED_EXTENSIONS.some((ext) => name.endsWith(ext))) {
    return jsonError("Upload an .xlsx or .csv file", 400)
  }

  let grid: string[][]
  try {
    const buffer = await file.arrayBuffer()
    grid = name.endsWith(".csv")
      ? parseCsv(new TextDecoder().decode(buffer))
      : await parseXlsx(buffer)
  } catch (e) {
    return jsonError(
      e instanceof Error ? `Could not read that file: ${e.message}` : "Could not read that file",
      400
    )
  }

  if (grid.length < 2) {
    return jsonError("That file has a header row but no data rows", 400)
  }

  const headers = (grid[0] ?? []).map((h) => h.trim())
  const autoDetected = autoDetectColumns(headers)
  const inPence = form.get("inPence") === "true"
  const { drafts } = buildDrafts(grid, { kind, map: autoDetected, inPence })

  return NextResponse.json({
    headers,
    drafts,
    autoDetected,
    grid: grid.slice(0, 2000),
  })
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