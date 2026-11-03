import { NextResponse } from "next/server"
import { z } from "zod"
import { requireApiUser } from "@/lib/api-auth"
import { jsonError } from "@/lib/api-utils"
import { canEditDocuments } from "@/lib/subscription"
import { autoDetectColumns, buildDrafts } from "@/lib/import/parse"
import { textToGrid } from "@/lib/import/text"

// Photo OCR happens in the browser. Only the recognised text is posted here,
// which keeps a phone photo far below the platform's request ceiling.
const MAX_TEXT_CHARACTERS = 400_000

// Guard against a very long scan turning into a bigger review table than the
// grid endpoint can post back when the user changes a column mapping.
const MAX_ROWS = 5000

const schema = z.object({
  kind: z.enum(["invoice", "quote"]),
  text: z.string().min(1).max(MAX_TEXT_CHARACTERS),
  fileName: z.string().min(1).max(255).optional(),
})

export async function POST(request: Request) {
  const auth = await requireApiUser(request)
  if (!auth.ok) return auth.response

  // Import creates documents, so it follows the same edit gate as uploads.
  const allowed = await canEditDocuments(auth.supabase, auth.user)
  if (!allowed) {
    return jsonError("Importing historical invoices and quotes is a Pro feature", 403)
  }

  const declared = Number(request.headers.get("content-length") ?? 0)
  if (declared > 3.5 * 1024 * 1024) {
    return jsonError("That scan is too large to read. Try one page at a time.", 400)
  }

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return jsonError("Invalid scan request", 400)

  const { kind, text } = parsed.data
  const fileName = parsed.data.fileName ?? "Scanned document"

  let grid: string[][]
  try {
    grid = textToGrid(text, { fallbackNumber: fileName })
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Could not read that scan",
      400
    )
  }

  const truncated = grid.length > MAX_ROWS
  const usedGrid = truncated ? grid.slice(0, MAX_ROWS) : grid
  const headers = (usedGrid[0] ?? []).map((header) => header.trim())
  const autoDetected = autoDetectColumns(headers)

  return NextResponse.json({
    sheets: [
      {
        id: 0,
        fileName,
        headers,
        // Extracted text is always major units: never apply the pence toggle.
        drafts: buildDrafts(usedGrid, {
          kind,
          map: autoDetected,
          inPence: false,
          sourceFile: fileName,
        }).drafts,
        autoDetected,
        grid: usedGrid,
        truncated,
      },
    ],
    rejected: [],
  })
}
