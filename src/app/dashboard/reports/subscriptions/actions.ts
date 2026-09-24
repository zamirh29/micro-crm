"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

async function requireProContext() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Not signed in")

  const { data: membership } = await supabase
    .from("memberships")
    .select("org_id, role")
    .eq("user_id", user.id)
    .single()
  if (!membership) throw new Error("No organization")

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("status, plan")
    .eq("user_id", user.id)
    .maybeSingle()

  const isPro =
    subscription?.status === "active" || subscription?.status === "trialing"
      ? (subscription.plan ?? "free") === "pro"
      : false
  if (!isPro) throw new Error("Report subscriptions are a Pro feature")

  return { supabase, user, membership }
}

function scheduleFor(
  reportType: string,
  frequency: string,
  dayOfWeek: number | null,
  dayOfMonth: number | null
): string {
  const days = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ]
  if (reportType === "month_end") return "Last day of month"
  if (frequency === "daily") return "Every day"
  if (frequency === "weekly") return `Every ${days[dayOfWeek ?? 0]}`
  const ordinal = ["", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th", "11th", "12th", "13th", "14th", "15th", "16th", "17th", "18th", "19th", "20th", "21st", "22nd", "23rd", "24th", "25th", "26th", "27th", "28th"]
  return `On the ${ordinal[dayOfMonth ?? 1]} of each month`
}

export type AddReportSubscriptionState =
  | { error: string }
  | { success: string }

export async function addReportSubscription(
  _prev: AddReportSubscriptionState | null,
  formData: FormData
): Promise<AddReportSubscriptionState> {
  try {
    const { supabase, user, membership } = await requireProContext()

    const reportType = String(formData.get("report_type") ?? "sales")
    const rawFrequency = String(formData.get("frequency") ?? "daily")
    const email = String(formData.get("email") ?? "").trim()
    const dayOfWeekRaw = formData.get("day_of_week")
    const dayOfMonthRaw = formData.get("day_of_month")

    const frequency =
      reportType === "month_end" ? "monthly" : rawFrequency

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { error: "Enter a valid email address" }
    }

    let dayOfWeek: number | null = null
    let dayOfMonth: number | null = null
    if (reportType === "sales") {
      if (frequency === "weekly") {
        dayOfWeek = dayOfWeekRaw === null ? 1 : Number(dayOfWeekRaw)
        if (dayOfWeek < 0 || dayOfWeek > 6) {
          return { error: "Choose a valid day of the week" }
        }
      }
      if (frequency === "monthly") {
        dayOfMonth = dayOfMonthRaw === null ? 1 : Number(dayOfMonthRaw)
        if (dayOfMonth < 1 || dayOfMonth > 28) {
          return { error: "Choose a day of the month between 1 and 28" }
        }
      }
    }

    const { error } = await supabase.from("report_subscriptions").insert({
      org_id: membership.org_id,
      created_by: user.id,
      report_type: reportType,
      frequency,
      day_of_week: dayOfWeek,
      day_of_month: dayOfMonth,
      email,
      enabled: true,
    })

    if (error) throw error

    revalidatePath("/dashboard/reports/subscriptions")
    return {
      success: `${reportType === "month_end" ? "Month-End" : "Sales"} report scheduled (${scheduleFor(
        reportType,
        frequency,
        dayOfWeek,
        dayOfMonth
      )}).`,
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not create the subscription" }
  }
}

export async function toggleReportSubscription(id: string) {
  const { supabase, membership } = await requireProContext()
  const { data: sub } = await supabase
    .from("report_subscriptions")
    .select("enabled")
    .eq("id", id)
    .eq("org_id", membership.org_id)
    .single()
  if (!sub) return

  await supabase
    .from("report_subscriptions")
    .update({ enabled: !sub.enabled })
    .eq("id", id)
    .eq("org_id", membership.org_id)

  revalidatePath("/dashboard/reports/subscriptions")
}

export async function deleteReportSubscription(id: string) {
  const { supabase, membership } = await requireProContext()
  await supabase
    .from("report_subscriptions")
    .delete()
    .eq("id", id)
    .eq("org_id", membership.org_id)

  revalidatePath("/dashboard/reports/subscriptions")
}