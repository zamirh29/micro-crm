import type { Metadata } from "next"
import Link from "next/link"
import Image from "next/image"
import {
  ArrowRight,
  Bell,
  Coins,
  FileText,
  History,
  Landmark,
  Receipt,
  Settings,
  Upload,
  Users,
  BarChart3,
} from "lucide-react"

export const metadata: Metadata = {
  title: "Product Tour - MicroCRM",
  description:
    "A guided tour of MicroCRM: leads, quotes, invoices, reminders, expenses, spreadsheet import and UK tax reports.",
}

// The tour screenshots are captured at 1280x860 CSS pixels with a 2x device
// pixel ratio, so every asset shares the same intrinsic size.
const SHOT_WIDTH = 2560
const SHOT_HEIGHT = 1720

type Shot = {
  src: string
  alt: string
  caption: string
}

type TourSection = {
  id: string
  icon: typeof Users
  title: string
  blurb: string
  shots: Shot[]
}

const sections: TourSection[] = [
  {
    id: "dashboard",
    icon: BarChart3,
    title: "Everything at a glance",
    blurb:
      "Open the app and you know where the business stands: pipeline value, what is overdue, what is due this week, and everything you touched in the last ten days.",
    shots: [
      {
        src: "/guide/dashboard.png",
        alt: "MicroCRM dashboard showing pipeline totals, overdue invoices and recent activity",
        caption: "The dashboard rolls up quotes, invoices and cash in one view.",
      },
    ],
  },
  {
    id: "customers",
    icon: Users,
    title: "Leads & customers",
    blurb:
      "Every lead, prospect and client in one searchable list. Keep notes against the person, and see every quote and invoice you have raised for them without leaving the page.",
    shots: [
      {
        src: "/guide/customers.png",
        alt: "Customer list table with name, company, status and value columns",
        caption: "The customer list, sortable and searchable.",
      },
      {
        src: "/guide/customer-new.png",
        alt: "New customer form with name, company, email and status fields",
        caption: "Adding a customer takes a few seconds.",
      },
      {
        src: "/guide/customer-detail.png",
        alt: "Customer detail page showing contact information, quotes and invoices",
        caption: "One page per customer, with their documents attached.",
      },
    ],
  },
  {
    id: "quotes",
    icon: FileText,
    title: "Quotes",
    blurb:
      "Build a quote line by line, set the VAT rate and currency, then send it as a PDF. Accepted quotes convert to an invoice in a single click so nothing gets retyped.",
    shots: [
      {
        src: "/guide/quotes.png",
        alt: "Quotes list showing numbers, customers, totals and statuses",
        caption: "Track every quote from draft to accepted.",
      },
      {
        src: "/guide/quote-new.png",
        alt: "New quote form with line items, quantities and unit prices",
        caption: "Line items with automatic VAT calculation.",
      },
      {
        src: "/guide/quote-detail.png",
        alt: "Quote detail page with PDF, send and convert actions",
        caption: "Send as PDF, or convert straight to an invoice.",
      },
    ],
  },
  {
    id: "invoices",
    icon: Receipt,
    title: "Invoices",
    blurb:
      "Clean, professional invoice PDFs your clients will take seriously. Mark invoices paid, chase the overdue ones, and keep a running total of what you are owed.",
    shots: [
      {
        src: "/guide/invoices.png",
        alt: "Invoices list with numbers, customers, due dates, totals and statuses",
        caption: "Every invoice, with due dates and status at a glance.",
      },
      {
        src: "/guide/invoice-detail.png",
        alt: "Overdue invoice detail page with send, PDF and mark as paid actions",
        caption: "Overdue invoices surface the actions you need immediately.",
      },
    ],
  },
  {
    id: "reminders",
    icon: Bell,
    title: "Reminders",
    blurb:
      "Never let a follow-up slip. Set reminders against quotes, invoices or important dates and work through the outstanding list.",
    shots: [
      {
        src: "/guide/reminders.png",
        alt: "Reminders list showing what is due and when",
        caption: "Your outstanding follow-ups, in date order.",
      },
    ],
  },
  {
    id: "expenses",
    icon: Coins,
    title: "Expenses",
    blurb:
      "Log costs against the month so you know what you actually took home, not just what you invoiced.",
    shots: [
      {
        src: "/guide/expenses.png",
        alt: "Expenses page listing costs for a selected month",
        caption: "Monthly expenses feed the reports below.",
      },
    ],
  },
  {
    id: "reports",
    icon: Landmark,
    title: "Reports",
    blurb:
      "Sales, month-end and UK tax reports generated from your real data, including estimated income tax and when Making Tax Digital applies to you.",
    shots: [
      {
        src: "/guide/sales-report.png",
        alt: "Sales report breaking down revenue by customer",
        caption: "Who actually paid, and how much.",
      },
      {
        src: "/guide/tax-report.png",
        alt: "Tax report showing estimated income tax and Making Tax Digital thresholds",
        caption: "Estimated tax and your MTD threshold.",
      },
      {
        src: "/guide/month-end-report.png",
        alt: "Month-end report summarising income, expenses and net position",
        caption: "A month-end summary you can hand to your accountant.",
      },
    ],
  },
  {
    id: "import",
    icon: Upload,
    title: "Import from a spreadsheet",
    blurb:
      "Already keeping your records elsewhere? Upload a spreadsheet and MicroCRM matches the columns for you, flags anything that will not import, and shows you exactly what will be created before you commit.",
    shots: [
      {
        src: "/guide/import-step1.png",
        alt: "Import wizard first step with a file upload control",
        caption: "Upload your existing spreadsheet.",
      },
      {
        src: "/guide/import-step3-review.png",
        alt: "Import review step showing auto-detected columns and per-invoice validation",
        caption: "Columns are detected automatically, and each row is validated before anything is written.",
      },
    ],
  },
  {
    id: "activity",
    icon: History,
    title: "Activity & restore",
    blurb:
      "A ten-day activity log records what was created, edited and deleted, so an accidental deletion is a click to recover rather than a lost afternoon.",
    shots: [
      {
        src: "/guide/activity.png",
        alt: "Activity log listing recent changes with restore controls",
        caption: "Ten days of history, with restore.",
      },
    ],
  },
  {
    id: "settings",
    icon: Settings,
    title: "Branding & settings",
    blurb:
      "Put your own logo and details on the PDFs your clients see, and manage email templates and report emails from one place.",
    shots: [
      {
        src: "/guide/settings.png",
        alt: "Settings page with company details and branding options",
        caption: "Your logo and details on every PDF.",
      },
    ],
  },
  {
    id: "billing",
    icon: Landmark,
    title: "Billing",
    blurb:
      "Manage your plan and payment method in-app. Start free, upgrade when you outgrow the limits, cancel whenever you like.",
    shots: [
      {
        src: "/guide/billing.png",
        alt: "Billing page showing current plan and payment details",
        caption: "Your plan and payment details.",
      },
    ],
  },
]

