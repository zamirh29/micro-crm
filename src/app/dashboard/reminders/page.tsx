import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { formatDate } from "@/lib/utils"
import { cn } from "@/lib/utils"
import type { Reminder, Contact } from "@/types/database"

const statusStyles: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  sent: "bg-blue-100 text-blue-800",
  completed: "bg-green-100 text-green-800",
}

export default async function RemindersPage() {
  const supabase = await createClient()

  const { data: reminders } = await supabase
    .from("reminders")
    .select("*, contacts(first_name, last_name)")
    .order("scheduled_at", { ascending: false })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Reminders</h1>
        <Link
          href="/dashboard/reminders/new"
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
        >
          New Reminder
        </Link>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-background">
        <table className="min-w-full divide-y divide-border">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                Title
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
Customer
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                Scheduled At
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(reminders as (Reminder & { contacts: Pick<Contact, "first_name" | "last_name"> | null })[] | null)?.map(
              (reminder) => (
                <tr key={reminder.id} className="hover:bg-muted/50">
                  <td className="px-4 py-3 text-sm font-medium">{reminder.title}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {reminder.contacts
                      ? `${reminder.contacts.first_name} ${reminder.contacts.last_name}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {formatDate(reminder.scheduled_at)}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                        statusStyles[reminder.status]
                      )}
                    >
                      {reminder.status}
                    </span>
                  </td>
                </tr>
              )
            )}
            {(!reminders || reminders.length === 0) && (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-8 text-center text-sm text-muted-foreground"
                >
                  No reminders yet. Create your first reminder.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
