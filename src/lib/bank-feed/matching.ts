import type { SupabaseClient } from "@supabase/supabase-js"
import type { NormalisedBankTransaction } from "@/lib/bank-feed/types"

export interface BankMatchSuggestion {
  invoiceId: string | null
  confidence: "exact" | "high" | "none"
  categoryHint: string | null
  supplierHint: string | null
  isTransfer: boolean
}

const TRANSFER_WORDS = [
  "transfer",
  "between accounts",
  "own account",
  "credit card payment",
  "balance transfer",
]

const CATEGORY_RULES: { words: string[]; category: string }[] = [
  { words: ["rent", "landlord", "premises"], category: "Rent & utilities" },
  { words: ["electric", "gas bill", "water bill", "utilities"], category: "Rent & utilities" },
  { words: ["internet", "broadband", "phone", "mobile"], category: "Phone & internet" },
  { words: ["insurance", "policy"], category: "Insurance" },
  { words: ["fuel", "petrol", "diesel", "taxi", "train", "travel"], category: "Travel" },
  { words: ["tool", "hardware", "equipment"], category: "Tools & equipment" },
  { words: ["accountant", "solicitor", "legal", "professional"], category: "Professional fees" },
  { words: ["advert", "facebook", "google ads", "marketing"], category: "Marketing" },
  { words: ["materials", "supplier", "stock"], category: "Parts & materials" },
]

function normalise(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim()
}

function nameOf(contact: {
  first_name?: string | null
  last_name?: string | null
  company?: string | null
}): string {
  return normalise(
    [contact.company, contact.first_name, contact.last_name]
      .filter(Boolean)
      .join(" ")
  )
}

export async function suggestBankMatch(
  supabase: SupabaseClient,
  orgId: string,
  txn: NormalisedBankTransaction
): Promise<BankMatchSuggestion> {
  const text = normalise(txn.description)
  const supplierHint = txn.supplierHint ? normalise(txn.supplierHint) : null
  const isTransfer = TRANSFER_WORDS.some((word) => text.includes(word))
  const categoryHint =
    CATEGORY_RULES.find((rule) => rule.words.some((word) => text.includes(word)))
      ?.category ?? null

  if (txn.direction !== "money_in" || isTransfer) {
    return {
      invoiceId: null,
      confidence: "none",
      categoryHint,
      supplierHint: txn.supplierHint,
      isTransfer,
    }
  }

  const { data: invoices } = await supabase
    .from("invoices")
    .select("id, number, total, contacts(first_name, last_name, company)")
    .eq("org_id", orgId)
    .in("status", ["sent", "overdue"])
    .order("created_at", { ascending: false })
    .limit(500)

  if (!invoices?.length) {
    return {
      invoiceId: null,
      confidence: "none",
      categoryHint,
      supplierHint: txn.supplierHint,
      isTransfer,
    }
  }

  const amount = Math.round(Math.abs(txn.amount) * 100) / 100
  const byReference = invoices.find((invoice) => {
    const number = normalise(invoice.number ?? "")
    return number.length >= 3 && text.includes(number)
  })
  if (byReference) {
    return {
      invoiceId: byReference.id,
      confidence: "exact",
      categoryHint,
      supplierHint: txn.supplierHint,
      isTransfer,
    }
  }

  const amountMatches = invoices.filter(
    (invoice) => Math.round(Number(invoice.total) * 100) / 100 === amount
  )
  const payer = supplierHint ?? text
  const byCustomer = amountMatches.find((invoice) => {
    const contact = Array.isArray(invoice.contacts)
      ? invoice.contacts[0]
      : invoice.contacts
    if (!contact) return false
    const name = nameOf(contact as typeof contact & typeof invoice.contacts)
    return name.length >= 4 && (payer.includes(name) || name.includes(payer))
  })

  if (byCustomer) {
    return {
      invoiceId: byCustomer.id,
      confidence: "high",
      categoryHint,
      supplierHint: txn.supplierHint,
      isTransfer,
    }
  }

  return {
    invoiceId: null,
    confidence: "none",
    categoryHint,
    supplierHint: txn.supplierHint,
    isTransfer,
  }
}
