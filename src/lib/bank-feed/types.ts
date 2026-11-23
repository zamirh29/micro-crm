export type BankFeedProvider = "truelayer" | "csv" | "ofx"
export type BankFeedEnvironment = "sandbox" | "production" | "file"
export type PostingMode = "review" | "auto_exact" | "auto_all"
export type ReviewStatus =
  | "unreviewed"
  | "suggested"
  | "posted"
  | "ignored"
  | "needs_review"

export interface BankTokens {
  accessToken: string
  refreshToken: string
  expiresAt: Date
  scope: string
}

export interface BankConnectionRow {
  id: string
  org_id: string
  provider: BankFeedProvider
  environment: BankFeedEnvironment
  provider_connection_id: string | null
  provider_account_id: string | null
  provider_name: string | null
  bank_name: string
  account_name: string | null
  account_mask: string | null
  sort_code: string | null
  currency: string
  status: "active" | "expired" | "revoked" | "error"
  consent_expires_at: string | null
  posting_mode: PostingMode
  access_token: string | null
  refresh_token: string | null
  token_expires_at: string | null
  scope: string | null
  connected_by: string | null
  connected_at: string
  last_synced_at: string | null
  last_error: string | null
  revoked_at: string | null
  created_at: string
  updated_at: string
}

export interface PublicBankConnection {
  id: string
  provider: BankFeedProvider
  environment: BankFeedEnvironment
  bankName: string
  accountName: string | null
  accountMask: string | null
  sortCode: string | null
  currency: string
  status: BankConnectionRow["status"]
  consentExpiresAt: string | null
  postingMode: PostingMode
  connectedAt: string
  lastSyncedAt: string | null
  lastError: string | null
}

export interface BankTransactionRow {
  id: string
  org_id: string
  connection_id: string
  provider: BankFeedProvider
  provider_transaction_id: string | null
  normalised_provider_transaction_id: string
  booked_at: string
  description: string
  amount: string | number
  direction: "money_in" | "money_out" | "transfer"
  currency: string
  balance: string | number | null
  category_hint: string | null
  supplier_hint: string | null
  review_status: ReviewStatus
  posting_mode_at_import: PostingMode
  suggested_invoice_id: string | null
  linked_invoice_id: string | null
  linked_expense_id: string | null
  posted_at: string | null
  source_file_name: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface PublicBankTransaction {
  id: string
  connectionId: string
  provider: BankFeedProvider
  bookedAt: string
  description: string
  amount: number
  direction: "money_in" | "money_out" | "transfer"
  currency: string
  balance: number | null
  categoryHint: string | null
  supplierHint: string | null
  reviewStatus: ReviewStatus
  suggestedInvoiceId: string | null
  linkedInvoiceId: string | null
  linkedExpenseId: string | null
  postedAt: string | null
  sourceFileName: string | null
}

export interface NormalisedBankTransaction {
  providerTransactionId: string
  normalisedProviderTransactionId: string
  bookedAt: string
  description: string
  amount: number
  direction: "money_in" | "money_out" | "transfer"
  currency: string
  balance: number | null
  categoryHint: string | null
  supplierHint: string | null
  metadata: Record<string, unknown>
}
