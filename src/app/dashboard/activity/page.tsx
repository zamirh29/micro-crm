import { Users, FileText, Receipt, Bell } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import ProGate from "@/components/pro-gate"
import RestoreButton from "@/components/restore-button"
import type { ActivityLogRow } from "@/lib/activity"

export const dynamic = "force-dynamic"

const ENTITY_ICONS = {
  contact: Users,
  quote: FileText,
  invoice: Receipt,
  reminder: Bell,
} as const

const ACTION_STYLES = {
  created: "bg-green-100 text-green-700 dark:bg-green-950",
  updated: "bg-blue-100 text-blue-700 dark:bg-blue-950",
  deleted: "bg-red-100 text-red-700 dark:bg-red-950",
  restored: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950",
} as const

export default async function ActivityPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data: membership } = await supabase
    .from("memberships")
    .select("org_id")
    .eq("user_id", user.id)
    .single()

  if (!membership) return null

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("status, plan")
    .eq("user_id", user.id)
    .maybeSingle()

  const isPro =
    subscription?.status === "active" || subscription?.status === "trialing"
      ? (subscription.plan ?? "free") === "pro"
      : false

  if (!isPro) {
    return (
      <ProGate
        title="Activity Log is a Pro feature"
        description="See the last 10 days of activity in your workspace and restore anything you delete by accident."
        features={[
          "Full history of customers, quotes, invoices and reminders",
          "One-click restore of deleted items within 10 days",
          "Never lose work to a mistaken delete again",
        ]}
      />
    )
  }

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 10)

  const { data: rawLogs } = await supabase
    .from("activity_log")
    .select("*")
    .eq("org_id", membership.org_id)
    .gte("created_at", cutoff.toISOString())
    .order("created_at", { ascending: false })
    .limit(500)

  const logs = (rawLogs ?? []) as ActivityLogRow[]

  const groups: { label: string; items: ActivityLogRow[] }[] = []
  for (const log of logs) {
    const label = dayLabel(log.created_at)
    const last = groups[groups.length - 1]
    if (last && last.label === label) {
      last.items.push(log)
    } else {
      groups.push({ label, items: [log] })
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Activity</h1>
        <p className="text-sm text-muted-foreground">
          The last 10 days of activity in your workspace. Deleted items can be
          restored if within that window.
        </p>
      </div>

      {logs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center">
          <p className="text-sm font-medium">No activity yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create, update or delete customers, quotes, invoices or reminders
            and they&apos;ll show up here.
          </p>
        </div>
      ) : (
        groups.map((group) => (
          <div key={group.label}>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {group.label}
            </h2>
            <div className="space-y-2">
              {group.items.map((log) => {
                const Icon = ENTITY_ICONS[log.entity] ?? Bell
                const deletable =
                  log.action === "deleted" && !log.restored && !!log.payload
                return (
                  <div
                    key={log.id}
                    className="flex items-start gap-3 rounded-lg border border-border bg-card p-4 shadow-sm"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-medium">
                          {log.label}
                        </p>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${ACTION_STYLES[log.action]}`}
                        >
                          {log.action}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {entitiesLabel[log.entity]} · {timeAgo(log.created_at)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center">
                      {deletable ? (
                        <RestoreButton logId={log.id} />
                      ) : log.action === "deleted" && log.restored ? (
                        <span className="rounded-full bg-indigo-100 px-3 py-1.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-950">
                          Restored
                        </span>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))
      )}
    </div>
  )
}

const entitiesLabel = {
  contact: "Customer",
  quote: "Quote",
  invoice: "Invoice",
  reminder: "Reminder",
} as const

function dayLabel(iso: string): string {
  const date = new Date(iso)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()

  if (sameDay(date, today)) return "Today"
  if (sameDay(date, yesterday)) return "Yesterday"
  return date.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  })
}

function timeAgo(iso: string): string {
  const diff = new Date().getTime() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? "" : "s"} ago`
}