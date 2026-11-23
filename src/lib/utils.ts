import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number, currency = "GBP"): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
  }).format(amount / 100)
}

export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

type ContactLike = {
  first_name: string
  last_name?: string | null
  company?: string | null
  email?: string | null
  phone?: string | null
}

/** Company-only contacts use the existing company column as their identity. */
export function isCompanyContact(contact: ContactLike): boolean {
  const company = contact.company?.trim()
  return !!company && contact.first_name.trim() === company && !contact.last_name?.trim()
}

export function contactDisplayName(contact: ContactLike): string {
  if (isCompanyContact(contact)) return contact.company!.trim()
  return `${contact.first_name ?? ""} ${contact.last_name ?? ""}`.trim()
}

export function contactSubtitle(contact: ContactLike): string {
  if (isCompanyContact(contact)) return contact.email ?? contact.phone ?? ""
  return contact.company?.trim() || contact.email || contact.phone || ""
}

export function generateQuoteNumber(sequence: number): string {
  return `Q-${String(sequence).padStart(4, "0")}`
}

export function generateInvoiceNumber(sequence: number): string {
  return `INV-${String(sequence).padStart(4, "0")}`
}
