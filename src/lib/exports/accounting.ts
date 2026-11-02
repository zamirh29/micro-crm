/**
 * Accounting-software export mappers.
 *
 * Everything is stored in pence; the exports convert to pounds because every
 * accounting package below expects decimal amounts.
 *
 * Each target gets its own column layout:
 *  - xero:        Xero "Sales invoices" import CSV
 *  - quickbooks:  QuickBooks Online invoice/sales CSV
 *  - sage:        Sage 50 / Sage Business Cloud audit-trail style CSV
 *  - generic:     plain, fully-labelled CSV for anything else (FreeAgent, Dext…)
 */

import { toCsv } from "@/lib/csv"

export type ExportFormat = "xero" | "quickbooks" | "sage" | "generic"
export type ExportDataset = "sales" | "purchases" | "vat"

export const EXPORT_FORMATS: {
  value: ExportFormat
  label: string
  description: string
}[] = [
  {
    value: "xero",
    label: "Xero",
    description: "Sales invoice import CSV",
  },
  {
    value: "quickbooks",
    label: "QuickBooks Online",
    description: "Invoice import CSV",
  },
  {
    value: "sage",
    label: "Sage 50 / Business Cloud",
    description: "Audit-trail style CSV",
  },
  {
    value: "generic",
    label: "Generic CSV",
    description: "FreeAgent, Dext, spreadsheets",
  },
]

export const EXPORT_DATASETS: {
  value: ExportDataset
  label: string
  description: string
}[] = [
  {
    value: "sales",
    label: "Sales (invoices)",
    description: "One row per invoice with net, VAT and gross",
  },
  {
    value: "purchases",
    label: "Purchases (expenses)",
    description: "One row per expense",
  },
  {
    value: "vat",
    label: "VAT summary",
    description: "VAT return boxes 1–9 for the period",
  },
]

export interface ExportInvoice {
  number: string
  title: string
  status: string
  issueDate: string
  dueDate: string | null
  contactName: string
  contactEmail: string | null
  currency: string
  subtotalPence: number
  taxPence: number
  totalPence: number
  taxRate: number
  vatRegistered: boolean
  paidAt: string | null
}

export interface ExportExpense {
  date: string
  category: string
  description: string
  amountPence: number
}

export interface VatSummary {
  box1: number
  box2: number
  box3: number
  box4: number
  box5: number
  box6: number
  box7: number
  box8: number
  box9: number
}

const pounds = (pence: number) => (pence / 100).toFixed(2)

/** dd/mm/yyyy, the format UK Xero/QuickBooks/Sage companies import. */
export function ukDate(iso: string | null | undefined): string {
  if (!iso) return ""
  const [year, month, day] = iso.slice(0, 10).split("-")
  if (!year || !month || !day) return ""
  return `${day}/${month}/${year}`
}

function vatPercentage(taxRate: number): number {
  return Math.round(taxRate * 100)
}

/** Xero tax types keyed off the VAT rate used on the document. */
export function xeroTaxType(taxRate: number, isSale: boolean): string {
  const pct = vatPercentage(taxRate)
  if (pct === 20) return isSale ? "OUTPUT2" : "INPUT2"
  if (pct === 5) return isSale ? "OUTPUT5" : "INPUT5"
  if (pct === 0) return isSale ? "ZERORATEDOUTPUT" : "ZERORATEDINPUT"
  return isSale ? "OUTPUT2" : "INPUT2"
}

/** QuickBooks Online UK tax codes (name form used by the CSV importer). */
export function quickBooksTaxCode(taxRate: number, isSale: boolean): string {
  const pct = vatPercentage(taxRate)
  if (pct === 20) return isSale ? "20.0% S" : "20.0% P"
  if (pct === 5) return isSale ? "5.0% S" : "5.0% P"
  return isSale ? "0.0% S" : "0.0% P"
}

