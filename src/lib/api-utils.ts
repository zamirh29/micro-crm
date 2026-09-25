import { NextResponse } from "next/server"
import type { ZodType } from "zod"
import { PlanLimitError } from "@/lib/limits"

export function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status })
}

export async function readJson<T>(
  request: Request,
  schema: ZodType<T>
): Promise<{ ok: true; data: T } | { ok: false; response: NextResponse }> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return { ok: false, response: jsonError("Invalid JSON body", 400) }
  }

  const result = schema.safeParse(body)
  if (!result.success) {
    const issue = result.error.issues[0]
    const where = issue.path.length > 0 ? `${issue.path.join(".")}: ` : ""
    return { ok: false, response: jsonError(`${where}${issue.message}`, 400) }
  }

  return { ok: true, data: result.data }
}

export function errorFromThrown(err: unknown): NextResponse {
  if (err instanceof PlanLimitError) {
    return jsonError(err.message, 403)
  }
  if (err instanceof Error) {
    if (/not found$/.test(err.message)) {
      return jsonError(err.message, 404)
    }
    return jsonError(err.message, 400)
  }
  return jsonError("Unexpected error", 500)
}
