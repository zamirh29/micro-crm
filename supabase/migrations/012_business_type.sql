-- Business type for organisations: sole trader or a company structure.
alter table public.organizations
  add column if not exists business_type text not null default 'sole_trader';

-- Guarded constraint so the CHECK is present even if the column already existed.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'organizations_business_type_check'
      and conrelid = 'public.organizations'::regclass
  ) then
    alter table public.organizations
      add constraint organizations_business_type_check
      check (business_type in ('sole_trader', 'ltd', 'llp', 'plc', 'lbg'));
  end if;
end $$;
