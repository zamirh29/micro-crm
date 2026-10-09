alter table public.contacts
  add column if not exists tax_rate numeric(5,2) null,
  add column if not exists vat_registered boolean not null default false;
