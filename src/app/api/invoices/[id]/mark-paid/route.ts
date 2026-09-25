import { NextResponse } from "next/server"
import { requireApiUser } from "@/lib/api-auth"
import { errorFromThrown } from "@/lib/api-utils"
import { markInvoicePaidRecord } from "@/lib/documents"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiUser(request)
  if (!auth.ok) return auth.response

  const { id } = await params

  try {
    const invoice = await markInvoicePaidRecord(auth.supabase, {
      userId: auth.user.id,
      id,
    })
    if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 })
    return NextResponse.json({ invoice })
  } catch (err) {
    return errorFromThrown(err)
  }
}
