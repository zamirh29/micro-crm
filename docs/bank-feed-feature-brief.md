# Bank feed feature brief — MicroCRM

Status: proposed, post-launch. This is not part of the current Google Play / App Store release.

## Goal

Let a user connect a UK bank account in read-only mode and pull settled bank transactions into MicroCRM:

- **Money in** → match to unpaid or part-paid invoices and record payments received.
- **Money out** → create expenses/costs with supplier, category and VAT treatment.
- **Transfers/refunds/own-account movements** → identify and exclude from profit reporting.

The user must never enter bank login credentials into MicroCRM. Bank authentication and consent are handled by an FCA-authorised Open Banking provider.

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
```

Provider access tokens must be encrypted server-side and never exposed to the client. All tables are scoped by `user_id` with Supabase RLS.

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
