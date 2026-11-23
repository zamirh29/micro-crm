const SYMBOLS: Record<string, string> = {
  GBP: '£',
  USD: '$',
  EUR: '€',
  AUD: 'A$',
  CAD: 'C$',
  NZD: 'NZ$',
  CHF: 'Fr ',
  JPY: '¥',
  CNY: '¥',
  INR: '₹',
  AED: 'AED ',
  SAR: 'SAR ',
  ZAR: 'R ',
  BRL: 'R$',
  MXN: 'Mex$',
  SGD: 'S$',
  HKD: 'HK$',
  NOK: 'kr ',
  SEK: 'kr ',
  DKK: 'kr ',
  PLN: 'zł ',
  TRY: '₺',
};

export function formatMoney(pence: number, currency = 'GBP'): string {
  const symbol = SYMBOLS[currency] ?? `${currency} `;
  return `${symbol}${(pence / 100).toFixed(2)}`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function monthLabel(ym: string): string {
  return new Date(`${ym}-01T00:00:00`).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  });
}

export function shiftMonth(ym: string, delta: number): string {
  const [year, month] = ym.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

type ContactName = {
  first_name: string;
  last_name?: string | null;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
};

/** Company-only contacts use the existing company column as their identity. */
export function isCompanyContact(contact: ContactName): boolean {
  const company = contact.company?.trim();
  return !!company && contact.first_name.trim() === company && !contact.last_name?.trim();
}

export function contactDisplayName(contact: ContactName): string {
  if (isCompanyContact(contact)) return contact.company!.trim();
  return `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim();
}

export function contactSubtitle(contact: ContactName): string {
  if (isCompanyContact(contact)) return contact.email ?? contact.phone ?? '';
  return contact.company?.trim() || contact.email || contact.phone || '';
}

export function contactInitials(contact: ContactName): string {
  if (isCompanyContact(contact)) return contact.company!.trim().slice(0, 2).toUpperCase();
  return `${contact.first_name?.[0] ?? ''}${contact.last_name?.[0] ?? ''}`.toUpperCase();
}
