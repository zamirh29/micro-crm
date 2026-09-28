-- Business expenses / costs. Free on every plan; feeds the Pro tax report.
CREATE TABLE public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  incurred_on DATE NOT NULL DEFAULT CURRENT_DATE,
  category TEXT NOT NULL CHECK (char_length(category) BETWEEN 1 AND 50),
  description TEXT,
  amount INTEGER NOT NULL CHECK (amount >= 0),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX expenses_org_id_incurred_on_idx
  ON public.expenses (org_id, incurred_on DESC);

CREATE TRIGGER set_expenses_updated_at
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view expenses in their organizations"
  ON public.expenses FOR SELECT
  USING (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "Members and above can insert expenses"
  ON public.expenses FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM public.memberships
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'member')
    )
  );

CREATE POLICY "Members and above can update expenses"
  ON public.expenses FOR UPDATE
  USING (
    org_id IN (
      SELECT org_id FROM public.memberships
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'member')
    )
  );

CREATE POLICY "Admins and owners can delete expenses"
  ON public.expenses FOR DELETE
  USING (
    org_id IN (
      SELECT org_id FROM public.memberships
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );
