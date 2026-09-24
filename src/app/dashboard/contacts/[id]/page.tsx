import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, FileText, Receipt, Bell } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { formatDate, formatCurrency, cn } from "@/lib/utils"
import type { ContactStatus, QuoteStatus, InvoiceStatus, ReminderStatus } from "@/types/database"
import ContactActions from "./contact-actions"

const contactStatusStyles: Record<ContactStatus, string> = {
  lead: "bg-yellow-100 text-yellow-800",
  prospect: "bg-blue-100 text-blue-800",
  client: "bg-green-100 text-green-800",
  inactive: "bg-gray-100 text-gray-800",
}

const quoteStatusStyles: Record<QuoteStatus, string> = {
  draft: "bg-gray-100 text-gray-800",
  sent: "bg-blue-100 text-blue-800",
  accepted: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  expired: "bg-yellow-100 text-yellow-800",
}

const invoiceStatusStyles: Record<InvoiceStatus, string> = {
  draft: "bg-gray-100 text-gray-800",
  sent: "bg-blue-100 text-blue-800",
  paid: "bg-green-100 text-green-800",
  overdue: "bg-red-100 text-red-800",
}

const reminderStatusStyles: Record<ReminderStatus, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  sent: "bg-blue-100 text-blue-800",
  completed: "bg-green-100 text-green-800",
}

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
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

  const { data: contact } = await supabase
    .from("contacts")
    .select("*")
    .eq("id", id)
    .eq("org_id", membership.org_id)
    .single()

  if (!contact) notFound()

  const [{ data: quotes }, { data: invoices }, { data: reminders }] =
    await Promise.all([
      supabase
        .from("quotes")
        .select("*")
        .eq("contact_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("invoices")
        .select("*")
        .eq("contact_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("reminders")
        .select("*")
        .eq("contact_id", id)
        .order("scheduled_at", { ascending: false }),
    ])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard/contacts"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Customers
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {contact.first_name} {contact.last_name}
            </h1>
            {contact.company && (
              <p className="text-sm text-muted-foreground">{contact.company}</p>
            )}
          </div>
        </div>
        <ContactActions contactId={contact.id} />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="mb-4 text-lg font-semibold">Customer Information</h2>
          <dl className="space-y-3">
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                Email
              </dt>
              <dd className="text-sm">{contact.email || "\u2014"}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                Phone
              </dt>
              <dd className="text-sm">{contact.phone || "\u2014"}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                Status
              </dt>
              <dd>
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
                    contactStatusStyles[contact.status as ContactStatus]
                  )}
                >
                  {contact.status}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                Created
              </dt>
              <dd className="text-sm">{formatDate(contact.created_at)}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                Updated
              </dt>
              <dd className="text-sm">{formatDate(contact.updated_at)}</dd>
            </div>
          </dl>
          {contact.notes && (
            <div className="mt-4">
              <dt className="text-sm font-medium text-muted-foreground">
                Notes
              </dt>
              <dd className="mt-1 whitespace-pre-wrap text-sm">
                {contact.notes}
              </dd>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="rounded-lg border border-border bg-card p-6">
            <div className="mb-4 flex items-center gap-2">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-lg font-semibold">
                Quotes ({quotes?.length ?? 0})
              </h2>
            </div>
            {quotes && quotes.length > 0 ? (
              <ul className="space-y-2">
                {quotes.map((quote) => (
                  <li
                    key={quote.id}
                    className="flex items-center justify-between rounded-md border border-border px-3 py-2"
                  >
                    <div>
                      <p className="text-sm font-medium">{quote.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {quote.number}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {formatCurrency(quote.total, quote.currency)}
                      </span>
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize",
                          quoteStatusStyles[quote.status as QuoteStatus]
                        )}
                      >
                        {quote.status}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No quotes yet.</p>
            )}
          </div>

          <div className="rounded-lg border border-border bg-card p-6">
            <div className="mb-4 flex items-center gap-2">
              <Receipt className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-lg font-semibold">
                Invoices ({invoices?.length ?? 0})
              </h2>
            </div>
            {invoices && invoices.length > 0 ? (
              <ul className="space-y-2">
                {invoices.map((invoice) => (
                  <li
                    key={invoice.id}
                    className="flex items-center justify-between rounded-md border border-border px-3 py-2"
                  >
                    <div>
                      <p className="text-sm font-medium">{invoice.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {invoice.number}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {formatCurrency(invoice.total, invoice.currency)}
                      </span>
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize",
                          invoiceStatusStyles[invoice.status as InvoiceStatus]
                        )}
                      >
                        {invoice.status}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No invoices yet.</p>
            )}
          </div>

          <div className="rounded-lg border border-border bg-card p-6">
            <div className="mb-4 flex items-center gap-2">
              <Bell className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-lg font-semibold">
                Reminders ({reminders?.length ?? 0})
              </h2>
            </div>
            {reminders && reminders.length > 0 ? (
              <ul className="space-y-2">
                {reminders.map((reminder) => (
                  <li
                    key={reminder.id}
                    className="flex items-center justify-between rounded-md border border-border px-3 py-2"
                  >
                    <div>
                      <p className="text-sm font-medium">{reminder.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(reminder.scheduled_at)}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize",
                        reminderStatusStyles[
                          reminder.status as ReminderStatus
                        ]
                      )}
                    >
                      {reminder.status}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No reminders yet.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
