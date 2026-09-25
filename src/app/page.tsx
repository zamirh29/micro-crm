import Link from "next/link"
import { Check, Users, FileText, Receipt, Bell, Landmark } from "lucide-react"
import { PLANS } from "@/lib/plans"
import { formatCurrency } from "@/lib/utils"

const features = [
  {
    icon: Users,
    title: "Leads & Customers",
    description:
      "Track every lead, prospect, and client in one simple place. Add notes and stay organized.",
  },
  {
    icon: FileText,
    title: "Quotes",
    description:
      "Create professional quotes in seconds. Send them to clients and track acceptance.",
  },
  {
    icon: Receipt,
    title: "Invoices",
    description:
      "Generate invoices from quotes or from scratch. Get paid faster with clean, professional PDFs.",
  },
  {
    icon: Landmark,
    title: "UK Tax Reports",
    description:
      "See your estimated income tax and find out when HMRC's Making Tax Digital will apply to you. On Pro.",
  },
  {
    icon: Bell,
    title: "Reminders",
    description:
      "Never miss a follow-up. Set reminders for quotes, invoices, and important dates.",
  },
]

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <span className="text-lg font-bold tracking-tight">MicroCRM</span>
          <nav className="flex items-center gap-4">
            <Link
              href="/login"
              className="text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Get Started
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-4 py-20 text-center">
          <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
            The CRM built for sole traders
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            Manage leads, quotes, invoices, and reminders in one simple app.
            No complexity. No bloat. Just the tools you need to run your
            business.
          </p>
          <div className="mt-8 flex items-center justify-center gap-4">
            <Link
              href="/signup"
              className="rounded-md bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
            >
              Start Free
            </Link>
            <Link
              href="/pricing"
              className="rounded-md border border-border bg-background px-6 py-3 text-sm font-semibold hover:bg-muted"
            >
              View Pricing
            </Link>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            90 days free on the Free plan. First 3 months of Pro on us. Cancel anytime.
          </p>
        </section>

        <section className="border-y border-border bg-muted/50 py-16">
          <div className="mx-auto max-w-6xl px-4">
            <h2 className="text-center text-2xl font-bold tracking-tight">
              Everything you need to run your business
            </h2>
            <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {features.map((feature) => (
                <div
                  key={feature.title}
                  className="rounded-lg border border-border bg-card p-6"
                >
                  <feature.icon className="h-6 w-6 text-primary" />
                  <h3 className="mt-4 font-semibold">{feature.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-center text-2xl font-bold tracking-tight">
            Simple, transparent pricing
          </h2>
          <div className="mx-auto mt-10 grid max-w-3xl gap-6 sm:grid-cols-2">
            {Object.entries(PLANS).map(([key, plan]) => (
              <div
                key={key}
                className={`rounded-lg border bg-card p-6 ${
                  key === "pro" ? "border-primary ring-1 ring-primary" : "border-border"
                }`}
              >
                <h3 className="text-lg font-semibold">{plan.name}</h3>
                <p className="mt-2 text-3xl font-bold">
                  {plan.price > 0 ? formatCurrency(plan.price) : "Free"}
                  {plan.price > 0 && (
                    <span className="text-sm font-normal text-muted-foreground">
                      /month
                    </span>
                  )}
                </p>
                <ul className="mt-4 space-y-2">
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-center gap-2 text-sm"
                    >
                      <Check className="h-4 w-4 text-green-500" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Link
                  href={key === "pro" ? "/signup" : "/signup"}
                  className={`mt-6 block rounded-md px-4 py-2 text-center text-sm font-semibold ${
                    key === "pro"
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : "border border-border hover:bg-muted"
                  }`}
                >
                  Get Started
                </Link>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-6">
        <div className="mx-auto max-w-6xl px-4 text-center text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} MicroCRM. All rights reserved.
        </div>
      </footer>
    </div>
  )
}
