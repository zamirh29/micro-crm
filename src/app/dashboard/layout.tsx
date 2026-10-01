import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { isSuperAdmin } from "@/lib/admin"
import { getImpersonation } from "@/lib/impersonation"
import { getCompanyProfile } from "@/lib/company"
import { exitImpersonation } from "@/app/dashboard/admin/actions"
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

  const impersonation = await getImpersonation()
  const impersonating = impersonation !== null && impersonation.userId === user.id

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        isSuperAdmin={isSuperAdmin(user.email)}
        companyName={company?.name}
        companyLogo={company?.logoData}
      />
      <div className="flex flex-1 flex-col overflow-hidden pl-64">
        {impersonating && impersonation && (
          <div className="flex items-center justify-between gap-4 border-b border-amber-300 bg-amber-50 px-6 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
            <p className="truncate">
              Viewing{" "}
              <span className="font-semibold">{impersonation.email}</span>
              &apos;s account as super admin.
            </p>
            <form action={exitImpersonation} className="shrink-0">
              <button
                type="submit"
                className="rounded-md border border-amber-400 px-3 py-1 text-xs font-semibold hover:bg-amber-100 dark:hover:bg-amber-900"
              >
                Exit to my account
              </button>
            </form>
          </div>
        )}
        <Header userEmail={user.email ?? ""} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}
