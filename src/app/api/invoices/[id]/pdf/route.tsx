import { renderToBuffer } from "@react-pdf/renderer"
import { requireApiUser } from "@/lib/api-auth"
import { getCompanyProfile } from "@/lib/company"
import InvoiceDocument from "@/components/pdf/invoice-document"
import type { Invoice, InvoiceItem, Contact } from "@/types/database"

export const runtime = "nodejs"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const auth = await requireApiUser(req)
  if (!auth.ok) return auth.response

  const supabase = auth.supabase

  const { data: invoice } = await supabase
    .from("invoices")
    .select("*, contacts(*), invoice_items(*)")
    .eq("id", id)
    .eq("org_id", auth.orgId)
    .maybeSingle()

  if (!invoice) {
    return new Response("Not found", { status: 404 })
  }

  const company = await getCompanyProfile(supabase, invoice.org_id)

  const buffer = await renderToBuffer(
    <InvoiceDocument
      invoice={invoice as unknown as Invoice}
      items={(invoice.invoice_items ?? []) as InvoiceItem[]}
      contact={(invoice.contacts as Contact | null) ?? null}
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
      "Content-Disposition": `inline; filename="${invoice.number}.pdf"`,
    },
  })
}