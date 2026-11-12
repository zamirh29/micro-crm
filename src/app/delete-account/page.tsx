import type { Metadata } from "next"

import { LegalLayout } from "@/components/legal-layout"

export const metadata: Metadata = {
  title: "Delete your account · MicroCRM",
  description:
    "How to request deletion of your MicroCRM account and the data stored with it.",
}

const UPDATED = "12 November 2026"
const CONTACT = "zamir@dtmstechsolutions.co.uk"

export default function DeleteAccountPage() {
  return (
    <LegalLayout title="Delete your account" updated={UPDATED}>
      <p>
        You can ask us to delete your MicroCRM account and the data stored with
        it at any time. This page explains how, and what is deleted or kept.
      </p>

      <h2>How to request deletion</h2>
      <ol className="space-y-3">
        <li>
          <strong>1.</strong> Email{" "}
          <a href={`mailto:${CONTACT}?subject=Delete%20my%20MicroCRM%20account`}>
            {CONTACT}
          </a>{" "}
          from the email address registered to your MicroCRM account.
        </li>
        <li>
          <strong>2.</strong> Use the subject line{" "}
          <strong>&quot;Delete my MicroCRM account&quot;</strong> and tell us
          whether you want the whole account deleted or only specific records.
        </li>
        <li>
          <strong>3.</strong> We confirm the request and delete the data within{" "}
          <strong>30 days</strong>. We may ask one verification question to make
          sure the request comes from the account owner.
        </li>
      </ol>
      <p>
        If you cannot access the registered mailbox, email us anyway and explain
        the situation; we will tell you what else we need.
      </p>

      <h2>What is deleted</h2>
      <ul>
        <li>Your profile, business details, logo and branding settings.</li>
        <li>
          Your customers, invoices, quotes, expenses, reminders, activity log,
          report subscriptions, imports and HMRC connection tokens.
        </li>
        <li>Your MicroCRM login, so the account can no longer be accessed.</li>
      </ul>

      <h2>What we keep</h2>
      <ul>
        <li>
          <strong>Billing records</strong> (plan, invoices and payment status) are
          kept for six years where UK tax and accounting law requires it. Card
          details are held by Stripe or Google Play, not by us, and are not part of
          your MicroCRM account.
        </li>
        <li>
          <strong>Backups</strong> may retain deleted data for a short period until
          they rotate; it is not used and is deleted on the normal backup cycle.
        </li>
        <li>
          <strong>Aggregated or anonymised statistics</strong> that cannot identify
          you may be kept.
        </li>
      </ul>

      <h2>Cancel a subscription first</h2>
      <p>
        Deleting your data does not automatically cancel a Pro subscription. Cancel
        it from Billing in the web dashboard (Stripe) or from Google Play
        subscriptions (Android) before requesting deletion, otherwise billing may
        continue.
      </p>

      <h2>Questions</h2>
      <p>
        See our <a href="/privacy">privacy policy</a> for how we handle personal
        data, or email{" "}
        <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
      </p>
    </LegalLayout>
  )
}
