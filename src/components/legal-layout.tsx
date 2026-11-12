import Link from "next/link"
import type { ReactNode } from "react"

/**
 * Shared chrome for the public legal pages (/privacy, /terms).
 *
 * These routes must stay reachable without a session: Google Play requires the
 * privacy policy URL on the store listing to load for reviewers, and the mobile
 * app links straight to them from Settings.
 */
export function LegalLayout({
  title,
  updated,
  children,
}: {
  title: string
  updated: string
  children: ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Link href="/" className="text-lg font-bold tracking-tight">
            MicroCRM
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link
              href="/privacy"
              className="text-muted-foreground hover:text-foreground"
            >
              Privacy
            </Link>
            <Link
              href="/terms"
              className="text-muted-foreground hover:text-foreground"
            >
              Terms
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-4 py-12">
          <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Last updated {updated}
          </p>
          <div className="mt-8 space-y-6 text-sm leading-6 text-muted-foreground [&_a]:text-primary [&_a]:underline [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-foreground [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-foreground">
            {children}
          </div>
        </div>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-3xl flex-col gap-2 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} DTMS HIRE LTD. All rights reserved.</p>
          <p>
            <Link href="/privacy" className="hover:text-foreground">
              Privacy policy
            </Link>{" "}
            ·{" "}
            <Link href="/terms" className="hover:text-foreground">
              Terms of service
            </Link>{" "}
            ·{" "}
            <Link href="/delete-account" className="hover:text-foreground">
              Delete account
            </Link>
          </p>
        </div>
      </footer>
    </div>
  )
}
