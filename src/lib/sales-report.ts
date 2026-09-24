export interface CustomerBrief {
  id: string
  first_name: string
  last_name: string
  email: string | null
  company: string | null
}

export interface QuoteActivity {
  contact_id: string
  status: string
  total: number
}

export interface InvoiceCreatedActivity {
  contact_id: string
  status: string
  total: number
}

export interface InvoicePaidActivity {
  contact_id: string
  total: number
}

export interface CustomerSalesRow {
  contactId: string
  name: string
  company: string | null
  email: string | null
  quoteCount: number
  quotedTotal: number
  invoiceCount: number
  invoicedTotal: number
  paidTotal: number
  unpaidTotal: number
}

export interface CustomerSalesSummary {
  includesSingleCustomer: boolean
  rows: CustomerSalesRow[]
  totals: CustomerSalesRow
}

export function computeCustomerSales(params: {
  customers: CustomerBrief[]
  quotes: QuoteActivity[]
  invoicesCreated: InvoiceCreatedActivity[]
  invoicesPaid: InvoicePaidActivity[]
}): CustomerSalesSummary {
  const { customers, quotes, invoicesCreated, invoicesPaid } = params

  const rowMap = new Map<string, CustomerSalesRow>()
  const emptyRow = (customer: CustomerBrief): CustomerSalesRow => ({
    contactId: customer.id,
    name: `${customer.first_name} ${customer.last_name}`.trim(),
    company: customer.company,
    email: customer.email,
    quoteCount: 0,
    quotedTotal: 0,
    invoiceCount: 0,
    invoicedTotal: 0,
    paidTotal: 0,
    unpaidTotal: 0,
  })

  for (const customer of customers) {
    rowMap.set(customer.id, emptyRow(customer))
  }

  function getRow(contactId: string | null): CustomerSalesRow | null {
    if (!contactId) return null
    return rowMap.get(contactId) ?? null
  }

  for (const quote of quotes) {
    const row = getRow(quote.contact_id)
    if (!row) continue
    row.quoteCount++
    if (quote.status !== "draft" && quote.status !== "rejected") {
      row.quotedTotal += quote.total
    }
  }

  for (const invoice of invoicesCreated) {
    const row = getRow(invoice.contact_id)
    if (!row) continue
    row.invoiceCount++
    if (invoice.status !== "draft") {
      row.invoicedTotal += invoice.total
    }
    if (invoice.status === "sent" || invoice.status === "overdue") {
      row.unpaidTotal += invoice.total
    }
  }

  for (const paid of invoicesPaid) {
    const row = getRow(paid.contact_id)
    if (!row) continue
    row.paidTotal += paid.total
  }

  const rows = Array.from(rowMap.values())
  const totals: CustomerSalesRow = {
    contactId: "__totals__",
    name: "All customers",
    company: null,
    email: null,
    quoteCount: rows.reduce((sum, r) => sum + r.quoteCount, 0),
    quotedTotal: rows.reduce((sum, r) => sum + r.quotedTotal, 0),
    invoiceCount: rows.reduce((sum, r) => sum + r.invoiceCount, 0),
    invoicedTotal: rows.reduce((sum, r) => sum + r.invoicedTotal, 0),
    paidTotal: rows.reduce((sum, r) => sum + r.paidTotal, 0),
    unpaidTotal: rows.reduce((sum, r) => sum + r.unpaidTotal, 0),
  }

  const includesSingleCustomer = customers.length === 1

  return { includesSingleCustomer, rows, totals }
}