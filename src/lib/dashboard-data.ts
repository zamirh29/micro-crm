import type { SupabaseClient } from "@supabase/supabase-js"

export interface ActivityItem {
  id: string
  type: "contact" | "quote" | "invoice"
  title: string
  subtitle: string
  status?: string
  created_at: string
}

export interface DashboardData {
  counts: {
    customers: number
    activeQuotes: number
    outstandingInvoices: number
    pendingReminders: number
  }
  activities: ActivityItem[]
}

export async function getDashboardData(
  supabase: SupabaseClient,
  orgId: string
): Promise<DashboardData> {
  const [contactsResult, quotesResult, invoicesResult, remindersResult] =
    await Promise.all([
      supabase
        .from("contacts")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId),
      supabase
        .from("quotes")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("status", "sent"),
      supabase
        .from("invoices")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .in("status", ["sent", "overdue"]),
      supabase
        .from("reminders")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("status", "pending"),
    ])

  const { data: recentContacts } = await supabase
    .from("contacts")
    .select("id, first_name, last_name, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(5)

  const { data: recentQuotes } = await supabase
    .from("quotes")
    .select("id, number, title, status, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(5)

  const { data: recentInvoices } = await supabase
    .from("invoices")
    .select("id, number, title, status, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(5)

  const activities: ActivityItem[] = [
    ...(recentContacts ?? []).map((c) => ({
      id: c.id,
      type: "contact" as const,
      title: `${c.first_name} ${c.last_name}`.trim(),
      subtitle: "New customer",
      created_at: c.created_at,
    })),
    ...(recentQuotes ?? []).map((q) => ({
      id: q.id,
      type: "quote" as const,
      title: `${q.number} — ${q.title}`,
      subtitle: "Quote",
      status: q.status ?? undefined,
      created_at: q.created_at,
    })),
    ...(recentInvoices ?? []).map((i) => ({
      id: i.id,
      type: "invoice" as const,
      title: `${i.number} — ${i.title}`,
      subtitle: "Invoice",
      status: i.status ?? undefined,
      created_at: i.created_at,
    })),
  ]
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
    .slice(0, 10)

  return {
    counts: {
      customers: contactsResult.count ?? 0,
      activeQuotes: quotesResult.count ?? 0,
      outstandingInvoices: invoicesResult.count ?? 0,
      pendingReminders: remindersResult.count ?? 0,
    },
    activities,
  }
}
