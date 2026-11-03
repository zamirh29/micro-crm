export interface Contact {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  status: 'lead' | 'prospect' | 'client' | 'inactive';
  tax_rate: number | null;
  vat_registered: boolean;
  created_at: string;
}

export interface ContactBrief {
  first_name: string;
  last_name: string;
  company: string | null;
  email: string | null;
}

export interface QuoteItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
}

export interface Quote {
  id: string;
  number: string;
  title: string;
  description: string | null;
  status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired';
  currency: string;
  tax_rate: number;
  subtotal: number;
  tax_amount: number;
  total: number;
  valid_until: string | null;
  notes: string | null;
  sent_at: string | null;
  accepted_at: string | null;
  created_at: string;
  contact_id: string;
  contacts?: ContactBrief | null;
  quote_items?: QuoteItem[];
}

export interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
}

export interface Invoice {
  id: string;
  number: string;
  title: string;
  description: string | null;
  status: 'draft' | 'sent' | 'paid' | 'overdue';
  currency: string;
  tax_rate: number;
  subtotal: number;
  tax_amount: number;
  total: number;
  due_date: string | null;
  paid_at: string | null;
  sent_at: string | null;
  notes: string | null;
  created_at: string;
  contact_id: string;
  contacts?: ContactBrief | null;
  invoice_items?: InvoiceItem[];
}

export interface ActivityItem {
  id: string;
  type: 'contact' | 'quote' | 'invoice';
  title: string;
  subtitle: string;
  status?: string;
  created_at: string;
}

export interface DashboardData {
  counts: {
    customers: number;
    activeQuotes: number;
    outstandingInvoices: number;
    pendingReminders: number;
  };
  activities: ActivityItem[];
}

export interface SalesRow {
  contactId: string;
  name: string;
  company: string | null;
  quoteCount: number;
  quotedTotal: number;
  invoiceCount: number;
  invoicedTotal: number;
  paidTotal: number;
  unpaidTotal: number;
}

export interface SalesReport {
  label: string;
  rows: SalesRow[];
  totals: SalesRow;
}

export interface Expense {
  id: string;
  incurred_on: string;
  category: string;
  description: string | null;
  amount: number;
  created_at: string;
}

export type ActivityAction = 'created' | 'updated' | 'deleted' | 'restored';
export type ActivityEntity = 'contact' | 'quote' | 'invoice' | 'reminder';

export interface ActivityLogEntry {
  id: string;
  org_id: string;
  user_id: string | null;
  action: ActivityAction;
  entity: ActivityEntity;
  entity_id: string | null;
  label: string;
  payload: Record<string, unknown> | null;
  restored: boolean;
  restored_at: string | null;
  created_at: string;
}

export interface ActivityResponse {
  logs: ActivityLogEntry[];
  windowDays: number;
}

export type ImportKind = 'invoice' | 'quote';

export interface ImportLineItem {
  description: string;
  quantity: number;
  /** Pence, as stored in the database. */
  unitPrice: number;
  /** Pence. */
  total: number;
}

export interface ImportDraft {
  rowNumber: number;
  sourceFile?: string;
  originalNumber: string;
  customerName: string;
  customerEmail: string;
  customerCompany: string;
  title: string;
  documentDate: string | null;
  sentDate: string | null;
  dueDate: string | null;
  paidDate: string | null;
  acceptedDate: string | null;
  validUntil: string | null;
  status: string | null;
  items: ImportLineItem[];
  notes: string;
  currency: string;
  warnings: string[];
  error: string | null;
}

export interface ImportSheet {
  id: number;
  fileName: string;
  headers: string[];
  drafts: ImportDraft[];
  autoDetected: Record<string, number>;
  grid: string[][];
  truncated: boolean;
}

export interface ImportParseResponse {
  sheets: ImportSheet[];
  rejected: { fileName: string; reason: string }[];
}

export interface ImportOutcome {
  created: number;
  skipped: number;
  createdContacts: number;
  createdInvoices: number;
  createdQuotes: number;
  errors: {
    rowNumber: number;
    originalNumber: string;
    sourceFile?: string;
    reason: string;
  }[];
}

export interface VatFigures {
  vatDueSales: number;
  vatDueAcquisitions: number;
  totalVatDue: number;
  vatReclaimedCurrPeriod: number;
  netVatDue: number;
  totalValueSalesExVAT: number;
  totalValuePurchasesExVAT: number;
  totalValueGoodsSuppliedExVAT: number;
  totalAcquisitionsExVAT: number;
  invoiceCount: number;
  expenseCount: number;
}

export interface HmrcObligation {
  periodKey: string;
  start: string;
  end: string;
  due: string;
  status: 'O' | 'F' | string;
  received?: string;
  figures: VatFigures | null;
}

export interface HmrcSubmission {
  period_key: string;
  period_from: string | null;
  period_to: string | null;
  submitted_at: string;
  receipt: { formBundleNumber?: string } | null;
}

export interface HmrcConnection {
  vrn: string;
  environment: 'sandbox' | 'production' | string;
  connectedAt: string;
}

export interface HmrcStatus {
  configured: boolean;
  environment: 'sandbox' | 'production' | string;
  redirectUri: string;
  vat: {
    vatNumber: string | null;
    vatRegistered: boolean;
  };
  connection: HmrcConnection | null;
  obligations: HmrcObligation[];
  obligationsError: string | null;
  submissions: HmrcSubmission[];
}
