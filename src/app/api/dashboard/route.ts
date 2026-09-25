import { NextResponse } from "next/server"
import { requireApiUser } from "@/lib/api-auth"
import { errorFromThrown } from "@/lib/api-utils"
import { getDashboardData } from "@/lib/dashboard-data"

export async function GET(request: Request) {
  const auth = await requireApiUser(request)
  if (!auth.ok) return auth.response

  try {
    const data = await getDashboardData(auth.supabase, auth.orgId)
    return NextResponse.json(data)
  } catch (err) {
    return errorFromThrown(err)
  }
}
