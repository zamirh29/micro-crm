export type ContactStatus = "lead" | "prospect" | "client" | "inactive"
export type QuoteStatus = "draft" | "sent" | "accepted" | "rejected" | "expired"
export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue"
export type ReminderStatus = "pending" | "sent" | "completed"
export type MembershipRole = "owner" | "admin" | "member" | "viewer"

export interface Organization {
  id: string
  name: string
  created_at: string
}

export interface Membership {
  user_id: string
  org_id: string
  role: MembershipRole
}

export interface Profile {
  id: string
  email: string
  full_name: string | null
  stripe_customer_id: string | null
  created_at: string
}

export interface Contact {
  id: string
  org_id: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  company: string | null
  status: ContactStatus
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Quote {
  id: string
  org_id: string
  contact_id: string
  number: string
  title: string
  description: string | null
  status: QuoteStatus
  subtotal: number
  tax_rate: number
  tax_amount: number
  total: number
  currency: string
  valid_until: string
  reminder_sent: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

export interface QuoteItem {
  id: string
  quote_id: string
  description: string
  quantity: number
  unit_price: number
  total: number
}

export interface Invoice {
  id: string
  org_id: string
  contact_id: string
  quote_id: string | null
  number: string
  title: string
  description: string | null
  status: InvoiceStatus
  subtotal: number
  tax_rate: number
  tax_amount: number
  total: number
  currency: string
  due_date: string
  paid_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface InvoiceItem {
  id: string
  invoice_id: string
  description: string
  quantity: number
  unit_price: number
  total: number
}

export interface Reminder {
  id: string
  org_id: string
  contact_id: string | null
  quote_id: string | null
  invoice_id: string | null
  title: string
  description: string | null
  scheduled_at: string
  status: ReminderStatus
  created_at: string
}

export interface Subscription {
  id: string
  user_id: string
  org_id: string
  stripe_customer_id: string
  stripe_subscription_id: string | null
  status: "active" | "canceled" | "past_due" | "trialing"
  plan: "free" | "pro"
  current_period_end: string | null
  created_at: string
}

export interface Notification {
  id: string
  user_id: string
  type: string
  title: string
  body: string | null
  read: boolean
  data: Record<string, unknown> | null
  created_at: string
}

export interface Database {
  public: {
    Tables: {
      organizations: { Row: Organization }
      memberships: { Row: Membership }
      profiles: { Row: Profile }
      contacts: { Row: Contact }
      quotes: { Row: Quote }
      quote_items: { Row: QuoteItem }
      invoices: { Row: Invoice }
      invoice_items: { Row: InvoiceItem }
      reminders: { Row: Reminder }
      subscriptions: { Row: Subscription }
      notifications: { Row: Notification }
    }
  }
}
