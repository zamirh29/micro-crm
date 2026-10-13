import { createClient } from "@/lib/supabase/server"
import type { Metadata } from "next"
import Link from "next/link"
import {
  ArrowRight,
  BarChart3,
  Bell,
  BookOpen,
  CheckCircle2,
  Coins,
  FileText,
  History,
  Landmark,
  Receipt,
  Settings,
  Upload,
  Users,
} from "lucide-react"

export const metadata: Metadata = {
  title: "Step-by-Step Manual - MicroCRM",
  description:
    "A step-by-step guide to every section of MicroCRM: dashboard, customers, quotes, invoices, reminders, expenses, reports, import, activity, settings and billing.",
}

type Step = {
  label: string
  detail?: string
}

type Subsection = {
  title: string
  steps: Step[]
}

type ManualSection = {
  id: string
  icon: typeof Users
  title: string
  summary: string
  pro?: boolean
  steps: Step[]
  subsections?: Subsection[]
  note?: string
}

const sections: ManualSection[] = [
  {
    id: "getting-started",
    icon: CheckCircle2,
    title: "Getting started",
    summary: "A quick path from an empty account to your first paid invoice.",
    steps: [
      {
        label: "Sign in and land on the Dashboard",
        detail:
          "This is your home screen. Every other area is one click away in the left sidebar (or the menu button on mobile).",
      },
      {
        label: "Set up your branding in Settings",
        detail:
          "Upload your logo and enter your company name, address and currency so your PDFs look professional from the first document.",
      },
      {
        label: "Add your customers",
        detail:
          "Create the people and companies you work with. You can also add a customer on the fly while writing a quote or invoice.",
      },
      {
        label: "Create a quote, then convert it to an invoice",
        detail:
          "Send the quote as a PDF, and when the customer accepts, convert it straight to an invoice — nothing is retyped.",
      },
      {
        label: "Already have records elsewhere?",
        detail:
          "Use Import to bring your existing spreadsheets in, then work through the reports.",
      },
    ],
  },
  {
    id: "dashboard",
    icon: BarChart3,
    title: "Dashboard",
    summary: "Your command centre — the numbers that matter and recent activity.",
    steps: [
      {
        label: "Check the four cards",
        detail:
          "Total Customers, Active Quotes, Outstanding Invoices and Upcoming Reminders give you an instant snapshot of the business.",
      },
      {
        label: "Read Recent Activity",
        detail:
          "The bottom panel lists the documents you created, sent, updated or deleted, each with a status pill and a date.",
      },
      {
        label: "Jump straight to work",
        detail:
          "Use the sidebar to open any section. Nothing on the Dashboard is editable — it is read-only.",
      },
    ],
  },
  {
    id: "customers",
    icon: Users,
    title: "Customers",
    summary: "Keep every lead, prospect and client in one searchable list.",
    steps: [
      {
        label: "Open Customers",
        detail:
          "The table lists Name, Email, Phone, Status and the date added. Use Export CSV to download the list.",
      },
      {
        label: "Add a customer",
        detail:
          "Click Add Customer. First Name and Last Name are required; Email, Phone, Company, Status and Notes are optional. Click Create Customer.",
      },
      {
        label: "Open a customer",
        detail:
          "Click a name to see their details and every Quote, Invoice and Reminder linked to them.",
      },
      {
        label: "Set a VAT preference",
        detail:
          "On the customer page click Edit, then set VAT Rate (%) and tick VAT Registered. New quotes and invoices for this customer pre-fill these values — you can still change them on each document.",
      },
      {
        label: "Edit or delete",
        detail:
          "Use Edit to change details, or Delete and confirm with Yes, delete.",
      },
    ],
    note: "Statuses run Lead → Prospect → Client → Inactive. Keeping them current keeps your lists and reports accurate.",
  },
  {
    id: "quotes",
    icon: FileText,
    title: "Quotes",
    summary: "Build a quote line by line and send a professional PDF.",
    pro: true,
    steps: [
      {
        label: "Start a quote",
        detail: "Open Quotes and click New Quote.",
      },
      {
        label: "Choose the customer",
        detail:
          "Pick a customer from the Customer dropdown, or click New Customer to add one without leaving the page. Their VAT preference pre-fills the tax rate.",
      },
      {
        label: "Fill in the details",
        detail:
          "Set Valid Until (defaults to 30 days), Currency and Title, and add an optional Description.",
      },
      {
        label: "Add line items",
        detail:
          "Click Add Item and enter a Description, Quantity and Unit Price for each line. Long descriptions expand automatically. Use the trash icon to remove a line.",
      },
      {
        label: "Check the totals",
        detail:
          "The Tax (%) field and the Subtotal, Tax and Total figures update as you type. Adjust the tax rate if needed.",
      },
      {
        label: "Save",
        detail: "Click Create Quote.",
      },
      {
        label: "Send it",
        detail:
          "Open the quote and click Send to email the PDF to your customer. Click PDF at any time to preview or download it.",
      },
      {
        label: "Convert to an invoice",
        detail:
          "Once the quote is sent or accepted, click Convert to Invoice — every line is copied across.",
      },
    ],
    note: "Creating and sending quotes is available on every plan. Editing an existing quote is a Pro feature.",
  },
  {
    id: "invoices",
    icon: Receipt,
    title: "Invoices",
    summary: "Raise invoices, send them, and track what you are owed.",
    pro: true,
    steps: [
      {
        label: "Start an invoice",
        detail: "Open Invoices and click New Invoice.",
      },
      {
        label: "Choose the customer",
        detail:
          "Select the customer; their VAT preference pre-fills the Tax Rate.",
      },
      {
        label: "Set the due date",
        detail:
          "Pick a preset (7, 14 or 30 days from the invoice date) or choose Pick a specific date.",
      },
      {
        label: "Add the details and lines",
        detail:
          "Set Currency, Title and Description, then click Add Item for each line (Quantity and Unit Price).",
      },
      {
        label: "Set tax and check the totals",
        detail:
          "Enter the Tax Rate (%) — Subtotal, Tax and Total update automatically.",
      },
      {
        label: "Save",
        detail: "Click Create Invoice.",
      },
      {
        label: "Send",
        detail: "Open the invoice and click Send to email the PDF.",
      },
      {
        label: "Mark as paid",
        detail:
          "When payment arrives, click Mark as Paid. Invoices past their due date show as overdue automatically.",
      },
    ],
    note: "Editing an existing invoice is a Pro feature. Once an invoice is marked paid it can only be edited by the account owner.",
  },
  {
    id: "reminders",
    icon: Bell,
    title: "Reminders",
    summary: "Never miss a follow-up.",
    steps: [
      {
        label: "Open Reminders",
        detail:
          "The list shows Title, Customer, Scheduled At and Status.",
      },
      {
        label: "Create one",
        detail:
          "Click New Reminder. Enter a Title and a Scheduled At date and time, and optionally link a Customer, Quote or Invoice.",
      },
      {
        label: "Save",
        detail:
          "Click Create Reminder. It appears in the list and on the Dashboard's Upcoming Reminders card.",
      },
    ],
  },
  {
    id: "expenses",
    icon: Coins,
    title: "Expenses",
    summary: "Record costs so reports show what you actually took home.",
    steps: [
      {
        label: "Pick a month",
        detail:
          "Open Expenses and use the Month and Year selectors. The card shows Spent in that month and how many expenses are recorded.",
      },
      {
        label: "Add an expense",
        detail:
          "Click Add an expense. Set the Date, Category (pick a suggestion or type your own), Amount (£) and an optional Description.",
      },
      {
        label: "Save",
        detail: "Click Add expense.",
      },
      {
        label: "Remove one",
        detail: "Use the trash icon on a row and confirm.",
      },
    ],
    note: "Expenses feed the Costs figures in the Sales, Month-End and Tax reports.",
  },
  {
    id: "reports",
    icon: Landmark,
    title: "Reports",
    summary: "Sales, month-end and UK tax reports built from your real data.",
    pro: true,
    steps: [],
    subsections: [
      {
        title: "Tax Report",
        steps: [
          {
            label: "Open Tax Report",
            detail:
              "See Paid income, Expenses, Taxable profit and Estimated income tax for the tax year, plus the UK Income Tax Bands table and your Making Tax Digital schedule.",
          },
          {
            label: "Try the What-if Estimator",
            detail:
              "Drag the Annual income and Deductible expenses sliders to see Taxable income, Estimated income tax and your Effective rate.",
          },
        ],
      },
      {
        title: "Sales Report",
        steps: [
          {
            label: "Open Sales Report",
            detail:
              "Pick a preset (This month, Last month, Last 3 months, This year or All time), or set From/To dates and a Customer, then click Run Report.",
          },
          {
            label: "Read the cards and table",
            detail:
              "Quoted, Invoiced, Paid, Outstanding, Costs and Gross profit, with a per-customer breakdown and cost bars. Click Export CSV to download.",
          },
        ],
      },
      {
        title: "Month-End Report",
        steps: [
          {
            label: "Open Month-End Report",
            detail:
              "Choose a Month and an optional Customer, then click Run Report.",
          },
          {
            label: "Review and export",
            detail:
              "See Quoted, Invoiced, Collected, Outstanding at month end, Costs and Gross profit, plus cost and customer tables. Export CSV to hand to your accountant.",
          },
        ],
      },
      {
        title: "Report Emails",
        steps: [
          {
            label: "Open Report Emails and schedule one",
            detail: "Click New report subscription.",
          },
          {
            label: "Choose the report and frequency",
            detail:
              "Pick Sales or Month-End and a frequency (Daily, Weekly or Monthly). Month-End is always sent on the last day of the month.",
          },
          {
            label: "Set the day and recipient",
            detail:
              "For weekly, pick a Day of week; for monthly, pick a Day of month (1–28). Enter the Send report to email and submit.",
          },
          {
            label: "Manage subscriptions",
            detail:
              "Use Pause or Resume, or the trash icon, on any subscription in the list.",
          },
        ],
      },
    ],
    note: "All reports are Pro features.",
  },
  {
    id: "import",
    icon: Upload,
    title: "Import",
    summary: "Bring your existing spreadsheets in, safely and in one go.",
    pro: true,
    steps: [
      {
        label: "Choose what you are importing",
        detail:
          "Open Import History (sidebar) and select Invoices or Quotes.",
      },
      {
        label: "Upload your spreadsheet",
        detail:
          "Drag and drop, or click Choose files (or Choose a folder). Accepts .xlsx, .xlsm and .csv, up to 200 files. Tick My amounts are already in pence if your prices are stored in pence.",
      },
      {
        label: "Review the mapping",
        detail:
          "MicroCRM auto-detects your columns. Correct any Column mapping, set the VAT rate for the whole import, and optionally tick Mark every document as paid.",
      },
      {
        label: "Check the preview",
        detail:
          "The preview table shows exactly what will be created; duplicate references and rejected files are flagged before anything is written.",
      },
      {
        label: "Import",
        detail:
          "Click Import N invoices/quotes. When it finishes you'll see how many documents and new customers were created — click View invoices/quotes or Import more files.",
      },
    ],
    note: "Import is a Pro feature.",
  },
  {
    id: "activity",
    icon: History,
    title: "Activity & restore",
    summary: "See what changed, and undo a deletion within 10 days.",
    pro: true,
    steps: [
      {
        label: "Open Activity",
        detail:
          "Entries for the last 10 days are grouped by day, each with a created, updated, deleted or restored badge and a time.",
      },
      {
        label: "Restore something",
        detail:
          "Find a deleted entry and click Restore. You can also restore from the banner at the top of the Quotes and Invoices lists (click Show deleted, then Restore).",
      },
    ],
    note: "Restore works for 10 days after deletion. The Activity log is a Pro feature.",
  },
  {
    id: "settings",
    icon: Settings,
    title: "Settings & branding",
    summary: "Put your logo and details on every PDF you send.",
    steps: [
      {
        label: "Open Settings",
        detail:
          "This is where your branding lives — used across quotes, invoices and reports.",
      },
      {
        label: "Upload your logo",
        detail:
          "Click Upload. A PNG or JPG around 400px wide works best.",
      },
      {
        label: "Fill in your details",
        detail:
          "Company Name (required), Address, Phone, Contact Email, Currency and Website.",
      },
      {
        label: "Save",
        detail:
          "Click Save Settings. Your logo and details appear on every PDF from now on.",
      },
    ],
  },
  {
    id: "billing",
    icon: Landmark,
    title: "Billing",
    summary: "Manage your plan and payment method.",
    steps: [
      {
        label: "Open Billing",
        detail: "See your Current Plan (Free or Pro).",
      },
      {
        label: "Upgrade",
        detail:
          "Click Upgrade to Pro to open Stripe Checkout — your first 3 months are free.",
      },
      {
        label: "Manage or downgrade",
        detail:
          "Click Manage Subscription to change payment details, cancel or resume in the Stripe portal. Use Downgrade to return to Free.",
      },
    ],
  },
]

