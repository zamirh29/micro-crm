import { redirect } from "next/navigation"
import { ShieldCheck, BadgeCheck, LogIn } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { isSuperAdmin } from "@/lib/admin"
import { setCustomerPlan, openAccount, setOrgBusinessType } from "./actions"
import { formatDate } from "@/lib/utils"

export const dynamic = "force-dynamic"

const BUSINESS_TYPE_LABELS: Record<string, string> = {
  sole_trader: "Sole trader",
  ltd: "Limited company (Ltd)",
  llp: "LLP",
  plc: "PLC",
  lbg: "LBG",
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>
}) {
  const sp = await searchParams
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
      admin.from("organizations").select("id, name, business_type"),
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
      orgId: membership.org_id,
      orgName: org?.name ?? "Unknown",
      businessType: org?.business_type ?? "sole_trader",
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
          Open a customer&apos;s account to work directly in it, activate or
          revert Pro for customers without payment, or change an
          organization&apos;s business type.
        </p>
      </div>

      {sp.error && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {sp.error}
        </div>
      )}

      {sp.saved === "business_type" && (
        <div className="rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200">
          Business type saved.
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-border">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Organization</th>
                <th className="px-4 py-3 font-medium">Business type</th>
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
                    <form
                      action={setOrgBusinessType}
                      className="flex items-center gap-2"
                    >
                      <input type="hidden" name="orgId" value={row.orgId} />
                      <select
                        key={`${row.orgId}-${row.businessType}`}
                        name="businessType"
                        defaultValue={row.businessType}
                        className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                      >
                        {Object.entries(BUSINESS_TYPE_LABELS).map(
                          ([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          )
                        )}
                      </select>
                      <button
                        type="submit"
                        className="rounded-md border border-border px-2 py-1.5 text-xs font-medium hover:bg-muted"
                      >
                        Save
                      </button>
                    </form>
                  </td>
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
                    <div className="flex flex-wrap items-center gap-2">
                      {row.userId !== user.id && (
                        <form action={openAccount}>
                          <input
                            type="hidden"
                            name="userId"
                            value={row.userId}
                          />
                          <button
                            type="submit"
                            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                          >
                            <LogIn className="h-3 w-3" />
                            Open account
                          </button>
                        </form>
                      )}
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
                            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                          >
                            Activate Pro
                          </button>
                        </form>
                      )}
                    </div>
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