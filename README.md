# MicroCRM

Micro-business CRM for sole traders: customers, quotes, invoices, payment
reminders, reports and PDF export, with a free plan and a Pro tier.

**Production:** https://crm.dtmstechsolutions.co.uk

Built with Next.js (App Router), Supabase (Postgres + Auth), Stripe, Resend and
Tailwind CSS. A native iOS/Android client lives in [`mobile/`](./mobile).

## Local development

```bash
cp .env.example .env.local   # then fill in your keys
npm install
npm run dev
```

Open http://localhost:3000. See [`.env.example`](./.env.example) for every
variable the app reads (Supabase, Stripe, Resend, `NEXT_PUBLIC_APP_URL`,
`CRON_SECRET`).

## Checks

```bash
npx tsc --noEmit                      # typecheck
npx eslint . --ext .ts,.tsx           # lint
npm run build                         # production build
```

## Deploy

Push to `main` — Vercel builds and deploys. `vercel.json` defines the two cron
jobs (daily invoice reminders at 09:00, weekly report emails at 18:00), both
authenticated with `CRON_SECRET`.

Database migrations are plain SQL in `supabase/migrations/` (001–006 applied).

## Install as an app (PWA)

The site is a [progressive web app](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps):
installable, launches in its own window without browser chrome, and keeps
working offline for previously visited screens.

### Android (Chrome / Samsung Internet)

1. Open https://crm.dtmstechsolutions.co.uk
2. Tap the **⋮** menu → **Add to Home screen** / **Install app**
3. Confirm — a MicroCRM icon appears on your home screen

### iPhone / iPad (Safari)

1. Open https://crm.dtmstechsolutions.co.uk
2. Tap the **Share** button (square with an arrow)
3. Scroll down and tap **Add to Home Screen** → **Add**

### Computer (Chrome / Edge / Brave)

1. Open https://crm.dtmstechsolutions.co.uk
2. Click the **install** icon at the right of the address bar (or **⋮** →
   **Install MicroCRM**)
3. The app opens in a standalone window

> iOS does not show the install option if the page is open in the in-app
> browser of another app — open Safari itself first.

### Offline behaviour (airplane mode)

- Pages you have already opened open instantly from the cache.
- Dashboard and report data are served from cache and shown normally.
- Anything you have not visited yet falls back to the offline screen.
- **Creating or editing records requires a connection** — mutations are never
  cached or queued, they fail with a clear offline message until you are back
  online.

## Mobile app

The native client (Expo SDK 57) is in [`mobile/`](./mobile/README.md).

```bash
cd mobile
npm install
npx expo start     # scan the QR code with Expo Go
```
