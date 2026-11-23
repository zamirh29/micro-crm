# Bank feed web setup — UK / TrueLayer

The web bank feed is implemented but stays disabled until the database migration
and provider credentials are in place. Mobile is unchanged and on hold.

## 1. Run the Supabase migration

Open the Supabase SQL editor and run the full contents of:

```text
supabase/migrations/014_bank_feeds.sql
```

It creates:

- `bank_connections` — encrypted provider tokens, consent and posting mode
- `bank_transactions` — normalised transactions and posting links
- `bank_feed_events` — audit trail
- `bank_coverage` — provider/country coverage rows

All tables are org-scoped and protected by RLS. Tokens are AES-256-GCM encrypted
before they reach Postgres.

## 2. Create the TrueLayer app

1. Sign in at <https://console.truelayer.com/>.
2. Create an app for MicroCRM, or open the existing one.
3. Enable the Data API scopes:
   `info`, `accounts`, `balance`, `transactions`, `offline_access`.
4. Add this redirect URI exactly:

   ```text
   https://crm.dtmstechsolutions.co.uk/api/bank-feed/callback/truelayer
   ```

5. Copy the sandbox `client_id` and `client_secret`. Do not paste them into chat.

## 3. Add Vercel environment variables

In <https://vercel.com/dtms3/micro-crm/settings/environment-variables>, add:

```text
TRUELAYER_ENVIRONMENT=sandbox
TRUELAYER_CLIENT_ID=...
TRUELAYER_CLIENT_SECRET=...
TRUELAYER_REDIRECT_URI=https://crm.dtmstechsolutions.co.uk/api/bank-feed/callback/truelayer
BANK_FEED_ENCRYPTION_KEY=...
```

Generate the encryption key with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Keep the key private. If it changes, existing encrypted bank tokens can no longer
be decrypted and customers must reconnect.

For a first test, `sandbox` is enough and only TrueLayer's Mock Bank is available.
For real UK banks, complete TrueLayer's live approval/commercial checks, then
switch `TRUELAYER_ENVIRONMENT=production` and use the live app credentials.

## 4. Deploy and test

1. Commit and push the web changes.
2. Vercel deploys automatically.
3. Sign in to `https://crm.dtmstechsolutions.co.uk`.
4. Open **Bank feed** in the sidebar.
5. Click **Connect UK bank**.
6. In sandbox, choose the Mock Bank and approve the consent.
7. Return to MicroCRM, click **Sync all**, then review and post a transaction.

## Notes

- CSV/OFX import is available as the fallback path and needs no provider key.
- Transactions are imported as settled records only; pending transactions are not
  imported by this version.
- The default posting mode is `review`; nothing changes invoices or expenses until
  you confirm it.
- TrueLayer Data API v1 UK consent lasts 90 days. `offline_access` provides a
  refresh token, which must be used at least once during the first 30 days. The
  Sync action does this.
- Live webhooks are deferred: this version uses explicit/scheduled sync rather
  than relying on `Tl-Signature` webhook verification.
