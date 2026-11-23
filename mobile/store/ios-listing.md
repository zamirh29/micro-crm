# App Store Connect listing — MicroCRM

Bundle ID: `com.dtmstechsolutions.microcrm`
Version: 1.0.10
Developer: DTMS HIRE LTD (DTMS Tech)
Supporting email: enquiries@dtmstechsolutions.co.uk
Supporting phone: +44 7463 594253

> Status: drafting copy. App Store Connect app ID, Apple Team ID and the live App Store product ID still need to be confirmed in the dashboard.

## App information

- **Name (30 chars):** `MicroCRM: Invoicing & Tax`
- **Subtitle (30 chars):** `Invoices, quotes & tax reports`
- **Primary category:** Business
- **Secondary category:** Finance
- **Content rights:** We own or have rights to all content in the app.
- **Age rating:** 4+ — no objectionable content, no user-generated public content, no ads.
- **Licence agreement:** Standard
- **Export compliance:** Answer **No**. The app config sets `ITSAppUsesNonExemptEncryption` to `false`; MicroCRM uses standard HTTPS only.

## Promotional text (170 chars max)

```
Track customers, invoices, quotes, expenses and UK tax reports in one simple CRM built for businesses, sole traders and freelancers.
```

## Description (4000 chars max)

```
MicroCRM is a straightforward CRM and accounting app for UK businesses, sole traders and freelancers. Create customers, send invoices and quotes, track expenses, and see exactly where your money is going — without spreadsheet chaos.

BUILT FOR UK BUSINESSES
• Invoices and quotes with your own logo, payment terms and VAT settings
• Record payments and see what is still outstanding at a glance
• Track expenses and attach receipts
• Dashboard with income, expenses and profit for the current period

TAX AND HMRC
• Tax report with profit estimates and tax-year bands
• Month-end report for your bookkeeping
• HMRC Making Tax Digital support: connect your HMRC account and view open obligations
• Accounting exports (CSV/PDF) you can hand to your accountant

WORK FROM ANYWHERE
• Import customers and invoices from a spreadsheet or PDF
• Snap a photo of a receipt or invoice and pull the text out automatically
• Everything syncs with your MicroCRM account, so the web dashboard and the app stay in step

STAY ON TOP OF THINGS
• Payment reminders for overdue invoices
• Activity log with restore, so a wrong edit is never permanent
• Scheduled report emails (Pro)
• Multiple businesses and team access

PRIVACY AND CONTROL
• Your data stays in your own MicroCRM workspace
• Sign in with your existing MicroCRM account — no separate sign-up

Free plan is free forever and includes up to 50 customers, 20 quotes and 20 invoices per month. Pro is optional and unlocks unlimited records, automated reminders, tax and month-end reports, custom branding and priority support. Eligible new subscribers get a 3-month free trial.

Pro subscriptions on iOS are billed by Apple through the App Store. Payment is charged to your Apple Account at confirmation of purchase. Manage or cancel from Settings → Manage subscription in the app, or from your Apple ID subscription settings. Refunds are handled by Apple.

Privacy policy: https://crm.dtmstechsolutions.co.uk/privacy
Terms: https://crm.dtmstechsolutions.co.uk/terms
Support: https://crm.dtmstechsolutions.co.uk/guide
```

## Keywords (100 chars max)

```
crm,invoice,quotes,expenses,tax,hrmc,mtd,bookkeeping,small business,sole trader,freelancer
```

## URLs

- **Support URL:** https://crm.dtmstechsolutions.co.uk/guide
- **Privacy policy URL:** https://crm.dtmstechsolutions.co.uk/privacy
- **Terms of Use URL:** https://crm.dtmstechsolutions.co.uk/terms

All three URLs are public and do not require a MicroCRM login.

## App Privacy — draft answers

Confirm against the final App Store Connect questionnaire before submitting.

- **Data used to track you:** No. No tracking SDKs and no tracking domains.
- **Data linked to identity:** Name, email address, phone number, postal address, user ID, user content, purchase info, financial info (records you enter), product interaction.
- **Data not linked to identity:** Diagnostics such as IP address, device type and error logs.
- **Data not collected:** Precise location, contacts, health data, advertising identifiers, payment card numbers.
- **Data collection is optional:** Billing, HMRC connection and imported documents are only used when the user chooses those features.
- **Deletion:** Available by email request from the in-app Settings screen and at https://crm.dtmstechsolutions.co.uk/delete-account.

## Reviewer notes

```
Thank you for reviewing MicroCRM.

Sign-in is required. Please use:
Email: demo@demo.co.uk
Password: Ranjita2

The demo workspace contains sample customers, invoices, expenses and reports, so the main screens can be reviewed immediately.

• All screens except HMRC work with the demo login. HMRC features require a personal HMRC account and are optional; we have left them disconnected.
• Photo import uses the camera/photo library only after you tap the import option. Text recognition runs on the device; no photo is uploaded.
• Free plan is free forever and limited to 50 customers, 20 quotes and 20 invoices per month. No payment is needed to review the core app.
• Pro uses Apple in-app purchase through StoreKit/RevenueCat, with a 3-month free trial for eligible new subscribers. There is no external web billing link in the iOS app.
• To review the subscription sheet, use a sandbox Apple Account. Manage or cancel from Settings → Manage subscription.
• MicroCRM is a bookkeeping and tax-recording tool. It is not an accountant, tax agent, payment processor, lender or trading platform. No physical goods or services are sold in the app.
• Support: enquiries@dtmstechsolutions.co.uk or +44 7463 594253.
```

## Screenshots

The files currently in `screenshots/` are Google Play assets: 1394×2772 and padded to a 2:1 ratio. **Do not upload them to App Store Connect.**

Capture fresh iPhone screenshots from the iOS build, signed in as the demo user, in this order:

1. Dashboard — active quotes, unpaid invoices, reminders and quick-create actions.
2. Invoices — Draft / Sent / Paid / Overdue tabs with sample data.
3. Costs — expenses by category with the monthly total.
4. Tax report — 2026/27 paid income, expenses, taxable profit and UK bands.
5. Import — spreadsheet, text PDF or photo import options.
6. Tools — reminders, reports, activity, import, exports and HMRC shortcuts.

Use the iPhone display sizes offered by App Store Connect for this build. Keep the status bar clear and do not include real customer data.

## Pre-submit configuration still needed

1. Create/confirm the App Store Connect app record with bundle ID `com.dtmstechsolutions.microcrm`.
2. Create the auto-renewable subscription product (suggested product ID `pro_monthly`) with a 3-month introductory free trial.
3. Add the App Store app in RevenueCat, attach the product to the `dtms_crm_pro` entitlement, and add it as the monthly package on the `default` offering.
4. Set `EXPO_PUBLIC_REVENUECAT_IOS_KEY` to the live `appl_...` key in the EAS production environment.
5. Build with `npx eas-cli@latest build --platform ios --profile production --non-interactive --wait`, then submit to TestFlight.
6. Test purchase, restore and Manage subscription with a sandbox Apple Account before submitting for review.
