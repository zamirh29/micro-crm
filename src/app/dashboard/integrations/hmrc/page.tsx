import Link from "next/link"
import {
  AlertTriangle,
  CheckCircle2,
  Landmark,
  Link2,
  PlugZap,
  Send,
  ShieldCheck,
} from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getHmrcConfig } from "@/lib/hmrc/config"
import { getConnection, getValidAccessToken } from "@/lib/hmrc/store"
import { getVatObligations, type VatObligation } from "@/lib/hmrc/client"
import { computeVatReturnFigures } from "@/lib/hmrc/vat"
import { formatCurrency, formatDate } from "@/lib/utils"
import { disconnectHmrc, saveVatDetails, submitVatReturnAction } from "./actions"

export const dynamic = "force-dynamic"

interface PageProps {
  searchParams: Promise<{
    error?: string
    saved?: string
    connected?: string
    disconnected?: string
    submitted?: string
    bundle?: string
  }>
}

const STATUS_LABEL: Record<string, string> = {
  O: "Open",
  F: "Fulfilled",
}

async function loadObligations(orgId: string, userId: string) {
  const connection = await getConnection(orgId)
  if (!connection) return { connection: null, obligations: [] as VatObligation[], error: null }

  const to = new Date()
  const from = new Date(to)
  from.setFullYear(from.getFullYear() - 1)

  try {
    const accessToken = await getValidAccessToken(connection)
    const request = new Request(
      `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/dashboard/integrations/hmrc`
    )
    const result = await getVatObligations({
      accessToken,
      vrn: connection.vrn,
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      request,
      userId,
    })
    return { connection, obligations: result.obligations ?? [], error: null }
  } catch (err) {
    return {
      connection,
      obligations: [] as VatObligation[],
      error: err instanceof Error ? err.message : "Could not load HMRC obligations.",
    }
  }
}

