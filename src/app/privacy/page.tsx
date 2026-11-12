import type { Metadata } from "next"
import Link from "next/link"

import { LegalLayout } from "@/components/legal-layout"

export const metadata: Metadata = {
  title: "Privacy policy · MicroCRM",
  description:
    "How DTMS HIRE LTD collects, uses and protects personal data in the MicroCRM web app and Android app.",
}

const UPDATED = "12 November 2026"
const CONTACT = "zamir@dtmstechsolutions.co.uk"

export default function PrivacyPage() {
  return (
    <LegalLayout title="Privacy policy" updated={UPDATED}>
      <p>
        MicroCRM is operated by DTMS HIRE LTD (&quot;we&quot;, &quot;us&quot;,
        &quot;our&quot;), a company registered in England and Wales. This policy
        explains what personal data we collect when you use the MicroCRM web app
        at <strong>crm.dtmstechsolutions.co.uk</strong> and the MicroCRM Android
        app (package <code>com.dtmstechsolutions.microcrm</code>), why we collect
        it, and the choices you have.
      </p>
      <p>
        We are the <strong>data controller</strong> for account and billing data.
        For the customer, invoice, quote and expense records you enter, you are
        the controller and we act as your <strong>processor</strong>.
      </p>

      <h2>1. Data we collect</h2>
      <ul>
        <li>
          <strong>Account data.</strong> Email address, password (stored as a
          salted hash by our authentication provider), and session tokens.
        </li>
        <li>
          <strong>Business profile.</strong> Business name, contact name, address,
          phone number, VAT number, business type, logo and branding settings that
          you choose to add.
        </li>
        <li>
          <strong>Customer records you create.</strong> Names, email addresses,
          phone numbers, postal addresses and VAT numbers of your own customers.
        </li>
        <li>
          <strong>Business records.</strong> Invoices, quotes, expenses, line
          items, payment statuses, reminders, notes and report settings.
        </li>
        <li>
          <strong>Activity log.</strong> A record of changes made in your account,
          kept so you can review and restore deleted or edited records. The log is
          retained for the period shown in the app (currently 10 days on Pro).
        </li>
        <li>
          <strong>Imported documents.</strong> When you import a spreadsheet or
          PDF, the file is read and only the extracted text is sent to our server
          to build a preview. When you photograph a document on Android, text
          recognition runs <strong>on your device</strong>; the photo itself is
          not uploaded. Imports are never saved until you confirm them.
        </li>
        <li>
          <strong>Billing data.</strong> Plan, subscription status and the
          identifiers needed to manage your subscription. Card and bank details
          are entered directly with Stripe (web) or Google Play (Android). We
          never see or store full payment card numbers.
        </li>
        <li>
          <strong>HMRC connection data.</strong> If you connect HMRC for Making Tax
          Digital, we store OAuth tokens and the VAT obligations and returns you
          submit through the app.
        </li>
        <li>
          <strong>Technical data.</strong> IP address, device type, app version
          and error information generated when your request reaches our servers.
          These are used for security and to keep the service running.
        </li>
      </ul>

      <h2>2. What we do not collect</h2>
      <ul>
        <li>We do not show advertising and we do not use advertising SDKs.</li>
        <li>
          We do not use third-party behavioural analytics or sell personal data.
        </li>
        <li>
          We do not request or use the Android advertising ID, and we do not
          collect your contacts list, calendar, precise location, SMS or call
          logs.
        </li>
        <li>
          We do not upload the photos or files you import; only the extracted text
          is transmitted, and only when you start an import.
        </li>
      </ul>

      <h2>3. Why we use your data</h2>
      <ul>
        <li>
          <strong>To provide the service</strong> — storing your records, creating
          invoices and quotes, sending emails you ask us to send, generating
          reports and exports. Legal basis: performance of a contract.
        </li>
        <li>
          <strong>To take payment and manage subscriptions</strong> — processing
          Pro subscriptions and honouring trials. Legal basis: performance of a
          contract.
        </li>
        <li>
          <strong>To keep the service secure</strong> — authentication, fraud
          prevention, rate limiting and troubleshooting. Legal basis: our
          legitimate interests in operating a safe service.
        </li>
        <li>
          <strong>To meet legal obligations</strong> — tax, accounting and HMRC
          reporting requirements. Legal basis: legal obligation.
        </li>
        <li>
          <strong>To contact you about the service</strong> — essential notices
          such as security or billing changes. Legal basis: performance of a
          contract. Marketing email is only sent with consent and can be withdrawn
          at any time.
        </li>
      </ul>

      <h2>4. Who we share data with</h2>
      <p>
        We use a small number of processors to run MicroCRM. They only process
        data on our instructions:
      </p>
      <ul>
        <li>
          <strong>Supabase</strong> — database, authentication and file storage.
        </li>
        <li>
          <strong>Vercel</strong> — application hosting and request logs.
        </li>
        <li>
          <strong>Resend</strong> — delivery of invoice, quote, reminder and report
          emails that you trigger.
        </li>
        <li>
          <strong>Stripe</strong> — subscription payments made on the web.
        </li>
        <li>
          <strong>Google Play and RevenueCat</strong> — in-app subscription
          purchases and entitlement validation on Android.
        </li>
        <li>
          <strong>HMRC</strong> — only when you connect and submit VAT returns
          through Making Tax Digital.
        </li>
      </ul>
      <p>
        We may also disclose data where required by law, to enforce our terms, or
        to protect the rights and safety of users. We never sell personal data.
        Some processors are based outside the UK; where data leaves the UK we rely
        on UK adequacy regulations or the UK International Data Transfer Addendum
        to standard contractual clauses.
      </p>

      <h2>5. Cookies and local storage</h2>
      <p>
        The web app uses strictly necessary cookies to keep you signed in through
        Supabase authentication. We do not use advertising or cross-site tracking
        cookies. The Android app stores your session token in the device&apos;s
        encrypted secure storage and does not use cookies for tracking.
      </p>

      <h2>6. How long we keep data</h2>
      <ul>
        <li>
          Account, customer and business records are kept while your account is
          open, and for up to 30 days after deletion so that accidental deletions
          can be recovered.
        </li>
        <li>
          Activity log entries expire automatically (currently 10 days for Pro
          accounts).
        </li>
        <li>
          Billing records are kept for six years to meet UK tax and accounting
          rules.
        </li>
        <li>
          Server logs are kept for a short period for security and diagnostics,
          and then deleted or aggregated.
        </li>
      </ul>

      <h2>7. Your rights</h2>
      <p>
        Under the UK GDPR you have the right to access, correct, delete, restrict
        or object to our processing of your personal data, and to data
        portability. You can export your records from the app at any time, and you
        can delete your account from Settings.
      </p>
      <p>
        To exercise any right, email{" "}
        <a href={`mailto:${CONTACT}`}>{CONTACT}</a>. We respond within one month.
        If you are unhappy with our response you can complain to the Information
        Commissioner&apos;s Office at{" "}
        <a href="https://ico.org.uk" target="_blank" rel="noreferrer">
          ico.org.uk
        </a>
        .
      </p>

      <h2>8. Security</h2>
      <p>
        Data is encrypted in transit using TLS and at rest by our database
        provider. Access is restricted by row-level security so that each account
        can only reach its own records. No system is perfectly secure, so please
        use a strong, unique password and keep your device locked.
      </p>

      <h2>9. Children</h2>
      <p>
        MicroCRM is a business tool intended for adults. It is not directed at
        children under 18 and we do not knowingly collect their personal data. If
        you believe a child has created an account, contact us and we will delete
        it.
      </p>

      <h2>10. Changes to this policy</h2>
      <p>
        If we make a material change we will update the date at the top of this
        page and, where appropriate, notify you in the app or by email. Continued
        use of MicroCRM after a change means you accept the updated policy.
      </p>

      <h2>11. Contact</h2>
      <p>
        DTMS HIRE LTD, 24 Trevose Road, London E17 4DR, United Kingdom.
        <br />
        Email: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
      </p>
      <p>
        See also our <Link href="/terms">terms of service</Link>.
      </p>
    </LegalLayout>
  )
}
