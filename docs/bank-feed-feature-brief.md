# Bank feed feature brief — MicroCRM

Status: proposed, post-launch. This is not part of the current Google Play / App Store release.

## Goal

Let a user connect a supported bank account in read-only mode and pull settled bank transactions into MicroCRM. The UK is the first target market because MicroCRM already handles UK VAT/MTD, but the design must not be UK-only:

- **Money in** → match to unpaid or part-paid invoices and record payments received.
- **Money out** → create expenses/costs with supplier, category and VAT treatment.
- **Transfers/refunds/own-account movements** → identify and exclude from profit reporting.

The user must never enter bank login credentials into MicroCRM. Bank authentication and consent are handled by a regulated Open Banking / account-information provider appropriate to the user’s country.

## Global coverage strategy

App Store and Google Play availability is **not** the same as bank-feed availability. Bank connections are country-by-country and bank-by-bank, and no single aggregator covers every major bank worldwide. The feature must therefore be built as a **provider-agnostic layer**, with one normalised MicroCRM transaction model and multiple regional providers behind it.

### Provider shortlist

Published coverage claims change frequently, so final selection needs a commercial and technical verification step.

| Provider | Indicative strength | Notes |
| --- | --- | --- |
| Plaid | US, Canada, UK and Europe | Published coverage of 12,000+ institutions across roughly 20 countries. Strong US/Canada coverage. |
| TrueLayer | UK and Europe | Strong UK/EU Open Banking coverage; good fit for the first UK release. |
| Salt Edge | Broad international footprint | Claims 5,000+ banks across 50+ countries; useful for wider coverage. Verify business-account support and local permissions. |
| Yodlee / Envestnet | US, Canada, UK, Australia, Mexico and others | Claims 16,000+ global data sources. Some coverage may use credential-based aggregation; only use consented, compliant modes. |
| MX | US and Canada | Strong North American coverage; verify business accounts and pricing. |

### Selection criteria

- Country coverage and the specific **major banks** in that country.
- **Business account** support, not just personal accounts.
- Consent and revocation flows.
- Transaction history depth and webhook reliability.
- Data residency and cross-border transfer terms.
- Local regulatory permissions, including FCA/Open Banking in the UK and equivalent regimes elsewhere.
- Pricing per connection, per refresh and per user.
- Whether credentials are ever handled by the provider (avoid where possible).

### Feature gating

- Store the user’s country from the business profile or billing country.
- Show **Connect bank** only when a supported provider/bank exists for that country.
- Otherwise show the existing **CSV/OFX import** path, which remains available everywhere the app is sold.
- Maintain a `bank_coverage` table: `provider`, `country`, `bank_id`, `account_type`, `status`, `last_verified_at`.
- Treat coverage as a maintained data problem, not a one-off integration.

### Suggested rollout

1. **Phase 1 — UK:** one provider, major UK banks, business accounts, MTD/VAT mapping.
2. **Phase 2 — US, Canada and EU:** add providers with the strongest local coverage.
3. **Phase 3 — Australia, New Zealand and other supported markets:** add providers only where coverage and compliance are confirmed.
4. **Everywhere else:** CSV/OFX import and manual expenses remain available.

### Target vs rollout

The product target is global: UK, US, Canada, EU, Australia/New Zealand and other markets where the app can be downloaded. Live bank connections will still be phased because provider contracts, coverage and regulatory checks must be completed market by market.

### Recommended provider stack

- **Primary global adapter:** Plaid — broad US, Canada, UK and EU coverage through one API.
- **UK/EU alternative or backup:** TrueLayer — strong Open Banking coverage and UK/EU specialism.
- **Long-tail coverage:** Salt Edge or Yodlee — extended country/bank reach where the primary adapter has gaps.
- **Fallback everywhere:** CSV/OFX import and manual expenses.

Final provider choice depends on business-account coverage, pricing, webhook reliability, consent/revocation support and legal approval per region.

Do not promise “all major banks worldwide” publicly. Promise a growing, country-specific list that users can check before connecting.

