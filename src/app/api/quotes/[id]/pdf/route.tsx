import { renderToBuffer } from "@react-pdf/renderer"
import { createClient } from "@/lib/supabase/server"
import { getCompanyProfile } from "@/lib/company"
import QuoteDocument from "@/components/pdf/quote-document"
import type { Quote, QuoteItem, Contact } from "@/types/database"

export const runtime = "nodejs"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return new Response("Unauthorized", { status: 401 })
  }

  const { data: quote } = await supabase
    .from("quotes")
    .select("*, contacts(*), quote_items(*)")
    .eq("id", id)
    .single()

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