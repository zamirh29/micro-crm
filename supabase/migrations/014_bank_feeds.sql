-- Read-only bank feeds (web). Provider access tokens are encrypted in the
-- application before they reach Postgres, and all rows are org-scoped.

create table if not exists public.bank_connections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('truelayer', 'csv', 'ofx')),
  environment text not null default 'sandbox'
    check (environment in ('sandbox', 'production', 'file')),
  provider_connection_id text,
  provider_account_id text,
  provider_name text,
  bank_name text not null,
  account_name text,
  account_mask text,
  sort_code text,
  currency text not null default 'GBP',
  status text not null default 'active'
    check (status in ('active', 'expired', 'revoked', 'error')),
  consent_expires_at timestamptz,
  posting_mode text not null default 'review'
    check (posting_mode in ('review', 'auto_exact', 'auto_all')),
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  scope text,
  connected_by uuid references auth.users(id) on delete set null,
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  last_error text,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists bank_connections_provider_account_key
  on public.bank_connections (
    org_id,
    provider,
    coalesce(provider_connection_id, ''),
    coalesce(provider_account_id, '')
  );

create index if not exists bank_connections_org_idx
  on public.bank_connections (org_id, status, connected_at desc);

drop trigger if exists set_bank_connections_updated_at on public.bank_connections;

create trigger set_bank_connections_updated_at
  before update on public.bank_connections
  for each row execute function public.handle_updated_at();

create table if not exists public.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  connection_id uuid not null references public.bank_connections(id) on delete cascade,
  provider text not null check (provider in ('truelayer', 'csv', 'ofx')),
  provider_transaction_id text,
  normalised_provider_transaction_id text not null,
  booked_at timestamptz not null,
  description text not null,
  amount numeric(14, 2) not null,
  direction text not null check (direction in ('money_in', 'money_out', 'transfer')),
  currency text not null default 'GBP',
  balance numeric(14, 2),
  category_hint text,
  supplier_hint text,
  review_status text not null default 'unreviewed'
    check (review_status in ('unreviewed', 'suggested', 'posted', 'ignored', 'needs_review')),
  posting_mode_at_import text not null default 'review'
    check (posting_mode_at_import in ('review', 'auto_exact', 'auto_all')),
  suggested_invoice_id uuid references public.invoices(id) on delete set null,
  linked_invoice_id uuid references public.invoices(id) on delete set null,
  linked_expense_id uuid references public.expenses(id) on delete set null,
  posted_at timestamptz,
  source_file_name text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists bank_transactions_dedupe_key
  on public.bank_transactions (org_id, provider, normalised_provider_transaction_id);

create index if not exists bank_transactions_org_review_idx
  on public.bank_transactions (org_id, review_status, booked_at desc);

create index if not exists bank_transactions_connection_idx
  on public.bank_transactions (connection_id, booked_at desc);

drop trigger if exists set_bank_transactions_updated_at on public.bank_transactions;

create trigger set_bank_transactions_updated_at
  before update on public.bank_transactions
  for each row execute function public.handle_updated_at();

create table if not exists public.bank_feed_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  connection_id uuid references public.bank_connections(id) on delete cascade,
  transaction_id uuid references public.bank_transactions(id) on delete set null,
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists bank_feed_events_org_idx
  on public.bank_feed_events (org_id, created_at desc);

create table if not exists public.bank_coverage (
  provider text not null,
  country text not null,
  bank_id text not null,
  bank_name text not null,
  account_types text[] not null default '{}',
  supports_business boolean not null default true,
  supports_transactions boolean not null default true,
  status text not null default 'live' check (status in ('live', 'sandbox', 'planned', 'unavailable')),
  last_verified_at timestamptz not null default now(),
  primary key (provider, country, bank_id)
);

insert into public.bank_coverage
  (provider, country, bank_id, bank_name, account_types, supports_business, supports_transactions, status)
values
  ('truelayer', 'GB', 'mock', 'TrueLayer Mock Bank', array['current'], true, true, 'sandbox'),
  ('truelayer', 'GB', 'all-open-banking', 'UK Open Banking banks', array['current', 'savings'], true, true, 'live'),
  ('csv', 'ALL', 'csv', 'CSV statement', array['current', 'savings', 'credit'], true, true, 'live'),
  ('ofx', 'ALL', 'ofx', 'OFX statement', array['current', 'savings', 'credit'], true, true, 'live')
on conflict (provider, country, bank_id) do nothing;

alter table public.bank_connections enable row level security;
alter table public.bank_transactions enable row level security;
alter table public.bank_feed_events enable row level security;
alter table public.bank_coverage enable row level security;

drop policy if exists "Users can manage their organization bank connections" on public.bank_connections;
create policy "Users can manage their organization bank connections"
  on public.bank_connections for all
  using (org_id in (select public.get_user_org_ids()))
  with check (org_id in (select public.get_user_org_ids()));

drop policy if exists "Users can manage their organization bank transactions" on public.bank_transactions;
create policy "Users can manage their organization bank transactions"
  on public.bank_transactions for all
  using (org_id in (select public.get_user_org_ids()))
  with check (org_id in (select public.get_user_org_ids()));

drop policy if exists "Users can view their organization bank feed events" on public.bank_feed_events;
create policy "Users can view their organization bank feed events"
  on public.bank_feed_events for select
  using (org_id in (select public.get_user_org_ids()));

drop policy if exists "Anyone can view bank feed coverage" on public.bank_coverage;
create policy "Anyone can view bank feed coverage"
  on public.bank_coverage for select
  using (true);
