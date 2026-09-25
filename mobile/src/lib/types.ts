export interface Contact {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  status: 'lead' | 'prospect' | 'client' | 'inactive';
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
