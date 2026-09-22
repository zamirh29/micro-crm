import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { cn } from "@/lib/utils"
import { Users, FileText, Receipt, Bell } from "lucide-react"

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const { data: membership } = await supabase
    .from("memberships")
    .select("org_id")
    .eq("user_id", user.id)
    .single()

  if (!membership) {
    redirect("/login")
  }

  const orgId = membership.org_id

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

  const stats = [
    {
      label: "Total Contacts",
      value: contactsResult.count ?? 0,
      icon: Users,
      color: "text-blue-600 dark:text-blue-400",
      bg: "bg-blue-50 dark:bg-blue-950",
    },
    {
      label: "Active Quotes",
      value: quotesResult.count ?? 0,
      icon: FileText,
      color: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-50 dark:bg-amber-950",
    },
    {
      label: "Outstanding Invoices",
      value: invoicesResult.count ?? 0,
      icon: Receipt,
      color: "text-red-600 dark:text-red-400",
      bg: "bg-red-50 dark:bg-red-950",
    },
    {
      label: "Upcoming Reminders",
      value: remindersResult.count ?? 0,
      icon: Bell,
      color: "text-purple-600 dark:text-purple-400",
      bg: "bg-purple-50 dark:bg-purple-950",
    },
  ]

  interface ActivityItem {
    id: string
    type: "contact" | "quote" | "invoice"
    title: string
    subtitle: string
    status?: string
    created_at: string
  }

  const activities: ActivityItem[] = [
    ...(recentContacts ?? []).map((c) => ({
      id: c.id,
      type: "contact" as const,
      title: `${c.first_name} ${c.last_name}`,
      subtitle: "New contact",
      created_at: c.created_at,
    })),
    ...(recentQuotes ?? []).map((q) => ({
      id: q.id,
      type: "quote" as const,
      title: `${q.number} — ${q.title}`,
      subtitle: "Quote",
      status: q.status,
      created_at: q.created_at,
    })),
    ...(recentInvoices ?? []).map((i) => ({
      id: i.id,
      type: "invoice" as const,
      title: `${i.number} — ${i.title}`,
      subtitle: "Invoice",
      status: i.status,
      created_at: i.created_at,
    })),
  ]
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
    .slice(0, 10)

  const typeIcons: Record<string, typeof Users> = {
    contact: Users,
    quote: FileText,
    invoice: Receipt,
  }

  const statusStyles: Record<string, string> = {
    sent: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
    overdue:
      "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
    accepted:
      "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
    rejected: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
    expired:
      "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  }

  const userName =
    user.email?.split("@")[0] ?? "there"

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Welcome back, {userName}
        </h1>
        <p className="text-muted-foreground">
          Here&apos;s an overview of your business.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-border bg-card p-6"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">
                {stat.label}
              </span>
              <div
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-lg",
                  stat.bg
                )}
              >
                <stat.icon className={cn("h-4 w-4", stat.color)} />
              </div>
            </div>
            <p className="mt-2 text-3xl font-bold">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold">Recent Activity</h2>
        </div>
        {activities.length === 0 ? (
          <div className="px-6 py-12 text-center text-muted-foreground">
            <Bell className="mx-auto mb-3 h-8 w-8 opacity-40" />
            <p>No activity yet.</p>
            <p className="mt-1 text-sm">
              Start by adding contacts, quotes, or invoices.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {activities.map((activity) => {
              const Icon = typeIcons[activity.type]
              return (
                <li
                  key={`${activity.type}-${activity.id}`}
                  className="flex items-center gap-4 px-6 py-3 transition-colors hover:bg-muted/50"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium">
                      {activity.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {activity.subtitle}
                    </p>
                  </div>
                  {activity.status && (
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize",
                        statusStyles[activity.status] ??
                          "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                      )}
                    >
                      {activity.status}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(activity.created_at).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