## Posting modes

Set when the bank connection is created, and editable later in **Connection settings**.

| Mode | Behaviour | Notes |
| --- | --- | --- |
| `review` | Suggest matches; nothing changes records until the user confirms. | Default and recommended. |
| `auto_exact` | Auto-post only high-confidence matches. | Requires amount + reference/customer + date to align; part-payments still need review. |
| `auto_all` | Auto-post every settled transaction using inferred categories. | Advanced mode with explicit warning; transfers and refunds still need user mapping. |

When a user changes mode, the default is to apply it to **future and unreviewed transactions only**. Retroactively changing already-posted records must be a separate, explicit action with a confirmation screen.

## Suggested data model

```text
bank_connections
  id, user_id, provider, provider_connection_id
  bank_name, account_name, account_mask, sort_code, currency
  status, consent_expires_at, posting_mode
  created_at, updated_at, revoked_at

bank_transactions
  id, user_id, connection_id, provider_transaction_id
  booked_at, description, amount, direction
  status, balance, category_hint, supplier_hint
  posting_mode_at_import, review_status
  linked_invoice_id, linked_expense_id
  posted_at, created_at, updated_at

bank_coverage
  provider, country, bank_id, bank_name, account_types
  supports_business, supports_transactions, status
  last_verified_at
```

Provider access tokens must be encrypted server-side and never exposed to the client. All tables are scoped by `user_id` with Supabase RLS.

### Provider adapter interface

Each regional provider implements the same internal contract so the rest of MicroCRM stays provider-agnostic:

```text
BankProvider
  countries()
  supportedBanks(country)
  supportsBusinessAccounts(country, bankId)
  createConnection(user, bankId, country)
  exchangeToken(callback)
  getTransactions(connection, cursor)
  revokeConsent(connection)
  verifyWebhook(request)
  normaliseTransaction(rawTransaction)
```

Adding a new country should mean adding an adapter and coverage rows, not rewriting the invoice/expense matching logic.

## Matching rules

### Money in

1. Exact invoice reference found in the bank description.
2. Exact amount + customer name match.
3. Amount + date window + payer name fuzzy match.
4. Part-payment detection.
5. Overpayment flagged for user review.
6. Unmatched receipts stored as **unallocated money in**.

### Money out

1. Existing supplier match from payee name.
2. Category inherited from supplier or previous similar transaction.
3. VAT rate inferred, but editable before posting.
4. Receipts can be attached using the existing photo import flow.
5. Direct debits, standing orders and card payments are treated as normal outgoings unless marked as transfers.

### Safety checks

- Deduplicate by provider transaction ID.
- Ignore pending transactions by default.
- Detect transfers between the user’s own connected accounts.
- Idempotent webhook handling with signature verification.
- Keep an audit entry for every auto-posted or confirmed transaction.

## User interface

### Connect bank wizard

1. Choose provider/bank.
2. Read-only consent explanation.
3. Provider redirect.
4. Account selection confirmation.
5. Choose posting mode.
6. First sync status.

### Bank transactions screen

Tabs:

- **Review needed**
- **Money in**
- **Money out**
- **Transfers**
- **Posted**

Each row shows:

- Date, description, amount
- Suggested action and confidence
- Confirm / Edit / Ignore / Mark as transfer

### Connection settings

- Bank and masked account number
- Consent expiry and revoke action
- Posting mode selector
- Last sync time
- Change mode explanation

## Compliance and store changes

- Use an FCA-authorised Open Banking provider; never collect bank credentials.
- Confirm the provider’s permissions cover the intended branding and integration.
- Update privacy policy, terms, App Privacy labels and Play Data Safety for financial data and provider sharing.
- Add consent, revocation and deletion wording.
- Update reviewer notes to explain read-only access and that no credentials are collected in the app.

## Out of scope for v1

- Moving money or paying invoices from the bank connection.
- Bank-to-bank transfers initiated in MicroCRM.
- Overdraft/credit checks.
- Investment or savings accounts.
- Auto-matching without a visible audit trail.
