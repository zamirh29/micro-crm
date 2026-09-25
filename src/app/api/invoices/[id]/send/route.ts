import { NextResponse } from "next/server"
import { requireApiUser } from "@/lib/api-auth"
import { errorFromThrown } from "@/lib/api-utils"
import { sendInvoiceRecord } from "@/lib/documents"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiUser(request)
  if (!auth.ok) return auth.response

  const { id } = await params

  try {
    const invoice = await sendInvoiceRecord(auth.supabase, {
      userId: auth.user.id,
      id,
    })
    return NextResponse.json({ invoice })
  } catch (err) {
    return errorFromThrown(err)
  }
}
