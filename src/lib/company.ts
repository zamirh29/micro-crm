import type { createClient } from "@/lib/supabase/server"
import type { Organization } from "@/types/database"

export type SupabaseServer = Awaited<ReturnType<typeof createClient>>

export interface CompanyProfile {
  name: string
  logoData: string | null
  address: string | null
  phone: string | null
  email: string | null
  website: string | null
  currency: string
}

export const DEFAULT_COMPANY: CompanyProfile = {
  name: "MicroCRM",
  logoData: null,
  address: null,
  phone: null,
  email: null,
  website: null,
  currency: "GBP",
}

export const CURRENCIES: { code: string; label: string; symbol: string }[] = [
  { code: "GBP", label: "British Pound", symbol: "£" },
  { code: "USD", label: "US Dollar", symbol: "$" },
  { code: "EUR", label: "Euro", symbol: "€" },
  { code: "AUD", label: "Australian Dollar", symbol: "A$" },
  { code: "CAD", label: "Canadian Dollar", symbol: "C$" },
  { code: "NZD", label: "New Zealand Dollar", symbol: "NZ$" },
  { code: "CHF", label: "Swiss Franc", symbol: "Fr" },
  { code: "JPY", label: "Japanese Yen", symbol: "¥" },
  { code: "CNY", label: "Chinese Yuan", symbol: "¥" },
  { code: "INR", label: "Indian Rupee", symbol: "₹" },
  { code: "AED", label: "UAE Dirham", symbol: "د.إ" },
  { code: "SAR", label: "Saudi Riyal", symbol: "﷼" },
  { code: "ZAR", label: "South African Rand", symbol: "R" },
  { code: "BRL", label: "Brazilian Real", symbol: "R$" },
  { code: "MXN", label: "Mexican Peso", symbol: "Mex$" },
  { code: "SGD", label: "Singapore Dollar", symbol: "S$" },
  { code: "HKD", label: "Hong Kong Dollar", symbol: "HK$" },
  { code: "SEK", label: "Swedish Krona", symbol: "kr" },
  { code: "NOK", label: "Norwegian Krone", symbol: "kr" },
  { code: "DKK", label: "Danish Krone", symbol: "kr" },
  { code: "PLN", label: "Polish Złoty", symbol: "zł" },
  { code: "TRY", label: "Turkish Lira", symbol: "₺" },
]

export function currencySymbol(currency: string): string {
  const match = CURRENCIES.find((c) => c.code === currency)
  return match?.symbol ?? "£"
}

export function toCompanyProfile(org: Organization): CompanyProfile {
  return {
    name: org.name || DEFAULT_COMPANY.name,
    logoData: org.logo_data ?? null,
    address: org.address ?? null,
    phone: org.phone ?? null,
    email: org.email ?? null,
    website: org.website ?? null,
    currency: org.currency || DEFAULT_COMPANY.currency,
  }
}

export async function getCompanyProfile(
  supabase: SupabaseServer,
  orgId: string
): Promise<CompanyProfile> {
  const { data } = await supabase
    .from("organizations")
    .select("name, logo_data, address, phone, email, website, currency")
    .eq("id", orgId)
    .single()

  if (!data) return DEFAULT_COMPANY

  return {
    name: data.name || DEFAULT_COMPANY.name,
    logoData: data.logo_data ?? null,
    address: data.address ?? null,
    phone: data.phone ?? null,
    email: data.email ?? null,
    website: data.website ?? null,
    currency: data.currency || DEFAULT_COMPANY.currency,
  }
}

export function companyContactLine(company: CompanyProfile): string {
  return [company.address, company.phone, company.email, company.website]
    .filter(Boolean)
    .join(" • ")
}