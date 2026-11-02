import { NextResponse } from "next/server"
import { requireApiUser } from "@/lib/api-auth"
import { jsonError } from "@/lib/api-utils"
import {
  buildAccountingExport,
  type ExportDataset,
  type ExportExpense,
  type ExportFormat,
  type ExportInvoice,
} from "@/lib/exports/accounting"

const FORMATS: ExportFormat[] = ["xero", "quickbooks", "sage", "generic"]
const DATASETS: ExportDataset[] = ["sales", "purchases", "vat"]
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function oneYearAgoIso(): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 1)
  return d.toISOString().slice(0, 10)
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function dayAfter(date: string): Date {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d
}

function contactDetails(contact: unknown): {
  name: string
  email: string | null
} {
  const c = Array.isArray(contact) ? contact[0] : contact
  if (!c || typeof c !== "object") {
    return { name: "Unknown customer", email: null }
  }
  const record = c as Record<string, unknown>
  const name = [record.first_name, record.last_name]
    .filter((part): part is string => typeof part === "string" && !!part)
    .join(" ")
  return {
    name: name || (record.company as string) || "Unknown customer",
    email: typeof record.email === "string" ? record.email : null,
  }
}

export async function GET(request: Request) {
  const auth = await requireApiUser(request)
  if (!auth.ok) return auth.response

  const url = new URL(request.url)
  const format = (url.searchParams.get("format") ?? "generic") as ExportFormat
  const dataset = (url.searchParams.get("dataset") ?? "sales") as ExportDataset
  const from = url.searchParams.get("from") ?? oneYearAgoIso()
  const to = url.searchParams.get("to") ?? todayIso()

  if (!FORMATS.includes(format)) return jsonError("Unknown format", 400)
  if (!DATASETS.includes(dataset)) return jsonError("Unknown dataset", 400)
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
    return jsonError("Dates must be YYYY-MM-DD", 400)
  }
  if (from > to) return jsonError("From must be before to", 400)

  const { supabase, orgId } = auth
  const toExclusive = dayAfter(to)

  const [{ data: invoiceRows, error: invoiceError }, { data: expenseRows, error: expenseError }] =
    await Promise.all([
      supabase
        .from("invoices")
        .select(
          "number, title, status, created_at, due_date, paid_at, currency, subtotal, tax_amount, total, tax_rate, contact:contacts(first_name, last_name, company, email, vat_registered)"
        )
        .eq("org_id", orgId)
        .gte("created_at", `${from}T00:00:00.000Z`)
        .lt("created_at", toExclusive.toISOString())
        .order("created_at", { ascending: true }),
      supabase
        .from("expenses")
        .select("incurred_on, category, description, amount")
        .eq("org_id", orgId)
        .gte("incurred_on", from)
        .lte("incurred_on", to)
        .order("incurred_on", { ascending: true }),
    ])

  if (invoiceError) return jsonError(invoiceError.message, 400)
  if (expenseError) return jsonError(expenseError.message, 400)

  const invoices: ExportInvoice[] = (invoiceRows ?? []).map((row, index) => {
    const contact = (row as Record<string, unknown>).contact
    const details = contactDetails(contact)
    const createdAt = String((row as Record<string, unknown>).created_at ?? "")
    return {
      number: String((row as Record<string, unknown>).number ?? index + 1),
      title: String((row as Record<string, unknown>).title ?? "Invoice"),
      status: String((row as Record<string, unknown>).status ?? "draft"),
      issueDate: createdAt.slice(0, 10),
      dueDate: ((row as Record<string, unknown>).due_date as string | null) ?? null,
      contactName: details.name,
      contactEmail: details.email,
      currency: String((row as Record<string, unknown>).currency ?? "GBP"),
      subtotalPence: Number((row as Record<string, unknown>).subtotal ?? 0),
      taxPence: Number((row as Record<string, unknown>).tax_amount ?? 0),
      totalPence: Number((row as Record<string, unknown>).total ?? 0),
      taxRate: Number((row as Record<string, unknown>).tax_rate ?? 0),
      vatRegistered: Boolean(
        Array.isArray(contact)
          ? contact[0]?.vat_registered
          : (contact as Record<string, unknown> | null)?.vat_registered
      ),
      paidAt: ((row as Record<string, unknown>).paid_at as string | null) ?? null,
    }
  })

  const expenses: ExportExpense[] = (expenseRows ?? []).map((row) => {
    const record = row as Record<string, unknown>
    return {
      date: String(record.incurred_on ?? ""),
      category: String(record.category ?? "Other"),
      description: String(record.description ?? ""),
      amountPence: Number(record.amount ?? 0),
    }
  })

  const file = buildAccountingExport({
    format,
    dataset,
    from,
    to,
    invoices,
    expenses,
  })

  return new NextResponse(file.content, {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `attachment; filename="${file.filename}"`,
      "Cache-Control": "no-store",
    },
  })
}
