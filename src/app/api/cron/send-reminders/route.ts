import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { sendEmail } from "@/lib/resend"
import { reminderEmail } from "@/components/email/reminder-email"

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = createAdminClient()

  const { data: reminders } = await supabase
    .from("reminders")
    .select("*, contacts(first_name, last_name, email), quotes(number, title, total, currency), invoices(number, title, total, currency)")
    .eq("status", "pending")
    .lte("scheduled_at", new Date().toISOString())

  if (!reminders || reminders.length === 0) {
    return NextResponse.json({ sent: 0 })
  }

  let sentCount = 0

  for (const reminder of reminders) {
    const contact = reminder.contacts as { first_name: string; last_name: string; email: string } | null
    if (!contact?.email) continue

    const html = reminderEmail({
      recipientName: `${contact.first_name} ${contact.last_name}`,
      title: reminder.title,
      description: reminder.description,
      scheduledAt: reminder.scheduled_at,
      viewUrl: null,
    })

    const result = await sendEmail({
      to: [contact.email],
      subject: `Reminder: ${reminder.title}`,
      html,
    })

    if (!result.error) {
      await supabase
        .from("reminders")
        .update({ status: "sent" })
        .eq("id", reminder.id)
      sentCount++
    }
  }

  return NextResponse.json({ sent: sentCount })
}
