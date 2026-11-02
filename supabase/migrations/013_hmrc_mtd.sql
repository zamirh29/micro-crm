-- Accounting exports + HMRC Making Tax Digital support.

-- VAT registration details used by the VAT return preview and exports.
alter table public.organizations
  add column if not exists vat_number text,
  add column if not exists vat_registered boolean not null default false;

-- OAuth tokens for HMRC. Tokens are encrypted in the application before they
-- reach this table (AES-256-GCM), so a database dump alone cannot be replayed.
create table if not exists public.hmrc_connections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null unique references public.organizations(id) on delete cascade,
  environment text not null default 'sandbox'
    check (environment in ('sandbox', 'production')),
  vrn text not null,
  access_token text not null,
  refresh_token text not null,
  token_expires_at timestamptz not null,
  scope text not null default 'read:vat write:vat',
  connected_by uuid references auth.users(id) on delete set null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_hmrc_connections_updated_at on public.hmrc_connections;

create trigger set_hmrc_connections_updated_at
  before update on public.hmrc_connections
  for each row execute function public.handle_updated_at();

-- Deny-all RLS: only the service role key (server-side code) touches tokens.
alter table public.hmrc_connections enable row level security;

-- Audit trail of VAT returns submitted to HMRC.
create table if not exists public.hmrc_vat_submissions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  vrn text not null,
  period_key text not null,
  period_from date,
  period_to date,
  payload jsonb not null,
  receipt jsonb,
  submitted_at timestamptz not null default now(),
  submitted_by uuid references auth.users(id) on delete set null,
  unique (org_id, period_key)
);

create index if not exists hmrc_vat_submissions_org_idx
  on public.hmrc_vat_submissions (org_id, submitted_at desc);

alter table public.hmrc_vat_submissions enable row level security;
