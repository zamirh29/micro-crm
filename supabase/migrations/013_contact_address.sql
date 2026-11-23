-- Postal address for a customer. A single free-text field keeps the customer
-- form simple and works for both people and companies in every country.
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS address TEXT;