export default function GuidePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link href="/" className="text-lg font-bold tracking-tight">
            MicroCRM
          </Link>
          <nav className="flex items-center gap-4">
            <Link
              href="/pricing"
              className="hidden text-sm font-medium text-muted-foreground hover:text-foreground sm:block"
            >
              Pricing
            </Link>
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
        <section className="mx-auto max-w-4xl px-4 py-16 text-center">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            A tour of MicroCRM
          </h1>
          <p className="mx-auto mt-4 text-lg text-muted-foreground">
            Real screens from the app, no mockups. Here is what you get for
            leads, quotes, invoices, reminders and UK tax reporting.
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
            90 days free on the Free plan. Cancel anytime.
          </p>
        </section>

        <nav
          aria-label="Tour sections"
          className="mx-auto max-w-6xl px-4 pb-4"
        >
          <ul className="flex flex-wrap justify-center gap-2">
            {sections.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <section.icon className="h-3.5 w-3.5" />
                  {section.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {sections.map((section) => (
          <section
            key={section.id}
            id={section.id}
            className="scroll-mt-4 border-t border-border py-16"
          >
            <div className="mx-auto max-w-6xl px-4">
              <div className="mx-auto max-w-3xl">
                <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
                  <section.icon className="h-6 w-6 text-primary" />
                  {section.title}
                </h2>
                <p className="mt-3 text-muted-foreground">{section.blurb}</p>
              </div>

              <div className="mt-8 grid gap-6 sm:grid-cols-2">
                {section.shots.map((shot, index) => (
                  <figure
                    key={shot.src}
                    className={
                      section.shots.length > 1 && index === 0
                        ? "sm:col-span-2"
                        : undefined
                    }
                  >
                    <div className="overflow-hidden rounded-lg border border-border bg-card">
                      <Image
                        src={shot.src}
                        alt={shot.alt}
                        width={SHOT_WIDTH}
                        height={SHOT_HEIGHT}
                        className="h-auto w-full"
                        sizes="(min-width: 640px) 100vw, 100vw"
                      />
                    </div>
                    <figcaption className="mt-2 text-sm text-muted-foreground">
                      {shot.caption}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>
          </section>
        ))}

        <section className="border-t border-border py-16">
          <div className="mx-auto max-w-3xl px-4 text-center">
            <h2 className="text-2xl font-bold tracking-tight">
              Ready to try it on your own customers?
            </h2>
            <p className="mt-3 text-muted-foreground">
              90 days free on the Free plan. No card required.
            </p>
            <Link
              href="/signup"
              className="mt-6 inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
            >
              Get Started
              <ArrowRight className="h-4 w-4" />
            </Link>
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