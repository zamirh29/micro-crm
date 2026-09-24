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
}

export const DEFAULT_COMPANY: CompanyProfile = {
  name: "MicroCRM",
  logoData: null,
  address: null,
  phone: null,
  email: null,
  website: null,
}

export function toCompanyProfile(org: Organization): CompanyProfile {
  return {
    name: org.name || DEFAULT_COMPANY.name,
    logoData: org.logo_data ?? null,
    address: org.address ?? null,
    phone: org.phone ?? null,
    email: org.email ?? null,
    website: org.website ?? null,
  }
}

export async function getCompanyProfile(
  supabase: SupabaseServer,
  orgId: string
): Promise<CompanyProfile> {
  const { data } = await supabase
    .from("organizations")
    .select("name, logo_data, address, phone, email, website")
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
  }
}

export function companyContactLine(company: CompanyProfile): string {
  return [company.address, company.phone, company.email, company.website]
    .filter(Boolean)
    .join(" • ")
}