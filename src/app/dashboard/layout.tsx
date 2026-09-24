import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { isSuperAdmin } from "@/lib/admin"
import { getCompanyProfile } from "@/lib/company"
import Sidebar from "@/components/sidebar"
import Header from "@/components/header"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const { data: membership } = await supabase
    .from("memberships")
    .select("org_id")
    .eq("user_id", user.id)
    .single()

  const company = membership
    ? await getCompanyProfile(supabase, membership.org_id)
    : null

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        isSuperAdmin={isSuperAdmin(user.email)}
        companyName={company?.name}
        companyLogo={company?.logoData}
      />
      <div className="flex flex-1 flex-col overflow-hidden pl-64">
        <Header userEmail={user.email ?? ""} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}