export function calculateVatSummary(
  invoices: ExportInvoice[],
  expenses: ExportExpense[]
): VatSummary {
  let box1 = 0
  const box4 = 0
  let box6 = 0
  let box7 = 0

  for (const invoice of invoices) {
    box1 += invoice.taxPence
    box6 += invoice.subtotalPence
  }

  // Expenses carry no VAT split in this app, so they are treated as gross
  // purchases with no recoverable VAT, which is the safe default.
  for (const expense of expenses) {
    box7 += expense.amountPence
  }

  const box3 = box1 + 0 // box 2 is intra-EU acquisitions, not tracked here
  const box5 = Math.max(box3 - box4, 0)

  return {
    box1,
    box2: 0,
    box3,
    box4,
    box5,
    box6,
    box7,
    box8: 0,
    box9: 0,
  }
}

export interface ExportFile {
  filename: string
  content: string
  contentType: string
}

function salesRows(
  format: ExportFormat,
  invoices: ExportInvoice[]
): { headers: string[]; rows: (string | number)[][] } {
  switch (format) {
    case "xero":
      return {
        headers: [
          "InvoiceNumber",
          "ContactName",
          "EmailAddress",
          "InvoiceDate",
          "DueDate",
          "Description",
          "Quantity",
          "UnitAmount",
          "AccountCode",
          "TaxType",
          "TaxAmount",
          "Currency",
          "Status",
        ],
        rows: invoices.map((i) => [
          i.number,
          i.contactName,
          i.contactEmail ?? "",
          ukDate(i.issueDate),
          ukDate(i.dueDate),
          i.title,
          1,
          pounds(i.subtotalPence),
          "200",
          xeroTaxType(i.taxRate, true),
          pounds(i.taxPence),
          i.currency,
          i.status,
        ]),
      }

    case "quickbooks":
      return {
        headers: [
          "InvoiceNo",
          "Customer",
          "InvoiceDate",
          "DueDate",
          "Item(Product/Service)",
          "ItemDescription",
          "ItemQuantity",
          "ItemRate",
          "ItemAmount",
          "VATCode",
          "VATAmount",
          "Currency",
        ],
        rows: invoices.map((i) => [
          i.number,
          i.contactName,
          ukDate(i.issueDate),
          ukDate(i.dueDate),
          "Services",
          i.title,
          1,
          pounds(i.subtotalPence),
          pounds(i.subtotalPence),
          quickBooksTaxCode(i.taxRate, true),
          pounds(i.taxPence),
          i.currency,
        ]),
      }

    case "sage":
      return {
        headers: [
          "Type",
          "Account",
          "Nominal",
          "Date",
          "Reference",
          "Details",
          "Net",
          "VAT",
          "Gross",
          "Currency",
        ],
        rows: invoices.map((i) => [
          "SI",
          "1100",
          "4000",
          ukDate(i.issueDate),
          i.number,
          `${i.contactName} — ${i.title}`,
          pounds(i.subtotalPence),
          pounds(i.taxPence),
          pounds(i.totalPence),
          i.currency,
        ]),
      }

    default:
      return {
        headers: [
          "Invoice number",
          "Customer",
          "Customer email",
          "Issue date",
          "Due date",
          "Description",
          "Status",
          "Net",
          "VAT rate %",
          "VAT",
          "Gross",
          "Currency",
          "Paid date",
        ],
        rows: invoices.map((i) => [
          i.number,
          i.contactName,
          i.contactEmail ?? "",
          i.issueDate,
          i.dueDate ?? "",
          i.title,
          i.status,
          pounds(i.subtotalPence),
          vatPercentage(i.taxRate),
          pounds(i.taxPence),
          pounds(i.totalPence),
          i.currency,
          i.paidAt ? i.paidAt.slice(0, 10) : "",
        ]),
      }
  }
}

