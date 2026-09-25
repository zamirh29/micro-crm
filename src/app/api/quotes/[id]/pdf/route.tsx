import { renderToBuffer } from "@react-pdf/renderer"
import { requireApiUser } from "@/lib/api-auth"
import { getCompanyProfile } from "@/lib/company"
import QuoteDocument from "@/components/pdf/quote-document"
import type { Quote, QuoteItem, Contact } from "@/types/database"

export const runtime = "nodejs"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const auth = await requireApiUser(req)
  if (!auth.ok) return auth.response

  const supabase = auth.supabase

  const { data: quote } = await supabase
    .from("quotes")
    .select("*, contacts(*), quote_items(*)")
    .eq("id", id)
    .eq("org_id", auth.orgId)
    .maybeSingle()

  if (!quote) {
    return new Response("Not found", { status: 404 })
  }

  const company = await getCompanyProfile(supabase, quote.org_id)

  const buffer = await renderToBuffer(
    <QuoteDocument
      quote={quote as unknown as Quote}
      items={(quote.quote_items ?? []) as QuoteItem[]}
      contact={(quote.contacts as Contact | null) ?? null}
      companyName={company.name}
      companyLogo={company.logoData ?? undefined}
      companyAddress={company.address ?? ""}
      companyPhone={company.phone ?? ""}
      companyEmail={company.email ?? ""}
      companyWebsite={company.website ?? ""}
    />
  )

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${quote.number}.pdf"`,
    },
  })
}