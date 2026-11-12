import type { Metadata } from "next"
import Link from "next/link"

import { LegalLayout } from "@/components/legal-layout"

export const metadata: Metadata = {
  title: "Terms of service · MicroCRM",
  description:
    "The terms that govern use of the MicroCRM web app and Android app, provided by DTMS HIRE LTD.",
}

const UPDATED = "12 November 2026"
const CONTACT = "zamir@dtmstechsolutions.co.uk"

export default function TermsPage() {
  return (
    <LegalLayout title="Terms of service" updated={UPDATED}>
      <p>
        These terms are a legal agreement between you and DTMS HIRE LTD
        (&quot;we&quot;, &quot;us&quot;), a company registered in England and
        Wales at 24 Trevose Road, London E17 4DR. They cover the MicroCRM web app
        at <strong>crm.dtmstechsolutions.co.uk</strong> and the MicroCRM Android app
        (package <code>com.dtmstechsolutions.microcrm</code>).
      </p>
      <p>
        By creating an account or using MicroCRM you agree to these terms. If you
        do not agree, do not use the service.
      </p>

      <h2>1. What MicroCRM does</h2>
      <p>
        MicroCRM helps small businesses manage customers, quotes, invoices,
        expenses, reminders and UK tax reporting. It also offers spreadsheet, PDF
        and photo imports, accounting exports and Making Tax Digital features.
        Features may change as the product develops.
      </p>

      <h2>2. Not tax or legal advice</h2>
      <p>
        MicroCRM helps you record and report information. It is not an accountant,
        tax agent or law firm, and nothing in the app is tax, legal or financial
        advice. You remain responsible for the accuracy of your records and for
        any submission made to HMRC. Check figures with a qualified adviser before
        filing.
      </p>

      <h2>3. Your account</h2>
      <ul>
        <li>
          You must be at least 18 years old and able to enter into a contract.
        </li>
        <li>
          You must give accurate account details and keep your password secure.
          You are responsible for activity under your account.
        </li>
        <li>
          Tell us immediately at <a href={`mailto:${CONTACT}`}>{CONTACT}</a> if you
          believe your account has been compromised.
        </li>
        <li>One person or business per account unless we agree otherwise.</li>
      </ul>

      <h2>4. Free plan and Pro subscription</h2>
      <ul>
        <li>
          The free plan includes up to 50 customers, 20 quotes and 20 invoices per
          month and basic reminders.
        </li>
        <li>
          Pro costs <strong>£8 per month</strong> (or the price shown in your app
          store) and unlocks unlimited records, automated reminders, tax and
          month-end reports, custom branding, report emails, the 10-day activity
          log and priority support.
        </li>
        <li>
          New web subscribers may receive a free trial (currently 90 days). When
          the trial ends the subscription renews automatically at the then-current
          price unless you cancel first.
        </li>
        <li>
          Prices include VAT where applicable. We may change prices with
          reasonable notice; changes apply from your next renewal.
        </li>
      </ul>

      <h2>5. Billing, renewals and cancellation</h2>
      <ul>
        <li>
          <strong>Web subscriptions</strong> are billed by Stripe and renew
          automatically every month until cancelled. You can cancel at any time
          from Billing in the dashboard; access continues until the end of the
          paid period.
        </li>
        <li>
          <strong>Android subscriptions</strong> are billed by Google Play and
          renew automatically until cancelled in Google Play. Manage or cancel
          from the app&apos;s subscription settings or Google Play.
        </li>
        <li>
          Refunds are handled under the rules of the payment provider used. We do
          not control Google Play or Stripe refund decisions, but you can always
          contact us and we will help where we can.
        </li>
        <li>
          If a payment fails, Pro features may be suspended until payment is
          restored.
        </li>
      </ul>

      <h2>6. Your content and your customers&apos; data</h2>
      <ul>
        <li>
          You own the records you upload or create. You grant us a limited licence
          to store and process them only to provide the service.
        </li>
        <li>
          You are responsible for having a lawful basis to store your
          customers&apos; personal data in MicroCRM, and for responding to their
          requests about it.
        </li>
        <li>
          We act as your processor for that customer data, as described in our{" "}
          <Link href="/privacy">privacy policy</Link>.
        </li>
        <li>
          You can export your records at any time and delete your account from
          Settings.
        </li>
      </ul>

      <h2>7. Acceptable use</h2>
      <p>You must not:</p>
      <ul>
        <li>use MicroCRM for unlawful, fraudulent or deceptive activity;</li>
        <li>
          send spam or emails without the recipient&apos;s consent, or use the app
          to harass anyone;
        </li>
        <li>
          upload malware, attempt to access another account, or probe, scan or
          overload our systems;
        </li>
        <li>
          resell, sublicense or copy the service except as allowed by law;
        </li>
        <li>
          use automated means to extract data at a rate that affects other users.
        </li>
      </ul>
      <p>
        We may suspend or end access if you seriously or repeatedly break these
        terms, or if we are required to by law.
      </p>

      <h2>8. Imports and third-party services</h2>
      <p>
        Imports are provided as an aid. Always check extracted data before saving
        it. MicroCRM relies on third parties such as Supabase, Vercel, Resend,
        Stripe, Google Play, RevenueCat and HMRC; we are not responsible for
        outages or errors caused by those services, though we will work to restore
        service quickly.
      </p>

      <h2>9. Availability and changes</h2>
      <p>
        We aim to keep MicroCRM available but do not guarantee uninterrupted
        service. We may update, change or withdraw features, and will give
        reasonable notice of changes that materially reduce what you pay for. You
        may stop using the service at any time.
      </p>

      <h2>10. Our intellectual property</h2>
      <p>
        The MicroCRM name, software, design and documentation belong to us or our
        licensors. These terms do not transfer any ownership to you. You keep all
        rights in your own content and branding.
      </p>

      <h2>11. Liability</h2>
      <p>
        Nothing in these terms limits liability that cannot lawfully be limited,
        including for death or personal injury caused by negligence, or for
        fraud.
      </p>
      <p>
        Subject to that, we are not liable for loss of profit, loss of business,
        loss of anticipated savings, or indirect or consequential loss. Our total
        liability for any claim relating to the service is limited to the greater
        of the amount you paid us in the 12 months before the claim or £100. You
        are responsible for keeping your own backups and for verifying figures
        before submitting them to HMRC.
      </p>

      <h2>12. Ending the agreement</h2>
      <p>
        You may close your account at any time using the steps on our{" "}
        <Link href="/delete-account">delete account page</Link>. We may suspend or
        terminate your access for breach of these terms, non-payment, or where
        required by law. On closure we delete or anonymise your data in line with
        the retention periods in our <Link href="/privacy">privacy policy</Link>.
      </p>

      <h2>13. Governing law</h2>
      <p>
        These terms are governed by the laws of England and Wales, and the courts
        of England and Wales have exclusive jurisdiction over any dispute. If you
        live elsewhere in the UK, you may also bring proceedings in your local
        courts.
      </p>

      <h2>14. Contact</h2>
      <p>
        DTMS HIRE LTD, 24 Trevose Road, London E17 4DR, United Kingdom.
        <br />
        Email: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
      </p>
    </LegalLayout>
  )
}
