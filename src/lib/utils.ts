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

export function generateQuoteNumber(sequence: number): string {
  return `Q-${String(sequence).padStart(4, "0")}`
}

export function generateInvoiceNumber(sequence: number): string {
  return `INV-${String(sequence).padStart(4, "0")}`
}