function purchaseRows(
  format: ExportFormat,
  expenses: ExportExpense[]
): { headers: string[]; rows: (string | number)[][] } {
  switch (format) {
    case "xero":
      return {
        headers: [
          "Date",
          "Description",
          "Category",
          "Amount",
          "AccountCode",
          "TaxType",
        ],
        rows: expenses.map((e) => [
          ukDate(e.date),
          e.description || e.category,
          e.category,
          pounds(e.amountPence),
          "429",
          "NONE",
        ]),
      }

    case "quickbooks":
      return {
        headers: [
          "Date",
          "Supplier",
          "Description",
          "Amount",
          "VATCode",
          "Category",
        ],
        rows: expenses.map((e) => [
          ukDate(e.date),
          e.category,
          e.description || e.category,
          pounds(e.amountPence),
          quickBooksTaxCode(0, false),
          e.category,
        ]),
      }

    case "sage":
      return {
        headers: [
          "Type",
          "Account",
          "Nominal",
          "Date",
          "Reference",
          "Details",
          "Net",
          "VAT",
          "Gross",
        ],
        rows: expenses.map((e) => [
          "PI",
          "2100",
          "5000",
          ukDate(e.date),
          e.category,
          e.description || e.category,
          pounds(e.amountPence),
          "0.00",
          pounds(e.amountPence),
        ]),
      }

    default:
      return {
        headers: ["Date", "Category", "Description", "Amount", "VAT"],
        rows: expenses.map((e) => [
          e.date,
          e.category,
          e.description || e.category,
          pounds(e.amountPence),
          "0.00",
        ]),
      }
  }
}

function vatRows(
  format: ExportFormat,
  summary: VatSummary,
  from: string,
  to: string
): { headers: string[]; rows: (string | number)[][] } {
  if (format === "generic") {
    return {
      headers: ["Box", "Description", "Amount", "Period from", "Period to"],
      rows: [
        ["1", "VAT due on sales and other outputs", pounds(summary.box1), from, to],
        ["2", "VAT due on acquisitions from EU member states", pounds(summary.box2), from, to],
        ["3", "Total VAT due", pounds(summary.box3), from, to],
        ["4", "VAT reclaimed on purchases and other inputs", pounds(summary.box4), from, to],
        ["5", "Net VAT to pay or reclaim", pounds(summary.box5), from, to],
        ["6", "Total value of sales excluding VAT", pounds(summary.box6), from, to],
        ["7", "Total value of purchases excluding VAT", pounds(summary.box7), from, to],
        ["8", "Total value of supplies to EU member states", pounds(summary.box8), from, to],
        ["9", "Total value of acquisitions from EU member states", pounds(summary.box9), from, to],
      ],
    }
  }

  // Xero/QuickBooks/Sage all accept a simple ledger-style VAT summary.
  return {
    headers: ["Box", "Amount", "Period from", "Period to"],
    rows: [
      ["1", pounds(summary.box1), from, to],
      ["2", pounds(summary.box2), from, to],
      ["3", pounds(summary.box3), from, to],
      ["4", pounds(summary.box4), from, to],
      ["5", pounds(summary.box5), from, to],
      ["6", pounds(summary.box6), from, to],
      ["7", pounds(summary.box7), from, to],
      ["8", pounds(summary.box8), from, to],
      ["9", pounds(summary.box9), from, to],
    ],
  }
}

export function buildAccountingExport(params: {
  format: ExportFormat
  dataset: ExportDataset
  from: string
  to: string
  invoices: ExportInvoice[]
  expenses: ExportExpense[]
}): ExportFile {
  const { format, dataset, from, to, invoices, expenses } = params

  const table =
    dataset === "sales"
      ? salesRows(format, invoices)
      : dataset === "purchases"
        ? purchaseRows(format, expenses)
        : vatRows(format, calculateVatSummary(invoices, expenses), from, to)

  const suffix = format === "generic" ? "csv" : `${format}.csv`
  return {
    filename: `microcrm-${dataset}-${from}-to-${to}-${suffix}`,
    content: toCsv(table.headers, table.rows),
    contentType: "text/csv; charset=utf-8",
  }
}