function StepList({ steps }: { steps: Step[] }) {
  return (
    <ol className="space-y-4">
      {steps.map((step, index) => (
        <li key={step.label} className="flex gap-3">
          <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            {index + 1}
          </span>
          <div className="space-y-0.5">
            <p className="text-sm font-medium leading-6">{step.label}</p>
            {step.detail && (
              <p className="text-sm leading-6 text-muted-foreground">
                {step.detail}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  )
}

export default async function ManualPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link href="/" className="text-lg font-bold tracking-tight">
            MicroCRM
          </Link>
          <nav className="flex items-center gap-4">
            <Link
              href="/guide"
              className="hidden text-sm font-medium text-muted-foreground hover:text-foreground sm:block"
            >
              Product Tour
            </Link>
            {user ? (
              <>
                <span className="hidden text-sm text-muted-foreground sm:block">
                  {user.email}
                </span>
                <Link
                  href="/dashboard"
                  className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                >
                  Dashboard
                </Link>
              </>
            ) : (
              <>
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
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-3xl px-4 py-16 text-center">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Step-by-step manual
          </h1>
          <p className="mx-auto mt-4 text-lg text-muted-foreground">
            Follow the exact clicks for every part of the app — from your first
            customer to month-end reports.
          </p>
          <div className="mt-8 flex items-center justify-center gap-4">
            <Link
              href={user ? "/dashboard" : "/signup"}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
            >
              {user ? "Back to Dashboard" : "Start Free"}
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/guide"
              className="rounded-md border border-border bg-background px-6 py-3 text-sm font-semibold hover:bg-muted"
            >
              See the Product Tour
            </Link>
          </div>
        </section>

        <nav aria-label="Manual sections" className="mx-auto max-w-5xl px-4 pb-8">
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
            className="scroll-mt-4 border-t border-border py-12"
          >
            <div className="mx-auto max-w-3xl px-4">
              <h2 className="flex flex-wrap items-center gap-2 text-2xl font-bold tracking-tight">
                <section.icon className="h-6 w-6 text-primary" />
                {section.title}
                {section.pro && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                    Pro
                  </span>
                )}
              </h2>
              <p className="mt-3 text-muted-foreground">{section.summary}</p>

              {section.steps.length > 0 && (
                <div className="mt-6">
                  <StepList steps={section.steps} />
                </div>
              )}

              {section.subsections?.map((sub) => (
                <div key={sub.title} className="mt-8">
                  <h3 className="flex items-center gap-2 text-lg font-semibold">
                    <BookOpen className="h-4 w-4 text-primary" />
                    {sub.title}
                  </h3>
                  <div className="mt-4">
                    <StepList steps={sub.steps} />
                  </div>
                </div>
              ))}

              {section.note && (
                <p className="mt-6 rounded-md border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
                  {section.note}
                </p>
              )}
            </div>
          </section>
        ))}

        <section className="border-t border-border py-16">
          <div className="mx-auto max-w-3xl px-4 text-center">
            <h2 className="text-2xl font-bold tracking-tight">
              {user ? "That's everything" : "Ready to try it?"}
            </h2>
            <p className="mt-3 text-muted-foreground">
              {user
                ? "Head back to your dashboard and put it into practice."
                : "90 days free on the Free plan. No card required."}
            </p>
            <Link
              href={user ? "/dashboard" : "/signup"}
              className="mt-6 inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
            >
              {user ? "Back to Dashboard" : "Get Started"}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-6">
        <div className="mx-auto max-w-5xl px-4 text-center text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} MicroCRM. All rights reserved.
        </div>
      </footer>
    </div>
  )
}
