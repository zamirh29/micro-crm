export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-2xl font-bold text-primary-foreground">
        M
      </div>
      <h1 className="text-xl font-semibold text-foreground">
        You&apos;re offline
      </h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        MicroCRM couldn&apos;t reach the network. Data you already viewed is
        still available — reconnect to load anything new.
      </p>
      <a
        href="/dashboard"
        className="mt-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Try again
      </a>
    </main>
  )
}
