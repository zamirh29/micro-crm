-- Record-keeping dates for invoices and quotes so a super admin can correct
-- when a document was actually issued, sent and settled.

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;

-- Backfill sent dates from the first recorded "sent" activity, falling back to
-- the document's last update time. Drafts are left blank on purpose.
UPDATE public.invoices i
SET sent_at = COALESCE(
      (
        SELECT min(a.created_at)
        FROM public.activity_log a
        WHERE a.entity = 'invoice'
          AND a.entity_id = i.id
          AND a.label LIKE '% sent'
      ),
      i.updated_at
    )
WHERE i.sent_at IS NULL
  AND i.status <> 'draft';

UPDATE public.quotes q
SET sent_at = COALESCE(
      (
        SELECT min(a.created_at)
        FROM public.activity_log a
        WHERE a.entity = 'quote'
          AND a.entity_id = q.id
          AND a.label LIKE '% sent'
      ),
      q.updated_at
    )
WHERE q.sent_at IS NULL
  AND q.status <> 'draft';

UPDATE public.quotes q
SET accepted_at = COALESCE(
      (
        SELECT min(a.created_at)
        FROM public.activity_log a
        WHERE a.entity = 'quote'
          AND a.entity_id = q.id
          AND a.label LIKE '%accepted%'
      ),
      q.updated_at
    )
WHERE q.accepted_at IS NULL
  AND q.status = 'accepted';

-- Legacy paid invoices that predate the paid_at column.
UPDATE public.invoices
SET paid_at = updated_at
WHERE status = 'paid'
  AND paid_at IS NULL;