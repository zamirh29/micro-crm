import { redirect } from "next/navigation"
import { ShieldCheck, BadgeCheck } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { isSuperAdmin } from "@/lib/admin"
import { setCustomerPlan } from "./actions"
import { formatDate } from "@/lib/utils"

export const dynamic = "force-dynamic"

export default async function AdminPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  if (!isSuperAdmin(user.email)) {
    redirect("/dashboard")
  }

  const admin = createAdminClient()

  const [{ data: subscriptions }, { data: profiles }, { data: memberships }, { data: organizations }] =
    await Promise.all([
      admin
        .from("subscriptions")
        .select("user_id, org_id, plan, status, created_at")
        .order("created_at", { ascending: false }),
      admin.from("profiles").select("id, email, full_name"),
      admin.from("memberships").select("user_id, org_id, role"),
      admin.from("organizations").select("id, name"),
    ])

  const owners = memberships?.filter((m) => m.role === "owner") ?? []

  const rows = owners.map((membership) => {
    const profile = profiles?.find((p) => p.id === membership.user_id)
    const org = organizations?.find((o) => o.id === membership.org_id)
    const sub = subscriptions?.find((s) => s.user_id === membership.user_id) ??
      subscriptions?.find((s) => s.org_id === membership.org_id)
    const isPro = sub?.plan === "pro"
    return {
      userId: membership.user_id,
      email: profile?.email ?? "Unknown",
      fullName: profile?.full_name,
      orgName: org?.name ?? "Unknown",
      plan: sub?.plan ?? "free",
      status: sub?.status ?? "active",
      createdAt: sub?.created_at ?? "",
      isPro,
    }
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <ShieldCheck className="h-6 w-6 text-primary" />
          Super Admin
        </h1>
        <p className="text-sm text-muted-foreground">
          Activate or revert Pro for customers without payment.
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Organization</th>
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Active since</th>
                <th className="px-4 py-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr key={row.userId}>
                  <td className="px-4 py-3">
                    <p className="font-medium">{row.email}</p>
                    {row.fullName && (
                      <p className="text-xs text-muted-foreground">
                        {row.fullName}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">{row.orgName}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                        row.isPro
                          ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {row.isPro && <BadgeCheck className="h-3 w-3" />}
                      {row.plan}
                    </span>
                  </td>
                  <td className="px-4 py-3 capitalize">{row.status}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {row.createdAt ? formatDate(row.createdAt) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {row.isPro ? (
                      <form action={setCustomerPlan}>
                        <input
                          type="hidden"
                          name="userId"
                          value={row.userId}
                        />
                        <input type="hidden" name="action" value="revert" />
                        <button
                          type="submit"
                          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                        >
                          Revert to Free
                        </button>
                      </form>
                    ) : (
                      <form action={setCustomerPlan}>
                        <input
                          type="hidden"
                          name="userId"
                          value={row.userId}
                        />
                        <input type="hidden" name="action" value="activate" />
                        <button
                          type="submit"
                          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                        >
                          Activate Pro
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && (
          <p className="p-6 text-center text-sm text-muted-foreground">
            No customers found.
          </p>
        )}
      </div>
    </div>
  )
}