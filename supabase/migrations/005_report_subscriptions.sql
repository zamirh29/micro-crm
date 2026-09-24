CREATE TABLE public.report_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  report_type TEXT NOT NULL CHECK (report_type IN ('sales', 'month_end')),
  frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  day_of_week SMALLINT CHECK (day_of_week BETWEEN 0 AND 6),
  day_of_month SMALLINT CHECK (day_of_month BETWEEN 1 AND 28),
  email TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_run_key TEXT,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.report_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view report subscriptions in their organizations"
  ON public.report_subscriptions FOR SELECT
  USING (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "Members and above can insert report subscriptions"
  ON public.report_subscriptions FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM public.memberships
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'member')
    )
  );

CREATE POLICY "Members and above can update report subscriptions"
  ON public.report_subscriptions FOR UPDATE
  USING (
    org_id IN (
      SELECT org_id FROM public.memberships
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'member')
    )
  );

CREATE POLICY "Admins and owners can delete report subscriptions"
  ON public.report_subscriptions FOR DELETE
  USING (
    org_id IN (
      SELECT org_id FROM public.memberships
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE INDEX idx_report_subscriptions_org_id ON public.report_subscriptions(org_id);
CREATE INDEX idx_report_subscriptions_enabled ON public.report_subscriptions(enabled);