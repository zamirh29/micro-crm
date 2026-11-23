"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  CheckCircle2,
  Landmark,
  Link2,
  Loader2,
  RefreshCw,
  Upload,
} from "lucide-react"
import type {
  PostingMode,
  PublicBankConnection,
  PublicBankTransaction,
} from "@/lib/bank-feed/types"

interface Status {
  pro: boolean
  configured: boolean
  environment: "sandbox" | "production"
  country: string
}

interface InvoiceOption {
  id: string
  number: string
  total: number | string
  contacts?: { first_name?: string; last_name?: string; company?: string } | null
}

type Banner = { kind: "error" | "success"; message: string } | null

async function api<T>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options?.body ? { "Content-Type": "application/json" } : {}),
      ...(options?.headers ?? {}),
    },
  })
  const data = (await response.json().catch(() => ({}))) as T & {
    error?: string
  }
  if (!response.ok) throw new Error(data.error ?? "Request failed")
  return data
}

function money(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency || "GBP",
  }).format(amount)
}

function date(value: string): string {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

export default function BankFeedClient() {
  const [status, setStatus] = useState<Status | null>(null)
  const [connections, setConnections] = useState<PublicBankConnection[]>([])
  const [transactions, setTransactions] = useState<PublicBankTransaction[]>([])
  const [invoices, setInvoices] = useState<InvoiceOption[]>([])
  const [banner, setBanner] = useState<Banner>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [filter, setFilter] = useState("all")

  const load = useCallback(async () => {
    try {
      const [
        statusResult,
        connectionResult,
        transactionResult,
        sentInvoices,
        overdueInvoices,
      ] = await Promise.all([
        api<Status>("/api/bank-feed/status"),
        api<{ connections: PublicBankConnection[] }>("/api/bank-feed/connections"),
        api<{ transactions: PublicBankTransaction[] }>(
          "/api/bank-feed/transactions?limit=300"
        ),
        api<{ invoices: InvoiceOption[] }>("/api/invoices?status=sent&limit=200"),
        api<{ invoices: InvoiceOption[] }>("/api/invoices?status=overdue&limit=200"),
      ])
      setStatus(statusResult)
      setConnections(connectionResult.connections)
      setTransactions(transactionResult.transactions)
      setInvoices([...sentInvoices.invoices, ...overdueInvoices.invoices])

      const params = new URLSearchParams(window.location.search)
      if (params.get("connected") === "1") {
        setBanner({
          kind: "success",
          message: `Bank connected. ${params.get("accounts") ?? "1"} account(s) imported.`,
        })
      } else if (params.get("error")) {
        setBanner({ kind: "error", message: params.get("error") ?? "" })
      }
    } catch (err) {
      setBanner({
        kind: "error",
        message: err instanceof Error ? err.message : "Could not load bank feed",
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Data fetching is synchronisation with an external system; state updates
    // happen only after the API responses resolve.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const visibleTransactions = useMemo(
    () =>
      filter === "all"
        ? transactions
        : transactions.filter((txn) => txn.reviewStatus === filter),
    [filter, transactions]
  )

  async function sync(connectionId?: string) {
    setBusy("sync")
    setBanner(null)
    try {
      const result = await api<{ imported: number; posted: number }>(
        "/api/bank-feed/sync",
        {
          method: "POST",
          body: JSON.stringify(connectionId ? { connectionId } : {}),
        }
      )
      setBanner({
        kind: "success",
        message: `Synced ${result.imported} transaction(s)${
          result.posted ? ` and posted ${result.posted}` : ""
        }.`,
      })
      await load()
    } catch (err) {
      setBanner({
        kind: "error",
        message: err instanceof Error ? err.message : "Sync failed",
      })
    } finally {
      setBusy(null)
    }
  }

  async function updateConnection(
    connectionId: string,
    payload: Record<string, unknown>
  ) {
    setBusy(connectionId)
    setBanner(null)
    try {
      const result = await api<{ connections: PublicBankConnection[] }>(
        "/api/bank-feed/connections",
        {
          method: "POST",
          body: JSON.stringify({ connectionId, ...payload }),
        }
      )
      setConnections(result.connections)
    } catch (err) {
      setBanner({
        kind: "error",
        message: err instanceof Error ? err.message : "Update failed",
      })
    } finally {
      setBusy(null)
    }
  }

  async function actOnTransaction(
    txn: PublicBankTransaction,
    action: "post" | "ignore",
    form: HTMLFormElement
  ) {
    setBusy(txn.id)
    setBanner(null)
    const data = new FormData(form)
    try {
      const result = await api<{ message: string }>(
        "/api/bank-feed/transactions",
        {
          method: "POST",
          body: JSON.stringify({
            transactionId: txn.id,
            action,
            invoiceId: data.get("invoiceId") || txn.suggestedInvoiceId,
            category: data.get("category") || txn.categoryHint,
          }),
        }
      )
      setBanner({ kind: "success", message: result.message })
      await load()
    } catch (err) {
      setBanner({
        kind: "error",
        message: err instanceof Error ? err.message : "Update failed",
      })
    } finally {
      setBusy(null)
    }
  }

  async function importStatement(file: File) {
    setBusy("import")
    setBanner(null)
    try {
      const content = await file.text()
      const result = await api<{ imported: number; skipped: number }>(
        "/api/bank-feed/import",
        {
          method: "POST",
          body: JSON.stringify({ fileName: file.name, content }),
        }
      )
      setBanner({
        kind: "success",
        message: `Imported ${result.imported} transaction(s)${
          result.skipped ? `, skipped ${result.skipped}` : ""
        }.`,
      })
      await load()
    } catch (err) {
      setBanner({
        kind: "error",
        message: err instanceof Error ? err.message : "Import failed",
      })
    } finally {
      setBusy(null)
    }
  }

  const canConnect = Boolean(status?.pro && status.configured)

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Landmark className="h-6 w-6 text-primary" />
            Bank feed
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Connect a UK bank account read-only, review settled transactions and
            post them to invoices or expenses. We never store your bank login
            details.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void sync()}
            disabled={busy === "sync" || connections.length === 0}
            className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            {busy === "sync" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Sync all
          </button>
          <a
            href="/api/bank-feed/connect"
            aria-disabled={!canConnect}
            className={`inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground ${
              canConnect ? "hover:bg-primary/90" : "pointer-events-none opacity-50"
            }`}
          >
            <Link2 className="h-4 w-4" />
            Connect UK bank
          </a>
        </div>
      </div>

      {banner && (
        <div
          className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${
            banner.kind === "error"
              ? "border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
              : "border-green-300 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200"
          }`}
        >
          {banner.kind === "error" ? (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          {banner.message}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading bank feed…
        </div>
      ) : (
        <>
          {status && (!status.pro || !status.configured) && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
              <div className="flex items-center gap-2 font-semibold">
                <AlertTriangle className="h-4 w-4" />
                Live bank connections are not ready yet
              </div>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {!status.pro && <li>Upgrade to Pro to use bank feeds.</li>}
                {!status.configured && (
                  <>
                    <li>
                      Add TRUELAYER_CLIENT_ID, TRUELAYER_CLIENT_SECRET and
                      BANK_FEED_ENCRYPTION_KEY to Vercel.
                    </li>
                    <li>
                      Register{" "}
                      <code>https://crm.dtmstechsolutions.co.uk/api/bank-feed/callback/truelayer</code>{" "}
                      as a TrueLayer redirect URI.
                    </li>
                  </>
                )}
              </ul>
              <p className="mt-2">
                CSV/OFX import remains available as the fallback while provider
                approval is completed.
              </p>
            </div>
          )}

          <section className="rounded-lg border border-border bg-card p-6">
            <h2 className="text-sm font-semibold">Connected accounts</h2>
            {connections.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                No bank accounts connected yet.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {connections.map((connection) => (
                  <div
                    key={connection.id}
                    className="rounded-md border border-border p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="font-medium">
                          {connection.bankName}
                          {connection.accountName
                            ? ` — ${connection.accountName}`
                            : ""}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {connection.provider.toUpperCase()} ·{" "}
                          {connection.environment} ·{" "}
                          {connection.accountMask
                            ? `•••• ${connection.accountMask}`
                            : connection.currency}
                          {connection.consentExpiresAt
                            ? ` · consent until ${date(connection.consentExpiresAt)}`
                            : ""}
                        </div>
                        <div className="mt-1 text-xs">
                          Status:{" "}
                          <span
                            className={
                              connection.status === "active"
                                ? "text-green-700 dark:text-green-300"
                                : "text-amber-700 dark:text-amber-300"
                            }
                          >
                            {connection.status}
                          </span>
                          {connection.lastError
                            ? ` — ${connection.lastError.slice(0, 120)}`
                            : ""}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {connection.provider === "truelayer" && (
                          <button
                            type="button"
                            onClick={() => void sync(connection.id)}
                            disabled={busy !== null}
                            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
                          >
                            Sync
                          </button>
                        )}
                        {connection.status !== "revoked" && (
                          <button
                            type="button"
                            onClick={() =>
                              void updateConnection(connection.id, {
                                action: "revoke",
                              })
                            }
                            disabled={busy !== null}
                            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
                          >
                            Revoke
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                      <label htmlFor={`mode-${connection.id}`}>
                        Posting mode
                      </label>
                      <select
                        id={`mode-${connection.id}`}
                        defaultValue={connection.postingMode}
                        onChange={(event) =>
                          void updateConnection(connection.id, {
                            action: "posting_mode",
                            postingMode: event.target
                              .value as PostingMode,
                          })
                        }
                        className="rounded-md border border-border bg-background px-2 py-1"
                      >
                        <option value="review">Review everything</option>
                        <option value="auto_exact">Auto-post exact matches</option>
                        <option value="auto_all">Auto-post all</option>
                      </select>
                      <span className="text-muted-foreground">
                        Applies to new and unreviewed transactions.
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-lg border border-border bg-card p-6">
            <h2 className="text-sm font-semibold">CSV / OFX fallback</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Export a statement from any bank and upload it here. Nothing is
              posted until you review each transaction.
            </p>
            <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted">
              <Upload className="h-4 w-4" />
              {busy === "import" ? "Importing…" : "Choose CSV or OFX file"}
              <input
                type="file"
                accept=".csv,.ofx,.qfx,text/csv"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) void importStatement(file)
                  event.target.value = ""
                }}
              />
            </label>
          </section>

          <section className="rounded-lg border border-border bg-card p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">Transactions to review</h2>
              <select
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                className="rounded-md border border-border bg-background px-2 py-1 text-sm"
              >
                <option value="all">All</option>
                <option value="unreviewed">Unreviewed</option>
                <option value="suggested">Suggested matches</option>
                <option value="posted">Posted</option>
                <option value="ignored">Ignored</option>
                <option value="needs_review">Needs review</option>
              </select>
            </div>

            {visibleTransactions.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                No transactions in this view.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {visibleTransactions.map((txn) => (
                  <form
                    key={txn.id}
                    onSubmit={(event) => event.preventDefault()}
                    className="rounded-md border border-border p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="font-medium">{txn.description}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {date(txn.bookedAt)} · {txn.provider} · {txn.direction}
                          {txn.sourceFileName ? ` · ${txn.sourceFileName}` : ""}
                        </div>
                      </div>
                      <div
                        className={`font-semibold ${
                          txn.amount >= 0
                            ? "text-green-700 dark:text-green-300"
                            : "text-red-700 dark:text-red-300"
                        }`}
                      >
                        {money(txn.amount, txn.currency)}
                      </div>
                    </div>

                    {txn.reviewStatus === "posted" ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Posted {txn.postedAt ? date(txn.postedAt) : ""}
                      </p>
                    ) : txn.reviewStatus === "ignored" ? (
                      <p className="mt-2 text-xs text-muted-foreground">Ignored</p>
                    ) : (
                      <div className="mt-3 flex flex-wrap items-end gap-2">
                        {txn.direction === "money_in" ? (
                          <label className="text-xs">
                            <span className="mb-1 block font-medium">
                              Match invoice
                            </span>
                            <select
                              name="invoiceId"
                              defaultValue={txn.suggestedInvoiceId ?? ""}
                              className="max-w-xs rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                            >
                              <option value="">Choose invoice…</option>
                              {invoices.map((invoice) => (
                                <option key={invoice.id} value={invoice.id}>
                                  {invoice.number} — {money(Number(invoice.total), "GBP")}
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : (
                          <label className="text-xs">
                            <span className="mb-1 block font-medium">
                              Expense category
                            </span>
                            <input
                              name="category"
                              defaultValue={txn.categoryHint ?? "Other"}
                              className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                            />
                          </label>
                        )}
                        <button
                          type="button"
                          onClick={(event) =>
                            void actOnTransaction(
                              txn,
                              "post",
                              event.currentTarget.form as HTMLFormElement
                            )
                          }
                          disabled={busy !== null}
                          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                        >
                          Post
                        </button>
                        <button
                          type="button"
                          onClick={(event) =>
                            void actOnTransaction(
                              txn,
                              "ignore",
                              event.currentTarget.form as HTMLFormElement
                            )
                          }
                          disabled={busy !== null}
                          className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
                        >
                          Ignore
                        </button>
                      </div>
                    )}
                  </form>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