export default async function HmrcPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data: membership } = await supabase
    .from("memberships")
    .select("org_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle()

  if (!membership) return null
  const orgId = membership.org_id as string

  const config = getHmrcConfig()
  const [{ connection, obligations, error: obligationsError }, { data: organization }] =
    await Promise.all([
      loadObligations(orgId, user.id),
      supabase
        .from("organizations")
        .select("vat_number, vat_registered")
        .eq("id", orgId)
        .maybeSingle(),
    ])

  const admin = createAdminClient()
  const { data: submissions } = await admin
    .from("hmrc_vat_submissions")
    .select("period_key, period_from, period_to, submitted_at, receipt")
    .eq("org_id", orgId)
    .order("submitted_at", { ascending: false })
    .limit(8)

  const openObligations = obligations.filter((o) => o.status === "O")
  const previews = await Promise.all(
    openObligations.map(async (obligation) => {
      const figures = await computeVatReturnFigures(supabase, orgId, {
        from: obligation.start,
        to: obligation.end,
      })
      return { obligation, figures }
    })
  )

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Landmark className="h-6 w-6 text-primary" />
          HMRC Making Tax Digital
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect your VAT registration to see HMRC obligations and submit VAT
          returns from the records in MicroCRM.
        </p>
      </div>

      {sp.error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {sp.error}
        </div>
      )}
      {sp.saved === "vat" && (
        <div className="flex items-center gap-2 rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200">
          <CheckCircle2 className="h-4 w-4" />
          VAT details saved.
        </div>
      )}
      {sp.connected === "1" && (
        <div className="flex items-center gap-2 rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200">
          <CheckCircle2 className="h-4 w-4" />
          Connected to HMRC.
        </div>
      )}
      {sp.disconnected === "1" && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm">
          <PlugZap className="h-4 w-4" />
          HMRC connection removed. Tokens were deleted from our database.
        </div>
      )}
      {sp.submitted === "1" && (
        <div className="flex items-center gap-2 rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200">
          <CheckCircle2 className="h-4 w-4" />
          VAT return submitted to HMRC
          {sp.bundle ? ` (receipt ${sp.bundle})` : ""}.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <form
          action={saveVatDetails}
          className="rounded-lg border border-border bg-card p-6"
        >
          <h2 className="text-sm font-semibold">VAT details</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Used to label exports and to cross-check the VAT registration number
            HMRC returns.
          </p>

          <label
            htmlFor="vat_number"
            className="mt-4 block text-sm font-medium"
          >
            VAT registration number
          </label>
          <input
            id="vat_number"
            name="vat_number"
            inputMode="numeric"
            defaultValue={organization?.vat_number ?? ""}
            placeholder="123456789"
            className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />

          <label className="mt-4 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="vat_registered"
              defaultChecked={Boolean(organization?.vat_registered)}
              className="h-4 w-4 rounded border-border"
            />
            VAT registered
          </label>

          <button
            type="submit"
            className="mt-5 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Save VAT details
          </button>
        </form>

        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="text-sm font-semibold">HMRC connection</h2>

          {!config.configured ? (
            <>
              <p className="mt-2 text-sm text-muted-foreground">
                HMRC credentials are not configured on this deployment yet.
              </p>
              <ol className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li>
                  1. Register the app on the HMRC Developer Hub and create a
                  sandbox application.
                </li>
                <li>
                  2. Add the redirect URI{" "}
                  <code className="rounded bg-muted px-1 py-0.5 text-xs">
                    {config.redirectUri || "https://your-app/api/hmrc/auth/callback"}
                  </code>
                </li>
                <li>
                  3. Set <code className="text-xs">HMRC_CLIENT_ID</code>,{" "}
                  <code className="text-xs">HMRC_CLIENT_SECRET</code> and{" "}
                  <code className="text-xs">HMRC_REDIRECT_URI</code>.
                </li>
              </ol>
            </>
          ) : connection ? (
            <>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Status</dt>
                  <dd className="inline-flex items-center gap-1 font-medium text-green-700 dark:text-green-400">
                    <ShieldCheck className="h-4 w-4" />
                    Connected
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">VRN</dt>
                  <dd className="font-mono">{connection.vrn}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Environment</dt>
                  <dd className="capitalize">{connection.environment}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Connected</dt>
                  <dd>{formatDate(connection.connectedAt)}</dd>
                </div>
              </dl>

              <form action={disconnectHmrc} className="mt-5">
                <button
                  type="submit"
                  className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
                >
                  Disconnect from HMRC
                </button>
              </form>
            </>
          ) : (
            <>
              <p className="mt-2 text-sm text-muted-foreground">
                You&apos;ll be taken to HMRC to sign in with your Government
                Gateway details and authorise MicroCRM to submit VAT returns for
                this business.
              </p>
              <form
                action="/api/hmrc/auth/start"
                method="get"
                className="mt-4 flex flex-wrap items-end gap-3"
              >
                <div className="flex-1">
                  <label
                    htmlFor="vrn"
                    className="block text-sm font-medium text-foreground"
                  >
                    VAT registration number
                  </label>
                  <input
                    id="vrn"
                    name="vrn"
                    inputMode="numeric"
                    required
                    pattern="\d{9}"
                    placeholder="123456789"
                    defaultValue={organization?.vat_number ?? ""}
                    className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />
                </div>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                >
                  <Link2 className="h-4 w-4" />
                  Connect
                </button>
              </form>
              <p className="mt-3 text-xs text-muted-foreground">
                Environment: <span className="capitalize">{config.environment}</span>.
                Tokens are encrypted at rest and can be removed at any time.
              </p>
            </>
          )}
        </div>
      </div>

      {obligationsError && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {obligationsError}
        </div>
      )}

      {connection && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">VAT obligations</h2>
            <p className="text-sm text-muted-foreground">
              Periods HMRC has on record for this VAT registration. Open periods
              can be submitted below from your MicroCRM invoices and expenses.
            </p>
          </div>

          {obligations.length === 0 ? (
            <p className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
              No obligations returned by HMRC for the last 12 months.
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-medium">Period</th>
                      <th className="px-4 py-3 font-medium">Due</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Box 1</th>
                      <th className="px-4 py-3 font-medium">Box 4</th>
                      <th className="px-4 py-3 font-medium">Box 5</th>
                      <th className="px-4 py-3 font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {obligations.map((obligation) => {
                      const preview = previews.find(
                        (row) => row.obligation.periodKey === obligation.periodKey
                      )
                      const figures = preview?.figures
                      return (
                        <tr key={obligation.periodKey}>
                          <td className="px-4 py-3">
                            {formatDate(obligation.start)} –{" "}
                            {formatDate(obligation.end)}
                          </td>
                          <td className="px-4 py-3">{formatDate(obligation.due)}</td>
                          <td className="px-4 py-3">
                            {STATUS_LABEL[obligation.status] ?? obligation.status}
                          </td>
                          <td className="px-4 py-3">
                            {figures ? formatCurrency(figures.vatDueSales * 100) : "—"}
                          </td>
                          <td className="px-4 py-3">
                            {figures
                              ? formatCurrency(figures.vatReclaimedCurrPeriod * 100)
                              : "—"}
                          </td>
                          <td className="px-4 py-3">
                            {figures ? formatCurrency(figures.netVatDue * 100) : "—"}
                          </td>
                          <td className="px-4 py-3">
                            {obligation.status === "O" && figures ? (
                              <form action={submitVatReturnAction}>
                                <input
                                  type="hidden"
                                  name="period_key"
                                  value={obligation.periodKey}
                                />
                                <input type="hidden" name="from" value={obligation.start} />
                                <input type="hidden" name="to" value={obligation.end} />
                                <button
                                  type="submit"
                                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                                >
                                  <Send className="h-3 w-3" />
                                  Submit
                                </button>
                              </form>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-900 dark:bg-amber-950">
            <p className="font-semibold text-amber-900 dark:text-amber-200">
              Check before you submit
            </p>
            <p className="mt-1 text-amber-800 dark:text-amber-300">
              Input VAT (box 4) is zero because expenses are stored gross. Sales
              in box 6 include all issued invoices in the period. Submitting a
              finalised return to HMRC cannot be undone — review the figures with
              your accountant first.{" "}
              <Link
                href="/dashboard/reports/accounting-exports"
                className="underline underline-offset-2"
              >
                Download the VAT summary
              </Link>
              .
            </p>
          </div>

          {submissions && submissions.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-border">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-medium">Submitted</th>
                      <th className="px-4 py-3 font-medium">Period key</th>
                      <th className="px-4 py-3 font-medium">Period</th>
                      <th className="px-4 py-3 font-medium">HMRC receipt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {submissions.map((row) => (
                      <tr key={row.period_key}>
                        <td className="px-4 py-3">{formatDate(row.submitted_at)}</td>
                        <td className="px-4 py-3 font-mono text-xs">{row.period_key}</td>
                        <td className="px-4 py-3">
                          {row.period_from ? formatDate(row.period_from) : "—"} –{" "}
                          {row.period_to ? formatDate(row.period_to) : "—"}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">
                          {row.receipt?.formBundleNumber ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
