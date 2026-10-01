-- Historical document import: keep the customer's own reference number and
-- flag rows that came from an import, so imported history is traceable.
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS original_number TEXT,
  ADD COLUMN IF NOT EXISTS is_imported BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS original_number TEXT,
  ADD COLUMN IF NOT EXISTS is_imported BOOLEAN NOT NULL DEFAULT false;

-- Backfill: for rows that already exist, adopt the current number as the
-- original reference so nothing is lost if it is ever re-imported.
UPDATE public.invoices SET original_number = number WHERE original_number IS NULL;
UPDATE public.quotes  SET original_number = number WHERE original_number IS NULL;

CREATE INDEX IF NOT EXISTS invoices_org_id_is_imported_idx
  ON public.invoices (org_id, is_imported);

CREATE INDEX IF NOT EXISTS quotes_org_id_is_imported_idx
  ON public.quotes (org_id, is_imported);