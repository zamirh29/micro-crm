import { NextResponse } from "next/server"
import { z } from "zod"
import { requireApiUser } from "@/lib/api-auth"
import { readJson, errorFromThrown } from "@/lib/api-utils"
import { isProUser } from "@/lib/pro"

const createSchema = z.object({
  report_type: z.enum(["sales", "month_end"]).default("sales"),
  frequency: z.enum(["daily", "weekly", "monthly"]).default("daily"),
  day_of_week: z.number().int().min(0).max(6).nullish(),
  day_of_month: z.number().int().min(1).max(28).nullish(),
  email: z
    .string()
    .trim()
    .refine(
      (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
      "Enter a valid email address"
    ),
})

export async function GET(request: Request) {
  const auth = await requireApiUser(request)
  if (!auth.ok) return auth.response

  if (!(await isProUser(auth.supabase, auth.user.id))) {
    return NextResponse.json(
      { error: "Automated report emails are a Pro feature" },
      { status: 403 }
    )
  }

  const { data: subscriptions, error } = await auth.supabase
    .from("report_subscriptions")
    .select("*")
    .eq("org_id", auth.orgId)
    .order("created_at")

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ subscriptions: subscriptions ?? [] })
}

export async function POST(request: Request) {
  const auth = await requireApiUser(request)
  if (!auth.ok) return auth.response

  if (!(await isProUser(auth.supabase, auth.user.id))) {
    return NextResponse.json(
      { error: "Automated report emails are a Pro feature" },
      { status: 403 }
    )
  }

  const parsed = await readJson(request, createSchema)
  if (!parsed.ok) return parsed.response

  const { report_type: reportType, email } = parsed.data
  const frequency = reportType === "month_end" ? "monthly" : parsed.data.frequency

  const dayOfWeek =
    reportType === "sales" && frequency === "weekly"
      ? (parsed.data.day_of_week ?? 1)
      : null
  const dayOfMonth =
    reportType === "sales" && frequency === "monthly"
      ? (parsed.data.day_of_month ?? 1)
      : null

  try {
    const { data: subscription, error } = await auth.supabase
      .from("report_subscriptions")
      .insert({
        org_id: auth.orgId,
        created_by: auth.user.id,
        report_type: reportType,
        frequency,
        day_of_week: dayOfWeek,
        day_of_month: dayOfMonth,
        email,
        enabled: true,
      })
      .select("*")
      .single()

    if (error) throw new Error(error.message)

    return NextResponse.json({ subscription }, { status: 201 })
  } catch (err) {
    return errorFromThrown(err)
  }
}
